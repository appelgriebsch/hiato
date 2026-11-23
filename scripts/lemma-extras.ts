#!/usr/bin/env bun
/**
 * Lemma-extras pipeline (ADR 0055 / #316): `ipa` + `family` for shipped lemmas.
 *
 * Primary source: wiktextract pre-extracted JSONL per language from kaikki.org
 * (Wiktionary-derived, CC-BY-SA 4.0) — cached + checksummed under
 * scripts/data/wiktextract/ (downloads are gitignored; the checksums are committed).
 * Fallback: original Mistral-generated values, batched JSON, local runs only
 * (MISTRAL_API_KEY; never in CI). Without a key the run ships wiktextract-only
 * coverage and the gap is reported.
 *
 * Deterministic gates: ipa `/…/` form (broad `[…]` rewritten to slashes) + IPA allowlist + IPA_MAX; family ≤ 3 NFC
 * entries, entry ≠ lemma, no lemma spoiler, lemma denylist (entry + tokens),
 * Hunspell language membership. Every shipped ipa/family gets a passing entry in
 * the committed, versioned gate log scripts/data/lemma-extras-gate.json;
 * packs:check fails on missing/stale/mismatched entries (same pattern as
 * example-gate.json). The log and pin persist incrementally, so a re-run resumes.
 *
 * Artifacts: public/packs/** (ipa/family + version bump), scripts/data/pack-pin.json,
 * scripts/data/lemma-extras-gate.json, scripts/data/wiktextract/sha256.json.
 *
 *   bun run scripts/lemma-extras.ts            # wiktextract + Mistral fallback (needs key for fallback)
 *   bun run scripts/lemma-extras.ts --dry-run  # wiktextract only, no writes
 *   bun run scripts/lemma-extras.ts --lang=pt   # one language only (#362)
 */
import {
  createReadStream,
  createWriteStream,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { createGunzip } from 'node:zlib'
import { createHash } from 'node:crypto'
import path from 'node:path'
import readline from 'node:readline'
import {
  FAMILY_MAX,
  IPA_MAX,
  PACK_LANGS,
  type PackLang,
  type WordPack,
} from '../src/packs/schema'
import { spoilerContains } from '../src/packs/spoilers'
import { isDeniedLemma, letterTokens, loadDenylist, nfcUpper, spellingKey } from './lemma-denylist'
import { IPA_FORM_RE } from './packs-check-lib'
import { EXTRAS_GATE_VERSION, extrasGateKey, type ExtrasGateLog } from './extras-gate'
import { ensureDicts, isWordOfLang } from './lang-membership'
import { mistralChat, readMistralKey } from './mistral-chat'
import { packPinEntry, type PackPinFile } from './pack-pin'

const ROOT = path.join(import.meta.dir, '..')
const PACKS = path.join(ROOT, 'public', 'packs')
const DATA = path.join(ROOT, 'scripts', 'data')
const WX_DIR = path.join(DATA, 'wiktextract')
const GATE_LOG = path.join(DATA, 'lemma-extras-gate.json')
const PIN_FILE = path.join(DATA, 'pack-pin.json')
const SHA_FILE = path.join(WX_DIR, 'sha256.json')

/** wiktextract editions per pack language (kaikki.org raw extracts, CC-BY-SA 4.0). */
const WX_SOURCES: Record<PackLang, { file: string; url: string; langCode: string }> = {
  en: {
    file: 'en.jsonl.gz',
    url: 'https://kaikki.org/dictionary/raw-wiktextract-data.jsonl.gz',
    langCode: 'en',
  },
  de: {
    file: 'de.jsonl.gz',
    url: 'https://kaikki.org/dictionary/downloads/de/de-extract.jsonl.gz',
    langCode: 'de',
  },
  es: {
    file: 'es.jsonl.gz',
    url: 'https://kaikki.org/dictionary/downloads/es/es-extract.jsonl.gz',
    langCode: 'es',
  },
  fr: {
    file: 'fr.jsonl.gz',
    url: 'https://kaikki.org/dictionary/downloads/fr/fr-extract.jsonl.gz',
    langCode: 'fr',
  },
  it: {
    file: 'it.jsonl.gz',
    url: 'https://kaikki.org/dictionary/downloads/it/it-extract.jsonl.gz',
    langCode: 'it',
  },
  pt: {
    file: 'pt.jsonl.gz',
    url: 'https://kaikki.org/dictionary/downloads/pt/pt-extract.jsonl.gz',
    langCode: 'pt',
  },
}

const DENY = loadDenylist()

async function downloadWx(lang: PackLang): Promise<string> {
  const src = WX_SOURCES[lang]
  const dest = path.join(WX_DIR, src.file)
  if (existsSync(dest)) return dest
  mkdirSync(WX_DIR, { recursive: true })
  console.log(`${lang}: downloading wiktextract extract (${src.url}) …`)
  const res = await fetch(src.url)
  if (!res.ok || !res.body) throw new Error(`wiktextract download failed for ${lang}: ${res.status}`)
  // Download to .part and rename: a crashed run must not leave a truncated
  // extract that the existsSync cache check above would then trust.
  const part = `${dest}.part`
  try {
    await pipeline(Readable.fromWeb(res.body), createWriteStream(part))
    renameSync(part, dest)
  } catch (e) {
    rmSync(part, { force: true })
    throw e
  }
  return dest
}

export async function recordChecksums(langs?: readonly PackLang[]): Promise<void> {
  // Keep committed entries for languages this run did not process (--lang=…):
  // their extracts are gitignored and may not be on disk locally.
  const prev = existsSync(SHA_FILE)
    ? (JSON.parse(readFileSync(SHA_FILE, 'utf8')) as Record<string, { sha256: string; url: string; bytes: number }>)
    : {}
  const out: Record<string, { sha256: string; url: string; bytes: number }> = { ...prev }
  for (const lang of langs ?? PACK_LANGS) {
    const f = path.join(WX_DIR, WX_SOURCES[lang].file)
    if (!existsSync(f)) continue
    // Stream the hash — the en extract is ~3 GB gz, readFileSync would OOM.
    const h = createHash('sha256')
    for await (const chunk of createReadStream(f)) h.update(chunk as Buffer)
    out[lang] = { sha256: h.digest('hex'), url: WX_SOURCES[lang].url, bytes: statSync(f).size }
  }
  writeFileSync(SHA_FILE, JSON.stringify(out, null, 2) + '\n')
}

type WxEntry = {
  word?: string
  lang_code?: string
  sounds?: { ipa?: string }[]
  related?: { word?: string }[]
  derived?: { word?: string }[]
}

/** Stream one extract; collect ipa + family candidates for the wanted words. */
async function extractLang(
  lang: PackLang,
  wanted: ReadonlySet<string>,
): Promise<Map<string, { ipa: string[]; family: string[] }>> {
  const file = path.join(WX_DIR, WX_SOURCES[lang].file)
  const out = new Map<string, { ipa: string[]; family: string[] }>()
  for (const w of wanted) out.set(w, { ipa: [], family: [] })
  // Cheap prefilter before JSON.parse: one alternation over the wanted words.
  // The extracts are pretty-printed with spaces after colons.
  const wordRe = new RegExp(
    `"word":\\s*"(${[...wanted].map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})"`,
    'i',
  )
  const rl = readline.createInterface({
    input: createReadStream(file).pipe(createGunzip()),
    crlfDelay: Infinity,
  })
  let lines = 0
  let hit = 0
  for await (const line of rl) {
    lines += 1
    if (!line.includes(`"lang_code": "${WX_SOURCES[lang].langCode}"`) && !line.includes(`"lang_code":"${WX_SOURCES[lang].langCode}"`)) continue
    if (!wordRe.test(line)) continue
    hit += 1
    let e: WxEntry
    try {
      e = JSON.parse(line) as WxEntry
    } catch {
      continue
    }
    if (e.lang_code !== WX_SOURCES[lang].langCode || !e.word) continue
    const key = nfcUpper(e.word)
    const bucket = out.get(key)
    if (!bucket) continue
    for (const s of e.sounds ?? []) {
      if (s.ipa) bucket.ipa.push(s.ipa)
    }
    for (const d of [...(e.derived ?? []), ...(e.related ?? [])]) {
      if (d.word) bucket.family.push(d.word)
    }
  }
  console.log(
    `${lang}: scanned ${lines.toLocaleString()} lines, ${hit} candidate lines, ${[...out.values()].filter((b) => b.ipa.length || b.family.length).length} wanted words hit`,
  )
  return out
}

/**
 * wiktextract ships narrow `/…/` for English but broad `[…]` in most other
 * editions; ADR 0055 ships one `/…/` form, so brackets are rewritten to slashes.
 */
export function toSlashIpa(ipa: string): string {
  const v = ipa.normalize('NFC').trim()
  if (v.length >= 2 && v.startsWith('[') && v.endsWith(']')) return `/${v.slice(1, -1)}/`
  return v
}

function gateIpa(ipa: string): boolean {
  const v = toSlashIpa(ipa)
  return IPA_FORM_RE.test(v) && v.length <= IPA_MAX
}

function gateFamilyEntry(lemma: string, entry: string, lang: PackLang): boolean {
  const raw = entry.normalize('NFC')
  if (!raw || raw.length > 40) return false
  if (spellingKey(raw) === spellingKey(lemma)) return false
  if (spoilerContains(raw, lemma)) return false
  if (isDeniedLemma(raw, DENY, lang)) return false
  for (const tok of letterTokens(raw)) {
    if (isDeniedLemma(tok, DENY, lang)) return false
  }
  if (!isWordOfLang(lang, raw)) return false
  return true
}

function pickIpa(candidates: readonly string[]): string | null {
  for (const c of candidates) {
    if (gateIpa(c)) return toSlashIpa(c)
  }
  return null
}

function pickFamily(lemma: string, candidates: readonly string[], lang: PackLang): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const c of candidates) {
    if (out.length >= FAMILY_MAX) break
    if (!gateFamilyEntry(lemma, c, lang)) continue
    const key = nfcUpper(c.normalize('NFC'))
    if (seen.has(key)) continue
    seen.add(key)
    out.push(c.normalize('NFC'))
  }
  return out
}

type FallbackEntry = { ipa?: unknown; family?: unknown }

/** Normalize a parsed reply into nfcUpper(word) -> entry. Accepts a map keyed by word, an array of {word, ...} objects, or a {"words": ...} wrapper around either. Returns null when nothing usable. */
function normalizeFallbackReply(parsed: unknown): Map<string, FallbackEntry> | null {
  const out = new Map<string, FallbackEntry>()
  const add = (k: unknown, v: unknown): void => {
    if (!v || typeof v !== 'object') return
    const e = v as Record<string, unknown>
    const key = typeof e.word === 'string' && e.word ? e.word : k
    if (typeof key !== 'string' || !key) return
    out.set(nfcUpper(key), { ipa: e.ipa, family: e.family })
  }
  if (Array.isArray(parsed)) {
    for (const item of parsed) add('', item)
  } else if (parsed && typeof parsed === 'object') {
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
      if ((k === 'words' || k === 'results') && v && typeof v === 'object') {
        const inner = normalizeFallbackReply(v)
        if (inner) for (const [ik, iv] of inner) out.set(ik, iv)
      } else {
        add(k, v)
      }
    }
  }
  return out.size ? out : null
}

/**
 * Extract the JSON payload from a model reply: whole text first, then the
 * outermost `{...}` / `[...]` span — tolerates markdown fences and prose.
 * Models answer "for each word …" with a bare array of {word, …} as often as
 * with the word-keyed map the prompt asks for, so all shapes must parse.
 */
function parseFallbackJson(text: string): Map<string, FallbackEntry> | null {
  const cleaned = text.replace(/```(?:json)?/gi, '').trim()
  const candidates = [cleaned]
  const brace = /\{[\s\S]*\}/.exec(cleaned)
  if (brace) candidates.push(brace[0])
  const bracket = /\[[\s\S]*\]/.exec(cleaned)
  if (bracket) candidates.push(bracket[0])
  for (const c of candidates) {
    let parsed: unknown
    try {
      parsed = JSON.parse(c)
    } catch {
      continue
    }
    const byWord = normalizeFallbackReply(parsed)
    if (byWord) return byWord
  }
  return null
}

/** Mistral fallback (local only, MISTRAL_API_KEY): batched JSON ipa/family for gaps. Returned map is keyed by nfcUpper(word) so main() merges into its nfcUpper-keyed result. */
export async function mistralFallback(
  key: string,
  lang: PackLang,
  gaps: { word: string; gloss?: string; wantIpa: boolean; wantFamily: boolean }[],
): Promise<Map<string, { ipa?: string; family?: string[] }>> {
  const out = new Map<string, { ipa?: string; family?: string[] }>()
  const BATCH = 25
  for (let i = 0; i < gaps.length; i += BATCH) {
    const batch = gaps.slice(i, i + BATCH)
    const prompt = `For each ${lang} word below, return ONE JSON object, no prose and no markdown fences, with one key per input word — keys exactly as given in the Words list: {"<word>": {"ipa": "/<one IPA transcription in ${lang}, slashes included>/", "family": ["<up to 3 related or derived ${lang} words>"]}}.
Omit fields you cannot answer. Words: ${JSON.stringify(batch.map((g) => ({ word: g.word, gloss: g.gloss ?? '' })))}`
    const text = await mistralChat(
      key,
      'You are a pronunciation and morphology expert. Answer with JSON only, no prose.',
      prompt,
      0,
    )
    const byWord = parseFallbackJson(text)
    if (!byWord) {
      console.warn(`  Mistral batch ${i / BATCH + 1}: unparseable response: ${JSON.stringify(text.slice(0, 200))}`)
      continue
    }
    let matched = 0
    let filled = 0
    for (const g of batch) {
      const key = nfcUpper(g.word)
      const r = byWord.get(key)
      if (!r) continue
      matched += 1
      const cur = out.get(key) ?? {}
      if (g.wantIpa && typeof r.ipa === 'string') {
        // Tolerate a bare transcription (no slashes/brackets) by wrapping it before the gate.
        const ipa = gateIpa(r.ipa) ? toSlashIpa(r.ipa) : gateIpa(`/${r.ipa}/`) ? `/${r.ipa}/` : null
        if (ipa) cur.ipa = ipa
      }
      if (g.wantFamily) {
        const fam = Array.isArray(r.family) ? r.family : typeof r.family === 'string' ? [r.family] : []
        const picked = pickFamily(g.word, fam, lang)
        if (picked.length) cur.family = picked
      }
      if (cur.ipa || cur.family?.length) filled += 1
      out.set(key, cur)
    }
    console.log(`  Mistral batch ${i / BATCH + 1}/${Math.ceil(gaps.length / BATCH)}: matched ${matched}/${batch.length}, filled ${filled}`)
  }
  return out
}

function loadGateLog(): ExtrasGateLog {
  if (!existsSync(GATE_LOG)) return {}
  return JSON.parse(readFileSync(GATE_LOG, 'utf8')) as ExtrasGateLog
}

function shippedLemmas(lang: PackLang): { word: string; gloss?: string }[] {
  const out: { word: string; gloss?: string }[] = []
  for (const cefr of ['a1', 'a2', 'b1', 'b2', 'c1', 'c2'] as const) {
    const f = path.join(PACKS, lang, `${cefr}.json`)
    if (!existsSync(f)) continue
    const pack = JSON.parse(readFileSync(f, 'utf8')) as WordPack
    for (const L of pack.lemmas) out.push({ word: L.word, gloss: L.gloss })
  }
  return out
}

async function main() {
  const dryRun = process.argv.includes('--dry-run')
  // --lang=pt,… scopes the run (e.g. #362 fills PT only); default: all languages.
  const langArg = process.argv.find((a) => a.startsWith('--lang='))
  const onlyLangs = langArg
    ? (langArg.slice('--lang='.length).split(',').map((s) => s.trim()) as PackLang[])
    : null
  if (onlyLangs) {
    for (const l of onlyLangs) {
      if (!PACK_LANGS.includes(l)) throw new Error(`invalid --lang=${l}`)
    }
  }
  const langs = onlyLangs ?? PACK_LANGS
  const apiKey = readMistralKey()
  if (!dryRun && !apiKey) {
    console.warn('no MISTRAL_API_KEY — running wiktextract-only (fallback gaps will be reported, not filled)')
  }
  await ensureDicts()
  const log = loadGateLog()
  const pin = JSON.parse(readFileSync(PIN_FILE, 'utf8')) as PackPinFile
  const at = new Date().toISOString().slice(0, 10)

  const summary: Record<string, { ipa: number; family: number; total: number; mistral: number }> = {}

  for (const lang of langs) {
    const dest = await downloadWx(lang)
    void dest
    const lemmas = shippedLemmas(lang)
    const wanted = new Set(lemmas.map((l) => nfcUpper(l.word)))
    const extracted = await extractLang(lang, wanted)

    const gaps: { word: string; gloss?: string; wantIpa: boolean; wantFamily: boolean }[] = []
    // Source is tracked per field: a lemma can have wiktextract ipa and a
    // mistral-filled family, and the gate log must attribute each correctly.
    type Entry = {
      ipa?: string
      ipaSource?: 'wiktextract' | 'mistral'
      family?: string[]
      familySource?: 'wiktextract' | 'mistral'
    }
    const result = new Map<string, Entry>()
    for (const l of lemmas) {
      const key = nfcUpper(l.word)
      const bucket = extracted.get(key) ?? { ipa: [], family: [] }
      const ipa = pickIpa(bucket.ipa)
      const family = pickFamily(l.word, bucket.family, lang)
      const entry: Entry = {}
      if (ipa) {
        entry.ipa = ipa
        entry.ipaSource = 'wiktextract'
      }
      if (family.length) {
        entry.family = family
        entry.familySource = 'wiktextract'
      }
      if (entry.ipa || entry.family) result.set(key, entry)
      if (!ipa || family.length === 0) {
        gaps.push({ word: l.word, gloss: l.gloss, wantIpa: !ipa, wantFamily: family.length === 0 })
      }
    }

    if (!dryRun && apiKey && gaps.length) {
      console.log(`${lang}: Mistral fallback for ${gaps.length} gaps …`)
      const filled = await mistralFallback(apiKey, lang, gaps)
      for (const [key, v] of filled) {
        const cur = result.get(key) ?? {}
        if (v.ipa) {
          cur.ipa = v.ipa
          cur.ipaSource = 'mistral'
        }
        if (v.family?.length) {
          cur.family = v.family
          cur.familySource = 'mistral'
        }
        result.set(key, cur)
      }
    }

    // Gate log entries + pack rewrite.
    let ipaCount = 0
    let familyCount = 0
    let mistralCount = 0
    for (const l of lemmas) {
      const key = nfcUpper(l.word)
      const r = result.get(key)
      if (!r) continue
      if (r.ipa) {
        log[extrasGateKey(lang, l.word, 'ipa')] = {
          value: r.ipa,
          source: r.ipaSource ?? 'wiktextract',
          verdict: 'pass',
          gate: EXTRAS_GATE_VERSION,
          at,
        }
        ipaCount += 1
      }
      if (r.family?.length) {
        log[extrasGateKey(lang, l.word, 'family')] = {
          value: r.family,
          source: r.familySource ?? 'wiktextract',
          verdict: 'pass',
          gate: EXTRAS_GATE_VERSION,
          at,
        }
        familyCount += 1
      }
      if (r.ipaSource === 'mistral' || r.familySource === 'mistral') mistralCount += 1
    }

    if (!dryRun) {
      for (const cefr of ['a1', 'a2', 'b1', 'b2', 'c1', 'c2'] as const) {
        const rel = `${lang}/${cefr}.json`
        const file = path.join(PACKS, rel)
        if (!existsSync(file)) continue
        const pack = JSON.parse(readFileSync(file, 'utf8')) as WordPack
        let changed = 0
        for (const L of pack.lemmas) {
          const r = result.get(nfcUpper(L.word))
          if (!r) continue
          if (r.ipa && L.ipa !== r.ipa) {
            L.ipa = r.ipa
            changed += 1
          }
          if (r.family?.length && JSON.stringify(L.family ?? null) !== JSON.stringify(r.family)) {
            L.family = r.family
            changed += 1
          }
        }
        if (changed) {
          pack.version += 1
          writeFileSync(file, JSON.stringify(pack, null, 2) + '\n')
          pin[rel] = packPinEntry(pack)
        }
      }
      writeFileSync(GATE_LOG, JSON.stringify(log, null, 2) + '\n')
      writeFileSync(PIN_FILE, JSON.stringify(pin, null, 2) + '\n')
    }

    summary[lang] = { ipa: ipaCount, family: familyCount, total: lemmas.length, mistral: mistralCount }
    console.log(
      `${lang}: ipa ${ipaCount}/${lemmas.length} (${((100 * ipaCount) / lemmas.length).toFixed(0)}%), family ${familyCount}/${lemmas.length} (${((100 * familyCount) / lemmas.length).toFixed(0)}%), mistral-filled words ${mistralCount}`,
    )
  }

  console.log('summary:', JSON.stringify(summary))
  if (!dryRun) await recordChecksums(langs)
  if (dryRun) console.log('dry-run: no writes')
}

if (import.meta.main) await main()
