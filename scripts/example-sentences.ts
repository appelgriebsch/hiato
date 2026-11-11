#!/usr/bin/env bun
/**
 * Example-sentence pipeline (ADR 0048/0049, #225/#247). Pilot: EN + DE A1–B1.
 *
 * Source 1: Tatoeba per-language sentence dump (CC-BY 2.0 FR) — one sentence per
 * lemma: whole-Unicode-word match, shortest/cleanest, denylist + person-name
 * guards. Source 2 (fallback): original Mistral-generated sentence
 * (mistral-large-4-0 via MISTRAL_API_KEY). Every candidate passes a Mistral
 * CEFR gate against the pack level; failures are rejected, not patched.
 * Verdicts cached in scripts/data/example-gate.json; packs:check enforces it.
 *
 * --dry-run selects Tatoeba sentences without Mistral calls or writes.
 * Run in CI via .github/workflows/example-sentences.yml (MISTRAL_API_KEY secret);
 * committed artifacts are public/packs + scripts/data/example-gate.json.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { EXAMPLE_SENTENCE_MAX, type PackCefr, type PackLang, type WordPack } from '../src/packs/schema'
import { spoilerContains } from '../src/packs/spoilers'
import { isDeniedGlossToken, letterTokens, loadDenylist, nfcUpper } from './lemma-denylist'
import { loadNameList, onNameList } from './lemma-names'
import { mistralChat, readMistralKey } from './mistral-chat'
import { packPinEntry } from './pack-pin'

const ROOT = path.join(import.meta.dir, '..')
const PACKS = path.join(ROOT, 'public', 'packs')
const DATA = path.join(ROOT, 'scripts', 'data')
const TATOEBA_DIR = path.join(DATA, 'tatoeba')
const GATE_LOG = path.join(DATA, 'example-gate.json')
const PIN_FILE = path.join(DATA, 'pack-pin.json')

/** Tatoeba per-language exports use ISO 639-3 codes. */
const ISO3: Record<PackLang, string> = {
  en: 'eng',
  de: 'deu',
  es: 'spa',
  pt: 'por',
  fr: 'fra',
  it: 'ita',
}

const LANG_NAMES: Record<PackLang, string> = {
  en: 'English',
  de: 'German',
  es: 'Spanish',
  pt: 'Portuguese',
  fr: 'French',
  it: 'Italian',
}

/** Max Tatoeba candidates kept per lemma token, and how many go through the gate. */
const BUCKET_CAP = 400
const GATE_TRIES = 8
const GENERATE_TRIES = 3
/** Shortest sentence we accept; shorter reads as telegraphic, not a sentence. */
const SENTENCE_MIN = 10

export type GateSource = 'tatoeba' | 'mistral' | 'fixture'
export type GateVerdict = 'pass' | 'reject'

export type ExampleGateEntry = {
  sentence: string
  source: GateSource
  verdict: GateVerdict
  level: string
  at: string
}

export type ExampleGateLog = Record<string, ExampleGateEntry>

export function gateKey(rel: string, word: string): string {
  return `${rel}|${nfcUpper(word)}`
}

export function loadExampleGateLog(file = GATE_LOG): ExampleGateLog {
  if (!existsSync(file)) return {}
  return JSON.parse(readFileSync(file, 'utf8')) as ExampleGateLog
}

/** Collapse whitespace and trim; null when the line is not one clean sentence. */
export function cleanSentence(raw: string): string | null {
  const s = raw.replace(/\s+/g, ' ').trim()
  if (s.length < SENTENCE_MIN || s.length > EXAMPLE_SENTENCE_MAX) return null
  if (!/[.!?]$/.test(s)) return null
  if (/[.!?]["')\]]?\s/.test(s.slice(0, -1))) return null
  return s
}

/**
 * Guards every candidate must pass (ADR 0048): whole-word lemma match, denylist
 * (profanity/slur) tokens, no capitalized person names. The lemma itself is
 * exempt from the denylist (isDeniedGlossToken skips it).
 */
export function sentenceAllowed(sentence: string, lang: PackLang, word: string): boolean {
  if (!spoilerContains(sentence, word)) return false
  const DENY = loadDenylist()
  const NAMES = loadNameList()
  const re = /[\p{L}\p{M}]+/gu
  let m: RegExpExecArray | null
  let first = true
  while ((m = re.exec(sentence)) !== null) {
    const tok = m[0]!
    if (isDeniedGlossToken(tok, lang, word, DENY)) return false
    // A name-list token is a person name only when capitalized mid-sentence;
    // the first word is capitalized by sentence case alone.
    if (!first && /^\p{Lu}/u.test(tok) && onNameList(tok, NAMES)) return false
    first = false
  }
  return true
}

/**
 * One pass over the dump: bucket clean sentences by each wanted lemma token
 * (NFC-upper), capped per token. Keeps selection O(sentences + lemmas).
 */
export function buildSentenceIndex(
  rawSentences: string[],
  wanted: ReadonlySet<string>,
  cap = BUCKET_CAP,
): Map<string, string[]> {
  const index = new Map<string, string[]>()
  for (const raw of rawSentences) {
    const s = cleanSentence(raw)
    if (!s) continue
    const seen = new Set<string>()
    for (const tok of letterTokens(s)) {
      const key = nfcUpper(tok)
      if (!wanted.has(key) || seen.has(key)) continue
      seen.add(key)
      const bucket = index.get(key)
      if (bucket) {
        if (bucket.length < cap) bucket.push(s)
      } else {
        index.set(key, [s])
      }
    }
  }
  return index
}

/** Clean, guarded Tatoeba candidates for a lemma, shortest first, up to `limit`. */
export function tatoebaCandidates(
  index: Map<string, string[]>,
  lang: PackLang,
  word: string,
  limit = BUCKET_CAP,
): string[] {
  const hits = (index.get(nfcUpper(word)) ?? []).filter((s) =>
    sentenceAllowed(s, lang, word),
  )
  hits.sort((a, b) => a.length - b.length)
  return hits.slice(0, limit)
}

/** Shortest clean candidate that passes the guards, or null. */
export function pickTatoebaCandidate(
  index: Map<string, string[]>,
  lang: PackLang,
  word: string,
): string | null {
  return tatoebaCandidates(index, lang, word)[0] ?? null
}

/** Parse the Mistral CEFR gate answer. */
export function parseGateVerdict(content: string): GateVerdict | null {
  const m = /^\s*(PASS|FAIL)\b/i.exec(content)
  if (!m) return null
  return m[1]!.toUpperCase() === 'PASS' ? 'pass' : 'reject'
}

const GATE_SYSTEM =
  'You judge whether a sentence fits a CEFR level for language learners. ' +
  'Answer exactly "PASS" or "FAIL" followed by a one-line reason.'

function gatePrompt(lang: PackLang, cefr: PackCefr, sentence: string): string {
  return [
    `Language: ${LANG_NAMES[lang]} (${lang}). CEFR level: ${cefr.toUpperCase()}.`,
    `Sentence: "${sentence}"`,
    `Is every word and structure in this sentence within CEFR ${cefr.toUpperCase()} for learners of ${LANG_NAMES[lang]}?`,
  ].join('\n')
}

const GEN_SYSTEM =
  'You write one short example sentence for a language-learning app. ' +
  'Output only the sentence, nothing else.'

function generatePrompt(lang: PackLang, cefr: PackCefr, word: string): string {
  return [
    `Language: ${LANG_NAMES[lang]} (${lang}). CEFR level: ${cefr.toUpperCase()}.`,
    `Word: "${word}"`,
    `Write one original sentence in ${LANG_NAMES[lang]} at CEFR ${cefr.toUpperCase()} level that uses "${word}" as a whole word.`,
    `At most 140 characters. No real person names. No translation. Output only the sentence.`,
  ].join('\n')
}

async function generateAndGate(
  rel: string,
  lang: PackLang,
  cefr: PackCefr,
  word: string,
  apiKey: string,
  log: ExampleGateLog,
  at: string,
): Promise<ExampleGateEntry | null> {
  for (let i = 0; i < GENERATE_TRIES; i++) {
    const out = await mistralChat(apiKey, GEN_SYSTEM, generatePrompt(lang, cefr, word), 0.7)
    const s = cleanSentence(out)
    if (!s || !sentenceAllowed(s, lang, word)) continue
    const verdict = parseGateVerdict(
      await mistralChat(apiKey, GATE_SYSTEM, gatePrompt(lang, cefr, s), 0),
    )
    const entry: ExampleGateEntry = {
      sentence: s,
      source: 'mistral',
      verdict: verdict === 'pass' ? 'pass' : 'reject',
      level: cefr,
      at,
    }
    log[gateKey(rel, word)] = entry
    if (entry.verdict === 'pass') return entry
  }
  return null
}

/** Tatoeba dump URL for a pack language (CC-BY 2.0 FR). */
export function tatoebaUrl(lang: PackLang): string {
  const iso = ISO3[lang]
  return `https://downloads.tatoeba.org/exports/per_language/${iso}/${iso}_sentences.tsv.bz2`
}

/** Download + decompress the Tatoeba dump; returns the TSV path. */
export async function fetchTatoebaTsv(lang: PackLang, dir = TATOEBA_DIR): Promise<string> {
  const iso = ISO3[lang]
  mkdirSync(dir, { recursive: true })
  const bz2 = path.join(dir, `${iso}_sentences.tsv.bz2`)
  const tsv = path.join(dir, `${iso}_sentences.tsv`)
  if (!existsSync(tsv)) {
    if (!existsSync(bz2)) {
      console.log(`downloading ${tatoebaUrl(lang)}`)
      const res = await fetch(tatoebaUrl(lang))
      if (!res.ok || !res.body) throw new Error(`Tatoeba ${lang} dump ${res.status}`)
      writeFileSync(bz2, Buffer.from(await res.arrayBuffer()))
    }
    const proc = Bun.spawnSync(['bzip2', '-dc', bz2], { stdout: 'pipe' })
    if (proc.exitCode !== 0) throw new Error(`bzip2 failed for ${bz2}`)
    writeFileSync(tsv, proc.stdout)
  }
  return tsv
}

/** Parse a Tatoeba sentences TSV (`id<TAB>lang<TAB>text`) into sentence texts. */
export function parseTatoebaTsv(text: string): string[] {
  const out: string[] = []
  for (const line of text.split('\n')) {
    const first = line.indexOf('\t')
    if (first < 0) continue
    const second = line.indexOf('\t', first + 1)
    if (second < 0) continue
    out.push(line.slice(second + 1))
  }
  return out
}

type Cli = {
  langs: PackLang[]
  levels: PackCefr[]
  dryRun: boolean
  force: boolean
  sentencesFile?: string
}

function parseCli(argv: string[]): Cli {
  const langs: PackLang[] = []
  const levels: PackCefr[] = []
  let dryRun = false
  let force = false
  let sentencesFile: string | undefined
  for (const a of argv) {
    if (a === '--dry-run') dryRun = true
    else if (a === '--force') force = true
    else if (a.startsWith('--lang=')) {
      for (const v of a.slice(7).split(',')) {
        if (v === 'all') langs.push('en', 'de', 'es', 'pt', 'fr', 'it')
        else langs.push(v as PackLang)
      }
    } else if (a.startsWith('--levels=')) {
      for (const v of a.slice(9).split(',')) levels.push(v as PackCefr)
    } else if (a.startsWith('--sentences-file=')) {
      sentencesFile = a.slice(17)
    } else throw new Error(`unknown arg ${a}`)
  }
  return {
    langs: langs.length ? langs : ['en', 'de'],
    levels: levels.length ? levels : ['a1', 'a2', 'b1'],
    dryRun,
    force,
    sentencesFile,
  }
}

const TATOEBA_ATTRIBUTION =
  'Example sentences selected from Tatoeba (https://tatoeba.org), licensed CC-BY 2.0 FR.'

async function main() {
  const cli = parseCli(process.argv.slice(2))
  const apiKey = readMistralKey()
  if (!cli.dryRun && !apiKey) {
    console.error('set MISTRAL_API_KEY (required unless --dry-run)')
    process.exit(1)
  }
  const at = new Date().toISOString().slice(0, 10)
  const log = loadExampleGateLog()
  const pin = JSON.parse(readFileSync(PIN_FILE, 'utf8')) as Record<string, unknown>

  for (const lang of cli.langs) {
    let index: Map<string, string[]> | null = null
    for (const cefr of cli.levels) {
      const rel = `${lang}/${cefr}.json`
      const file = path.join(PACKS, rel)
      if (!existsSync(file)) {
        console.error(`${rel}: no such pack`)
        process.exit(1)
      }
      const pack = JSON.parse(readFileSync(file, 'utf8')) as WordPack
      // Tatoeba selection runs even in --dry-run (no Mistral, no writes);
      // --sentences-file points at an already-downloaded TSV instead.
      if (!index) {
        const tsv = cli.sentencesFile
          ? cli.sentencesFile
          : await fetchTatoebaTsv(lang)
        const wanted = new Set(
          cli.levels
            .flatMap((c) => {
              const f = path.join(PACKS, lang, `${c}.json`)
              return existsSync(f)
                ? (JSON.parse(readFileSync(f, 'utf8')) as WordPack).lemmas.map((l) =>
                    nfcUpper(l.word),
                  )
                : []
            }),
        )
        index = buildSentenceIndex(parseTatoebaTsv(readFileSync(tsv, 'utf8')), wanted)
      }

      let tatoebaCount = 0
      let generatedCount = 0
      let skipped = 0
      const before = readFileSync(file, 'utf8').length

      for (const lemma of pack.lemmas) {
        const key = gateKey(rel, lemma.word)
        const cached = log[key]
        if (cached && cached.verdict === 'pass' && !cli.force) {
          if (cached.sentence !== lemma.example) lemma.example = cached.sentence
          if (cached.source === 'tatoeba') tatoebaCount++
          else if (cached.source === 'mistral') generatedCount++
          continue
        }
        if (cli.dryRun) {
          const candidate = pickTatoebaCandidate(index, lang, lemma.word)
          if (candidate) {
            tatoebaCount++
            console.log(`${rel} ${lemma.word} <- tatoeba: ${candidate}`)
          } else {
            skipped++
          }
          continue
        }
        // Full pipeline: Tatoeba first, Mistral fallback, CEFR gate on each.
        let entry: ExampleGateEntry | null = null
        for (const s of tatoebaCandidates(index, lang, lemma.word, GATE_TRIES)) {
          const verdict = parseGateVerdict(
            await mistralChat(apiKey!, GATE_SYSTEM, gatePrompt(lang, cefr, s), 0),
          )
          log[gateKey(rel, lemma.word)] = {
            sentence: s,
            source: 'tatoeba',
            verdict: verdict === 'pass' ? 'pass' : 'reject',
            level: cefr,
            at,
          }
          if (verdict === 'pass') {
            entry = log[gateKey(rel, lemma.word)]!
            break
          }
        }
        if (!entry && apiKey) {
          entry = await generateAndGate(rel, lang, cefr, lemma.word, apiKey, log, at)
        }
        if (entry && entry.verdict === 'pass') {
          lemma.example = entry.sentence
          if (entry.source === 'tatoeba') tatoebaCount++
          else generatedCount++
        } else {
          skipped++
        }
      }

      if (cli.dryRun) {
        console.log(
          `${rel} dry-run: ${tatoebaCount} tatoeba candidates, ${skipped} without a qualifying Tatoeba sentence (would need Mistral fallback)`,
        )
        continue
      }

      // Credit Tatoeba wherever a Tatoeba sentence ships (ADR 0048).
      if (tatoebaCount > 0) {
        if (!pack.attribution.includes(TATOEBA_ATTRIBUTION)) {
          pack.attribution.push(TATOEBA_ATTRIBUTION)
        }
        if (!/tatoeba/i.test(pack.license)) {
          pack.license = `${pack.license}; example sentences from Tatoeba, CC-BY 2.0 FR`
        }
      }
      pack.version += 1
      const out = JSON.stringify(pack, null, 2) + '\n'
      writeFileSync(file, out)
      pin[rel] = packPinEntry(pack)
      const after = out.length
      console.log(
        `${rel}: ${tatoebaCount} tatoeba + ${generatedCount} generated, ${skipped} skipped; version ${pack.version}; ${before} -> ${after} bytes (+${after - before})`,
      )
    }
  }

  if (!cli.dryRun) {
    writeFileSync(GATE_LOG, JSON.stringify(log, null, 2) + '\n')
    writeFileSync(PIN_FILE, JSON.stringify(pin, null, 2) + '\n')
  }
}

if (import.meta.main) await main()
