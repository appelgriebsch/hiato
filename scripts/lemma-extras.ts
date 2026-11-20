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
 */
import {
  createReadStream,
  createWriteStream,
  existsSync,
  mkdirSync,
  readFileSync,
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
import { isDeniedLemma, letterTokens, loadDenylist, nfcUpper } from './lemma-denylist'
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
  await pipeline(Readable.fromWeb(res.body), createWriteStream(dest))
  return dest
}

export async function recordChecksums(): Promise<void> {
  const out: Record<string, { sha256: string; url: string; bytes: number }> = {}
  for (const lang of PACK_LANGS) {
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
  if (nfcUpper(raw) === nfcUpper(lemma)) return false
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

/** Mistral fallback (local only, MISTRAL_API_KEY): batched JSON ipa/family for gaps. */
async function mistralFallback(
  key: string,
  lang: PackLang,
  gaps: { word: string; gloss?: string; wantIpa: boolean; wantFamily: boolean }[],
): Promise<Map<string, { ipa?: string; family?: string[] }>> {
  const out = new Map<string, { ipa?: string; family?: string[] }>()
  const BATCH = 25
  for (let i = 0; i < gaps.length; i += BATCH) {
    const batch = gaps.slice(i, i + BATCH)
    const prompt = `For each ${lang} word below, return JSON only: {"${'word'}"
: {"ipa": "/<one IPA transcription in ${lang}, slashes included>/", "family": ["<up to 3 related or derived ${lang} words>"]}}.
Omit fields you cannot answer. Words: ${JSON.stringify(batch.map((g) => ({ word: g.word, gloss: g.gloss ?? '' })))}`
    const text = await mistralChat(
      key,
      'You are a pronunciation and morphology expert. Answer with JSON only, no prose.',
      prompt,
      0,
    )
    const m = /\{[\s\S]*\}/.exec(text)
    if (!m) continue
    let parsed: Record<string, { ipa?: string; family?: string[] }>
    try {
      parsed = JSON.parse(m[0])
    } catch {
      continue
    }
    for (const g of batch) {
      const r = parsed[g.word]
      if (!r) continue
      const cur = out.get(g.word) ?? {}
      if (g.wantIpa && r.ipa && gateIpa(r.ipa)) cur.ipa = toSlashIpa(r.ipa)
      if (g.wantFamily && Array.isArray(r.family)) {
        cur.family = pickFamily(g.word, r.family, lang)
      }
      out.set(g.word, cur)
    }
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
  const apiKey = readMistralKey()
  if (!dryRun && !apiKey) {
    console.warn('no MISTRAL_API_KEY — running wiktextract-only (fallback gaps will be reported, not filled)')
  }
  await ensureDicts()
  const log = loadGateLog()
  const pin = JSON.parse(readFileSync(PIN_FILE, 'utf8')) as PackPinFile
  const at = new Date().toISOString().slice(0, 10)

  const summary: Record<string, { ipa: number; family: number; total: number; mistral: number }> = {}

  for (const lang of PACK_LANGS) {
    const dest = await downloadWx(lang)
    void dest
    const lemmas = shippedLemmas(lang)
    const wanted = new Set(lemmas.map((l) => nfcUpper(l.word)))
    const extracted = await extractLang(lang, wanted)

    const gaps: { word: string; gloss?: string; wantIpa: boolean; wantFamily: boolean }[] = []
    const result = new Map<string, { ipa?: string; family?: string[]; source: 'wiktextract' | 'mistral' }>()
    for (const l of lemmas) {
      const key = nfcUpper(l.word)
      const bucket = extracted.get(key) ?? { ipa: [], family: [] }
      const ipa = pickIpa(bucket.ipa)
      const family = pickFamily(l.word, bucket.family, lang)
      if (ipa) result.set(key, { ipa, source: 'wiktextract', ...(family.length ? { family } : {}) })
      else if (family.length) result.set(key, { family, source: 'wiktextract' })
      if (!ipa || family.length === 0) {
        gaps.push({ word: l.word, gloss: l.gloss, wantIpa: !ipa, wantFamily: family.length === 0 })
      }
    }

    if (!dryRun && apiKey && gaps.length) {
      console.log(`${lang}: Mistral fallback for ${gaps.length} gaps …`)
      const filled = await mistralFallback(apiKey, lang, gaps)
      for (const [key, v] of filled) {
        const cur = result.get(key) ?? { source: 'mistral' as const }
        if (v.ipa) cur.ipa = v.ipa
        if (v.family?.length) cur.family = v.family
        cur.source = 'mistral'
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
          source: r.source,
          verdict: 'pass',
          gate: EXTRAS_GATE_VERSION,
          at,
        }
        ipaCount += 1
      }
      if (r.family?.length) {
        log[extrasGateKey(lang, l.word, 'family')] = {
          value: r.family,
          source: r.source,
          verdict: 'pass',
          gate: EXTRAS_GATE_VERSION,
          at,
        }
        familyCount += 1
      }
      if (r.source === 'mistral') mistralCount += 1
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

  if (!dryRun) await recordChecksums()
  console.log('summary:', JSON.stringify(summary))
  if (dryRun) console.log('dry-run: no writes')
}

if (import.meta.main) await main()
