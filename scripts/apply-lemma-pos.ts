#!/usr/bin/env bun
/**
 * Apply scripts/data/lemma-pos.json to every shipped pack (ADR 0055 / #315):
 * set `pos` on each lemma from the source map, bump the pack `version` when the
 * body changed, and rewrite scripts/data/pack-pin.json. Prints the byte delta
 * per pack for the ADR 0055 size report.
 *
 *   bun run scripts/apply-lemma-pos.ts            (after build-lemma-pos.ts)
 *   bun run scripts/apply-lemma-pos.ts --dry-run
 *
 * ADR 0055 amended (#339): `--fill-exempt` additionally fills lemmas that have no
 * licensed pos source (scripts/data/pos-exempt.txt — all PT plus de/es/it
 * stragglers) with original Mistral-generated tags: a batched tag call and an
 * independent verify call must agree on a valid PackPos, otherwise the lemma
 * stays exempt (fail-closed; a failed batch is skipped, never fatal). Local runs
 * only (MISTRAL_API_KEY, never CI); without a key the flag warns and changes
 * nothing. Filled tags are recorded as `pos` entries in
 * scripts/data/lemma-extras-gate.json, which packs:check accepts (checkLemmaPos).
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { nfcUpper } from './lemma-denylist'
import { packPinEntry, type PackPinFile } from './pack-pin'
import {
  EXTRAS_GATE_LOG_PATH,
  POS_GATE_VERSION,
  UPOS_TO_PACK_POS,
  isCurrentPosPass,
  loadLemmaPosMap,
  loadPosGateLog,
  posGateKey,
  posOverrideMap,
  type LemmaPosMap,
  type PosGateLog,
} from './lemma-pos'
import { mistralChat, readMistralKey } from './mistral-chat'
import {
  isPackPos,
  PACK_CEFR_LEVELS,
  PACK_LANGS,
  type PackLang,
  type PackPos,
} from '../src/packs/schema'

const ROOT = path.join(import.meta.dir, '..')
const PACKS = path.join(ROOT, 'public', 'packs')
const PIN_PATH = path.join(ROOT, 'scripts', 'data', 'pack-pin.json')
const EXEMPT_PATH = path.join(ROOT, 'scripts', 'data', 'pos-exempt.txt')

const LANG_NAME: Record<PackLang, string> = {
  en: 'English',
  pt: 'Portuguese',
  de: 'German',
  es: 'Spanish',
  fr: 'French',
  it: 'Italian',
}

const BATCH = 25

type PackFile = {
  version: number
  lang: string
  cefr: string
  license: string
  attribution: string[]
  lemmas: { word: string; gloss?: string; pos?: string; [k: string]: unknown }[]
}

/** Map a model answer (PackPos code or UPOS tag) to a PackPos, or null. */
export function toPackPos(raw: unknown): PackPos | null {
  if (typeof raw !== 'string') return null
  const p = raw.trim().toLowerCase()
  if (isPackPos(p)) return p
  return UPOS_TO_PACK_POS[raw.trim().toUpperCase()] ?? null
}

/** Extract the first JSON object from a model reply; null when none parses. */
export function parseJsonObject(text: string): Record<string, unknown> | null {
  const m = /\{[\s\S]*\}/.exec(text)
  if (!m) return null
  try {
    const v: unknown = JSON.parse(m[0])
    return v && typeof v === 'object' && !Array.isArray(v)
      ? (v as Record<string, unknown>)
      : null
  } catch {
    return null
  }
}

/** Response lookup tolerant of case: try the word as sent, then its nfcUpper form. */
function lookupWord(obj: Record<string, unknown>, word: string): unknown {
  return obj[word] ?? obj[nfcUpper(word)]
}

/** Keep only proposals the independent verify call agrees with (keyed by nfcUpper word). */
export function agreeingPos(
  proposed: ReadonlyMap<string, PackPos>,
  verified: Record<string, unknown> | null,
): Map<string, PackPos> {
  const out = new Map<string, PackPos>()
  if (!verified) return out
  for (const [w, p] of proposed) {
    if (toPackPos(verified[w]) === p) out.set(w, p)
  }
  return out
}

const TAG_SYSTEM =
  'You are a part-of-speech tagger for a language-learning app. Answer with JSON only: {"<word>": "<pos>"} where <pos> is one of noun, verb, adjective, adverb. Use the gloss to disambiguate homographs and multi-word lemmas.'

const VERIFY_SYSTEM =
  'You are an independent part-of-speech verifier for a language-learning app. Answer with JSON only: {"<word>": "<pos>"} where <pos> is one of noun, verb, adjective, adverb. Tag each word from the gloss alone; you are not shown any proposed tag.'

function itemsJson(items: { word: string; gloss: string }[]): string {
  return JSON.stringify(items.map((i) => ({ word: i.word, gloss: i.gloss })))
}

function batchPrompt(lang: PackLang, items: { word: string; gloss: string }[]): string {
  return `Language: ${LANG_NAME[lang]}. Tag each word below (word + learner gloss) with its part of speech. Reply JSON only, one key per word. Words: ${itemsJson(items)}`
}

type ExemptLine = { lang: PackLang; word: string }

function readExemptLines(): ExemptLine[] {
  const out: ExemptLine[] = []
  for (const line of readFileSync(EXEMPT_PATH, 'utf8').split('\n')) {
    const t = line.trim()
    if (!t || t.startsWith('#')) continue
    const key = t.split('\t')[0]!.trim()
    const [lang, word] = key.split('|')
    if (lang && word) out.push({ lang: lang as PackLang, word })
  }
  return out
}

/** gloss per nfcUpper(word) per lang, indexed from the shipped packs. */
function glossIndex(): Map<PackLang, Map<string, string>> {
  const out = new Map<PackLang, Map<string, string>>()
  for (const lang of PACK_LANGS) {
    const m = new Map<string, string>()
    for (const cefr of PACK_CEFR_LEVELS) {
      const f = path.join(PACKS, lang, `${cefr}.json`)
      if (!existsSync(f)) continue
      const pack = JSON.parse(readFileSync(f, 'utf8')) as PackFile
      for (const L of pack.lemmas) m.set(nfcUpper(L.word), L.gloss ?? '')
    }
    out.set(lang, m)
  }
  return out
}

/** #339: fill pos-exempt.txt lemmas via gated Mistral tag+verify, write packs/pin/gate log. */
async function fillExemptPos(): Promise<void> {
  const key = readMistralKey()
  if (!key) {
    console.warn('no MISTRAL_API_KEY — skipping --fill-exempt (source-only apply)')
    return
  }
  const exempt = readExemptLines()
  if (!exempt.length) {
    console.log('pos-exempt.txt is empty — nothing to fill')
    return
  }
  const glosses = glossIndex()
  const byLang = new Map<PackLang, ExemptLine[]>()
  for (const e of exempt) {
    const arr = byLang.get(e.lang) ?? []
    arr.push(e)
    byLang.set(e.lang, arr)
  }
  const pin = JSON.parse(readFileSync(PIN_PATH, 'utf8')) as PackPinFile
  const gate = existsSync(EXTRAS_GATE_LOG_PATH)
    ? (JSON.parse(readFileSync(EXTRAS_GATE_LOG_PATH, 'utf8')) as PosGateLog)
    : {}
  const at = new Date().toISOString().slice(0, 10)
  const filled = new Set<string>()
  let filledCount = 0

  // Persist after every language so a crash mid-run leaves packs, pin, gate log
  // and pos-exempt.txt consistent (a re-run resumes from the remaining exemptions).
  const persist = () => {
    const remaining = readFileSync(EXEMPT_PATH, 'utf8')
      .split('\n')
      .filter((line) => {
        const t = line.trim()
        if (!t || t.startsWith('#')) return true
        return !filled.has(t.split('\t')[0]!.trim())
      })
    writeFileSync(EXEMPT_PATH, remaining.join('\n'))
    writeFileSync(PIN_PATH, JSON.stringify(pin, null, 2) + '\n')
    writeFileSync(EXTRAS_GATE_LOG_PATH, JSON.stringify(gate, null, 2) + '\n')
  }

  for (const [lang, items] of byLang) {
    const gloss = glosses.get(lang) ?? new Map<string, string>()
    const gaps = items.map((e) => ({ word: e.word, gloss: gloss.get(nfcUpper(e.word)) ?? '' }))
    for (let i = 0; i < gaps.length; i += BATCH) {
      const batch = gaps.slice(i, i + BATCH)
      const batchNo = i / BATCH + 1
      try {
        const tagText = await mistralChat(key, TAG_SYSTEM, batchPrompt(lang, batch), 0)
        const proposedRaw = parseJsonObject(tagText)
        const proposed = new Map<string, PackPos>()
        if (proposedRaw) {
          for (const g of batch) {
            const p = toPackPos(lookupWord(proposedRaw, g.word))
            if (p) proposed.set(nfcUpper(g.word), p)
          }
        }
        const verifyText = await mistralChat(key, VERIFY_SYSTEM, batchPrompt(lang, batch), 0)
        const verifiedRaw = parseJsonObject(verifyText)
        const verified: Record<string, unknown> = {}
        if (verifiedRaw) {
          for (const g of batch) verified[nfcUpper(g.word)] = lookupWord(verifiedRaw, g.word)
        }
        const agreed = agreeingPos(proposed, verified)
        for (const cefr of PACK_CEFR_LEVELS) {
          const rel = `${lang}/${cefr}.json`
          const file = path.join(PACKS, rel)
          if (!existsSync(file)) continue
          const pack = JSON.parse(readFileSync(file, 'utf8')) as PackFile
          let changed = 0
          for (const L of pack.lemmas) {
            const p = agreed.get(nfcUpper(L.word))
            if (p && L.pos !== p) {
              L.pos = p
              changed += 1
            }
          }
          if (changed) {
            pack.version += 1
            writeFileSync(file, JSON.stringify(pack, null, 2) + '\n')
            pin[rel] = packPinEntry(pack)
          }
        }
        for (const [w, p] of agreed) {
          gate[posGateKey(lang, w)] = {
            value: p,
            source: 'mistral',
            verdict: 'pass',
            gate: POS_GATE_VERSION,
            at,
          }
          filled.add(`${lang}|${w}`)
          filledCount += 1
        }
        console.log(`${lang}: batch ${batchNo} — ${agreed.size}/${batch.length} tag+verify agreed`)
      } catch (e) {
        console.warn(
          `${lang}: batch ${batchNo} failed, lemmas stay exempt: ${(e as Error).message}`,
        )
      }
    }
    persist()
    console.log(`${lang}: done — ${filled.size} filled so far`)
  }

  console.log(
    `--fill-exempt: filled pos on ${filledCount} lemmas, ${exempt.length - filled.size} stay exempt`,
  )
}

async function main() {
  const dryRun = process.argv.includes('--dry-run')
  const fillExempt = process.argv.includes('--fill-exempt')
  const posMap: LemmaPosMap = loadLemmaPosMap()
  const posGate = loadPosGateLog()
  const pin: PackPinFile = JSON.parse(readFileSync(PIN_PATH, 'utf8')) as PackPinFile
  let totalBefore = 0
  let totalAfter = 0

  for (const lang of PACK_LANGS) {
    for (const cefr of PACK_CEFR_LEVELS) {
      const rel = `${lang}/${cefr}.json`
      const file = path.join(PACKS, rel)
      const before = readFileSync(file, 'utf8')
      const pack = JSON.parse(before) as PackFile
      const words = posMap[lang] ?? {}
      const overrides = posOverrideMap()
      let changed = 0
      for (const L of pack.lemmas) {
        // #357/#358: hand-reviewed overrides win over the raw source map, same
        // precedence as checkLemmaPos/posSourceInfo, so a re-apply cannot
        // clobber a reviewed tag.
        const want = overrides.get(`${lang}|${nfcUpper(L.word)}`) ?? words[nfcUpper(L.word)] ?? null
        if (want && L.pos !== want) {
          L.pos = want
          changed += 1
        } else if (!want && L.pos !== undefined) {
          // Keep a Mistral-filled tag (#339) that still has a current passing gate entry.
          const entry = posGate[posGateKey(lang, L.word)]
          if (entry && isCurrentPosPass(entry) && entry.value === L.pos) continue
          delete L.pos
          changed += 1
        }
      }
      if (!changed) {
        pin[rel] = packPinEntry(pack)
        continue
      }
      pack.version += 1
      const after = JSON.stringify(pack, null, 2) + '\n'
      totalBefore += Buffer.byteLength(before, 'utf8')
      totalAfter += Buffer.byteLength(after, 'utf8')
      pin[rel] = packPinEntry(pack)
      if (!dryRun) writeFileSync(file, after)
      console.log(
        `${rel}: pos on ${changed}/${pack.lemmas.length} lemmas, version ${pack.version - 1}→${pack.version}, ${(Buffer.byteLength(before, 'utf8') / 1024).toFixed(1)}→${(Buffer.byteLength(after, 'utf8') / 1024).toFixed(1)} KB`,
      )
    }
  }

  if (!dryRun) {
    writeFileSync(PIN_PATH, JSON.stringify(pin, null, 2) + '\n')
    console.log(`rewrote ${PIN_PATH}`)
  }
  console.log(
    `total packs bytes: ${(totalBefore / 1024 / 1024).toFixed(2)}→${(totalAfter / 1024 / 1024).toFixed(2)} MB (delta ${(((totalAfter - totalBefore) / 1024) | 0)} KB) ${dryRun ? '(dry-run)' : ''}`,
  )

  if (fillExempt && !dryRun) await fillExemptPos()
}

if (import.meta.main) await main()
