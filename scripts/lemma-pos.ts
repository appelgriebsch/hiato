/**
 * Lemma POS source map (ADR 0055 / #315). `pos` ships on pack lemmas from sources
 * Hiato already licenses — no new license surface:
 * - EN: `pos` column of the CEFR-J Vocabulary Profile 1.5 (A1–B2) and the
 *   Octanove C1/C2 profile CSV (both olp-en-cefrj).
 * - DE/ES/FR/IT: `word.pos` (Universal POS NOUN/VERB/ADJ/ADV) in wordhoard v0.1.0.
 * - PT: FrequencyWords `pt_50k` has no pos column and no other licensed PT pos
 *   source exists, so PT lemmas are exempt (scripts/data/pos-exempt.txt).
 *
 * `scripts/data/lemma-pos.json` is the committed, offline source of truth that
 * `packs:check` validates against (Hiato generated from the licensed sources,
 * like hunspell-verdicts.json). Rebuild it with `bun run scripts/build-lemma-pos.ts`
 * after a source refresh; apply it to the shipped packs with
 * `bun run scripts/apply-lemma-pos.ts`. Lemmas with no licensed pos source (the
 * pos-exempt.txt list) can additionally be filled by a gated Mistral fallback:
 * `bun run scripts/apply-lemma-pos.ts --fill-exempt` (local, MISTRAL_API_KEY, #339).
 */
import { Database } from 'bun:sqlite'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { nfcUpper } from './lemma-denylist'
import { foldKey } from './pack-select'
import { PACK_POS, isPackPos, type PackLang, type PackPos, type WordPack } from '../src/packs/schema'

export const DATA_DIR = path.join(import.meta.dir, 'data')
export const LEMMA_POS_PATH = path.join(DATA_DIR, 'lemma-pos.json')
export const POS_EXEMPT_PATH = path.join(DATA_DIR, 'pos-exempt.txt')
/**
 * #357: hand-reviewed POS corrections for lemmas whose licensed source pos is
 * wrong for the shipped gloss (e.g. wordhoard lists BLAU only as ADV, KOCHEN
 * with a spurious NOUN). Format: `lang|WORD|pos` + tab-separated reason.
 * Applied by posSourceInfo (so build-lemma-pos.ts keeps them on rebuild) and
 * consulted by checkLemmaPos alongside the committed map.
 */
export const POS_OVERRIDES_PATH = path.join(DATA_DIR, 'pos-overrides.txt')

export type PosOverride = { lang: string; word: string; pos: PackPos }

export function loadPosOverrides(file = POS_OVERRIDES_PATH): PosOverride[] {
  if (!existsSync(file)) return []
  const out: PosOverride[] = []
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    const t = line.trim()
    if (!t || t.startsWith('#')) continue
    const [head, reason] = t.split('\t')
    const parts = (head ?? '').split('|')
    const [lang, word, pos] = parts
    if (!lang || !word || !isPackPos(pos)) {
      throw new Error(`${file}: expected "lang|WORD|pos\treason", got ${JSON.stringify(t)} (${reason ?? ''})`)
    }
    out.push({ lang: lang.toLowerCase(), word: nfcUpper(word), pos })
  }
  return out
}

let posOverrides: Map<string, PackPos> | null = null

/** Overrides keyed `lang|NFCUPPER(word)`. */
export function posOverrideMap(file = POS_OVERRIDES_PATH): Map<string, PackPos> {
  if (posOverrides) return posOverrides
  const out = new Map<string, PackPos>()
  for (const o of loadPosOverrides(file)) out.set(`${o.lang}|${o.word}`, o.pos)
  posOverrides = out
  return out
}

export const CEFRJ_CSV_PATH = path.join(DATA_DIR, 'cefrj-vocabulary-profile-1.5.csv')
export const OCTANOVE_CSV_PATH = path.join(DATA_DIR, 'octanove-vocabulary-profile-c1c2-1.0.csv')
export const WORDHOARD_DB_PATH = path.join(DATA_DIR, 'wordhoard-v0.1.0.db')

/** wordhoard UPOS → PackPos (content words only). */
export const UPOS_TO_PACK_POS: Record<string, PackPos> = {
  NOUN: 'noun',
  VERB: 'verb',
  ADJ: 'adjective',
  ADV: 'adverb',
}

/** Deterministic pick when a word has several content POS at one level. */
export const POS_PRIORITY: readonly PackPos[] = ['noun', 'verb', 'adjective', 'adverb']

/** CEFR-J / Octanove CSV pos values are lowercase full names; map the content four. */
export function enCsvPosToPackPos(pos: string): PackPos | null {
  const p = pos.trim().toLowerCase()
  return (PACK_POS as readonly string[]).includes(p) ? (p as PackPos) : null
}

export function pickPos(candidates: readonly PackPos[]): PackPos | null {
  for (const p of POS_PRIORITY) {
    if (candidates.includes(p)) return p
  }
  return null
}

type PosSourceInfo = { pos: PackPos | null; reason: string }

let enSource: Map<string, Map<string, PackPos[]>> | null = null

function parseEnCsv(file: string, into: Map<string, Map<string, PackPos[]>>, levels: readonly string[]): void {
  if (!existsSync(file)) return
  const text = readFileSync(file, 'utf8')
  for (const line of text.trim().split('\n').slice(1)) {
    const [head, pos, cefrRaw] = line.split(',')
    const level = (cefrRaw || '').trim().toUpperCase()
    if (!levels.includes(level)) continue
    const p = enCsvPosToPackPos(pos || '')
    if (!p) continue
    // expand-packs indexes the first headword variant only; stay consistent.
    const w = (head || '').split('/')[0]?.trim()
    if (!w) continue
    const key = nfcUpper(w)
    let byLevel = into.get(key)
    if (!byLevel) {
      byLevel = new Map()
      into.set(key, byLevel)
    }
    const arr = byLevel.get(level) ?? []
    arr.push(p)
    byLevel.set(level, arr)
  }
}

/** EN: CEFR-J (A1–B2) + Octanove (C1–C2), keyed by nfcUpper headword, then level. */
function enPosSource(): Map<string, Map<string, PackPos[]>> {
  if (enSource) return enSource
  const into = new Map<string, Map<string, PackPos[]>>()
  parseEnCsv(CEFRJ_CSV_PATH, into, ['A1', 'A2', 'B1', 'B2'])
  parseEnCsv(OCTANOVE_CSV_PATH, into, ['C1', 'C2'])
  enSource = into
  return into
}

let wordhoardSource: Map<string, Map<string, string[]>> | null = null

/** wordhoard `word.pos` per language, keyed by nfcUpper lemma (all UPOS kept for reasons). */
function wordhoardPosSource(lang: string): Map<string, string[]> {
  if (!wordhoardSource) wordhoardSource = new Map()
  const cached = wordhoardSource.get(lang)
  if (cached) return cached
  const out = new Map<string, string[]>()
  if (existsSync(WORDHOARD_DB_PATH)) {
    const db = new Database(WORDHOARD_DB_PATH, { readonly: true })
    try {
      const rows = db
        .query(`SELECT lemma, pos FROM word WHERE lang = ?`)
        .all(lang) as { lemma: string; pos: string }[]
      for (const r of rows) {
        const key = nfcUpper(r.lemma)
        const arr = out.get(key) ?? []
        if (!arr.includes(r.pos)) arr.push(r.pos)
        out.set(key, arr)
      }
    } finally {
      db.close()
    }
  }
  wordhoardSource.set(lang, out)
  return out
}

function wordhoardInfo(lang: string, word: string): PosSourceInfo {
  const src = wordhoardPosSource(lang)
  const key = nfcUpper(word)
  let upos = src.get(key)
  if (!upos) {
    // ß/SS-style folds: fall back to the pack fold key.
    for (const [k, v] of src) {
      if (foldKey(lang as PackLang, k) === foldKey(lang as PackLang, word)) {
        upos = v
        break
      }
    }
  }
  if (!upos || upos.length === 0) return { pos: null, reason: 'not in wordhoard' }
  const content = upos.map((u) => UPOS_TO_PACK_POS[u]).filter((p): p is PackPos => !!p)
  if (content.length === 0) {
    return { pos: null, reason: `wordhoard pos ${upos.join('/')} is not a content word` }
  }
  return { pos: pickPos(content), reason: 'wordhoard' }
}

/**
 * Source POS for a pack lemma. EN prefers the row matching the pack's CEFR level.
 * PT has no licensed pos source — always exempt.
 */
export function posSourceInfo(lang: PackLang, cefr: string, word: string): PosSourceInfo {
  // #357: hand-reviewed corrections win over the raw source pos.
  const override = posOverrideMap().get(`${lang}|${nfcUpper(word)}`)
  if (override) return { pos: override, reason: 'pos-overrides.txt (#357 review)' }
  if (lang === 'pt') {
    return { pos: null, reason: 'FrequencyWords pt_50k has no pos column (no licensed PT pos source)' }
  }
  if (lang === 'en') {
    const byLevel = enPosSource().get(nfcUpper(word))
    if (!byLevel) return { pos: null, reason: 'not in CEFR-J/Octanove' }
    const level = cefr.toUpperCase()
    const candidates = byLevel.get(level) ?? [...byLevel.values()].flat()
    const pos = pickPos(candidates)
    return pos ? { pos, reason: 'CEFR-J/Octanove' } : { pos: null, reason: 'source pos is not a content word' }
  }
  return wordhoardInfo(lang, word)
}

/** Committed source-of-truth map: lang → nfcUpper(word) → PackPos. */
export type LemmaPosMap = Record<string, Record<string, PackPos>>

export function loadLemmaPosMap(file = LEMMA_POS_PATH): LemmaPosMap {
  if (!existsSync(file)) return {}
  const raw = JSON.parse(readFileSync(file, 'utf8')) as Record<string, Record<string, unknown>>
  const out: LemmaPosMap = {}
  for (const [lang, words] of Object.entries(raw)) {
    const m: Record<string, PackPos> = {}
    for (const [w, p] of Object.entries(words)) {
      if (isPackPos(p)) m[w] = p
    }
    out[lang] = m
  }
  return out
}

/** Exemption set entries look like `pt|CASA` (reason after a tab is ignored here). */
export function loadPosExemptions(file = POS_EXEMPT_PATH): Set<string> {
  if (!existsSync(file)) return new Set()
  const out = new Set<string>()
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    const t = line.trim()
    if (!t || t.startsWith('#')) continue
    out.add(t.split('\t')[0]!.trim())
  }
  return out
}

/**
 * ADR 0055 amended (#339): lemmas without a licensed pos source (all PT, plus
 * de/es/it stragglers — `scripts/data/pos-exempt.txt`) can be filled by a gated
 * Mistral fallback (`bun run packs:pos --fill-exempt`, local only). Filled tags
 * are original Hiato copy (no external credit) and are recorded as `pos` entries
 * in scripts/data/lemma-extras-gate.json — the same committed gate log the
 * ipa/family extras use — keyed `lang|NFCUPPER(word)|pos`.
 */
export const EXTRAS_GATE_LOG_PATH = path.join(DATA_DIR, 'lemma-extras-gate.json')
export const POS_GATE_VERSION = 1

export type PosGateEntry = {
  value: PackPos
  source: 'mistral'
  verdict: 'pass' | 'reject'
  gate: number
  at: string
}

export type PosGateLog = Record<string, PosGateEntry>

export function posGateKey(lang: string, word: string): string {
  return `${lang}|${nfcUpper(word)}|pos`
}

export function isCurrentPosPass(entry: PosGateEntry | null | undefined): boolean {
  return entry?.verdict === 'pass' && entry.gate === POS_GATE_VERSION
}

/** The `pos` entries of lemma-extras-gate.json (pos values only; ipa/family keys are ignored). */
export function loadPosGateLog(file = EXTRAS_GATE_LOG_PATH): PosGateLog {
  if (!existsSync(file)) return {}
  const raw = JSON.parse(readFileSync(file, 'utf8')) as Record<string, unknown>
  const out: PosGateLog = {}
  for (const [k, v] of Object.entries(raw)) {
    if (!k.endsWith('|pos')) continue
    const e = v as PosGateEntry
    if (e && isPackPos(e.value)) out[k] = e
  }
  return out
}

/**
 * ADR 0055 / #315, amended #339: every shipped lemma carries a source-consistent
 * `pos`, a passing `pos` gate entry (Mistral fallback), or is explicitly exempt.
 * A `pos` that contradicts scripts/data/lemma-pos.json fails; a `pos` with neither
 * a source entry nor a current passing gate entry fails.
 */
export function checkLemmaPos(
  rel: string,
  pack: WordPack,
  posMap: LemmaPosMap,
  exempt: ReadonlySet<string>,
  posGate?: PosGateLog,
): string[] {
  const errors: string[] = []
  const langWords = posMap[pack.lang] ?? {}
  const overrides = posOverrideMap()
  for (const L of pack.lemmas) {
    const word = nfcUpper(L.word)
    const src = overrides.get(`${pack.lang}|${word}`) ?? langWords[word]
    if (L.pos !== undefined) {
      if (!src) {
        const entry = posGate?.[posGateKey(pack.lang, L.word)]
        if (!entry || !isCurrentPosPass(entry) || entry.value !== L.pos) {
          errors.push(
            `${rel}: pos "${L.pos}" on "${L.word}" has no source entry (scripts/data/lemma-pos.json) and no matching passing pos gate entry (scripts/data/lemma-extras-gate.json) — run scripts/build-lemma-pos.ts or bun run packs:pos --fill-exempt`,
          )
        }
      } else if (src !== L.pos) {
        errors.push(
          `${rel}: pos "${L.pos}" for "${L.word}" contradicts the source ("${src}")`,
        )
      }
    } else if (!exempt.has(`${pack.lang}|${word}`)) {
      errors.push(
        `${rel}: lemma "${L.word}" has no pos and no exemption (scripts/data/pos-exempt.txt)`,
      )
    }
  }
  return errors
}
