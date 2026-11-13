#!/usr/bin/env bun
/**
 * Example-sentence pipeline (ADR 0048/0049, #225/#247). Pilot: EN + DE A1–B1.
 *
 * Source 1: Tatoeba per-language sentence dump (CC-BY 2.0 FR) — one sentence per
 * lemma: whole-Unicode-word match, shortest/cleanest, denylist + person-name
 * guards. Source 2 (fallback): original Hiato sentence, generated and
 * level-checked with xAI (grok-4.7, reasoning_effort medium, via XAI_API_KEY
 * or ~/.grok/auth.json; XAI_MODEL and XAI_REASONING_EFFORT override). Tatoeba
 * is optional (--no-tatoeba, or when the dump download fails): the pipeline
 * then ships generated-only examples. Every candidate passes an xAI
 * CEFR gate against the pack level; failures are rejected, not patched.
 * Verdicts cached in scripts/data/example-gate.json; packs:check enforces it.
 * The gate log and pin are persisted after every lemma and pack level, so a
 * re-run resumes where a previous run stopped and skips levels that are
 * already complete (no cached-pass misses, no --force) without writing again.
 *
 * --dry-run selects Tatoeba sentences without xAI calls or writes.
 * Run locally with XAI_API_KEY (or ~/.grok/auth.json).
 * Committed artifacts are public/packs + scripts/data/example-gate.json.
 */
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { EXAMPLE_SENTENCE_MAX, type PackCefr, type PackLang, type WordPack } from '../src/packs/schema'
import { spoilerContains } from '../src/packs/spoilers'
import { isDeniedGlossToken, letterTokens, loadDenylist, nfcUpper } from './lemma-denylist'
import { loadNameList, onNameList } from './lemma-names'
import { GATE_VERSION, isCurrentPass } from './example-gate'
import { stockNameInText } from './tatoeba-stock-names'
import { readXaiKey, xaiChat } from './xai-chat'
import { packPinEntry } from './pack-pin'

export { GATE_VERSION, isCurrentPass }

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
/** Concurrent gate/generate pipelines across lemmas of one pack level. */
const CONCURRENCY = 4
/** Shortest sentence we accept; shorter reads as telegraphic, not a sentence. */
const SENTENCE_MIN = 10

export type GateSource = 'tatoeba' | 'xai' | 'mistral' | 'fixture'
export type GateVerdict = 'pass' | 'reject'

export type ExampleGateEntry = {
  sentence: string
  source: GateSource
  verdict: GateVerdict
  level: string
  at: string
  gate: number
  /** Set on rejects: the gate's one-line reason. */
  reason?: string
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
 * (profanity/slur) tokens, no capitalized person names, and no Tatoeba stock
 * persona names at any position (#247 reopen). The lemma itself is exempt from
 * both the denylist (isDeniedGlossToken skips it) and the stock-name guard, so
 * a lemma that equals a stock name (e.g. JACK) can still get an example.
 */
export function sentenceAllowed(sentence: string, lang: PackLang, word: string): boolean {
  if (!spoilerContains(sentence, word)) return false
  if (stockNameInText(sentence, word)) return false
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

/** Parse the CEFR gate answer, keeping the one-line reason after PASS/FAIL. */
export function parseGateVerdict(content: string): { verdict: GateVerdict; reason: string } | null {
  const m = /^\s*(PASS|FAIL)\b\s*[:—–-]?\s*(.*)$/is.exec(content)
  if (!m) return null
  return {
    verdict: m[1]!.toUpperCase() === 'PASS' ? 'pass' : 'reject',
    reason: m[2]!.split(/\r?\n/, 1)[0]!.trim(),
  }
}

function gateEntry(
  sentence: string,
  source: GateSource,
  parsed: { verdict: GateVerdict; reason: string } | null,
  level: string,
  at: string,
): ExampleGateEntry {
  const verdict = parsed?.verdict === 'pass' ? 'pass' : 'reject'
  const entry: ExampleGateEntry = { sentence, source, verdict, level, at, gate: GATE_VERSION }
  if (verdict === 'reject') entry.reason = parsed ? parsed.reason || 'no reason given' : 'unparseable gate answer'
  return entry
}

/**
 * Log a verdict. A reject of the sentence already shipped on the lemma is kept
 * under `|reject` when a later candidate replaces the lemma key (#247).
 */
export function recordGateEntry(
  log: ExampleGateLog,
  rel: string,
  word: string,
  entry: ExampleGateEntry,
  shipped?: string,
): void {
  const key = gateKey(rel, word)
  const prev = log[key]
  if (
    shipped &&
    prev?.verdict === 'reject' &&
    prev.sentence === shipped &&
    entry.sentence !== shipped
  ) {
    log[`${key}|reject`] = prev
  }
  log[key] = entry
}

/** `null` drops a stale example when the re-gate does not pass (#247). */
export function setLemmaExample(lemma: { example?: string }, sentence: string | null): void {
  if (sentence) lemma.example = sentence
  else delete lemma.example
}

export const CONTENT_RULE =
  'It must suit a general-audience learning app: no death, killing, crime or prison, ' +
  'violence or threats, sex or affairs, drugs, self-harm, or illness used for shock.'

const GATE_SYSTEM =
  'You judge whether a sentence fits a CEFR level and sense for language learners, ' +
  'and whether it suits a general-audience app. ' +
  'Answer exactly "PASS" or "FAIL" followed by a one-line reason.'

export function gatePrompt(
  lang: PackLang,
  cefr: PackCefr,
  sentence: string,
  word: string,
  gloss?: string,
): string {
  const lines = [
    `Language: ${LANG_NAMES[lang]} (${lang}). CEFR level: ${cefr.toUpperCase()}.`,
    `Word: "${word}"${gloss ? ` — meaning: "${gloss}"` : ''}.`,
    `Sentence: "${sentence}"`,
    `PASS only if all of these hold:`,
    `1. Every word and structure is within CEFR ${cefr.toUpperCase()} for learners of ${LANG_NAMES[lang]}.`,
  ]
  if (gloss) {
    lines.push(`2. The sentence uses "${word}" in the meaning given by the gloss above.`)
  }
  lines.push(`3. ${CONTENT_RULE}`)
  return lines.join('\n')
}

const GEN_SYSTEM =
  'You write one short example sentence for a language-learning app. ' +
  'Output only the sentence, nothing else.'

export function generatePrompt(
  lang: PackLang,
  cefr: PackCefr,
  word: string,
  gloss?: string,
): string {
  const lines = [
    `Language: ${LANG_NAMES[lang]} (${lang}). CEFR level: ${cefr.toUpperCase()}.`,
    `Word: "${word}"${gloss ? ` — meaning: "${gloss}"` : ''}.`,
    `Write one original sentence in ${LANG_NAMES[lang]} at CEFR ${cefr.toUpperCase()} level that uses "${word}" as a whole word in the meaning given above.`,
    `At most 140 characters. No real person names. ${CONTENT_RULE} No translation. Output only the sentence.`,
  ]
  return lines.join('\n')
}

async function generateAndGate(
  rel: string,
  lang: PackLang,
  cefr: PackCefr,
  word: string,
  gloss: string | undefined,
  apiKey: string,
  log: ExampleGateLog,
  at: string,
  shipped?: string,
): Promise<ExampleGateEntry | null> {
  for (let i = 0; i < GENERATE_TRIES; i++) {
    const out = await xaiChat(apiKey, GEN_SYSTEM, generatePrompt(lang, cefr, word, gloss), 0.7)
    const s = cleanSentence(out)
    if (!s || !sentenceAllowed(s, lang, word)) continue
    const parsed = parseGateVerdict(
      await xaiChat(apiKey, GATE_SYSTEM, gatePrompt(lang, cefr, s, word, gloss), 0),
    )
    const entry = gateEntry(s, 'xai', parsed, cefr, at)
    recordGateEntry(log, rel, word, entry, shipped)
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
      for (let attempt = 1; attempt <= 3; attempt++) {
        console.log(`downloading ${tatoebaUrl(lang)} (attempt ${attempt}/3)`)
        try {
          const res = await fetch(tatoebaUrl(lang), {
            signal: AbortSignal.timeout(10 * 60_000),
          })
          if (!res.ok || !res.body) throw new Error(`Tatoeba ${lang} dump ${res.status}`)
          await Bun.write(bz2, await res.arrayBuffer())
          break
        } catch (err) {
          rmSync(bz2, { force: true })
          if (attempt === 3) throw err
          console.warn(`  download attempt ${attempt} failed, retrying`)
        }
      }
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
  noTatoeba: boolean
}

function parseCli(argv: string[]): Cli {
  const langs: PackLang[] = []
  const levels: PackCefr[] = []
  let dryRun = false
  let force = false
  let sentencesFile: string | undefined
  let noTatoeba = false
  for (const a of argv) {
    if (a === '--dry-run') dryRun = true
    else if (a === '--force') force = true
    else if (a === '--no-tatoeba') noTatoeba = true
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
    noTatoeba,
  }
}

const TATOEBA_ATTRIBUTION =
  'Example sentences selected from Tatoeba (https://tatoeba.org), licensed CC-BY 2.0 FR.'
const TATOEBA_LICENSE = '; example sentences from Tatoeba, CC-BY 2.0 FR'

/** CC-BY credit for packs that still ship a Tatoeba sentence; drop it when none do. */
export function applyTatoebaCredit(
  pack: { attribution: string[]; license: string },
  tatoebaCount: number,
): void {
  if (tatoebaCount > 0) {
    if (!pack.attribution.includes(TATOEBA_ATTRIBUTION)) pack.attribution.push(TATOEBA_ATTRIBUTION)
    if (!pack.license.includes(TATOEBA_LICENSE)) pack.license += TATOEBA_LICENSE
    return
  }
  pack.attribution = pack.attribution.filter((line) => line !== TATOEBA_ATTRIBUTION)
  if (pack.license.endsWith(TATOEBA_LICENSE)) {
    pack.license = pack.license.slice(0, -TATOEBA_LICENSE.length)
  }
}

async function mapPool<T, R>(
  items: readonly T[],
  size: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const out: R[] = new Array(items.length)
  let next = 0
  await Promise.all(
    Array.from({ length: Math.min(size, items.length) }, async () => {
      while (next < items.length) {
        const i = next++
        out[i] = await fn(items[i]!)
      }
    }),
  )
  return out
}

/** Tatoeba-first pipeline with an xAI fallback and CEFR gate; resolves the shipped source. */
async function gateLemma(
  rel: string,
  lang: PackLang,
  cefr: PackCefr,
  lemma: WordPack['lemmas'][number],
  index: Map<string, string[]>,
  apiKey: string,
  log: ExampleGateLog,
  at: string,
): Promise<'tatoeba' | 'xai' | null> {
  const shipped = lemma.example
  for (const s of tatoebaCandidates(index, lang, lemma.word, GATE_TRIES)) {
    const parsed = parseGateVerdict(
      await xaiChat(apiKey, GATE_SYSTEM, gatePrompt(lang, cefr, s, lemma.word, lemma.gloss), 0),
    )
    const entry = gateEntry(s, 'tatoeba', parsed, cefr, at)
    recordGateEntry(log, rel, lemma.word, entry, shipped)
    if (entry.verdict === 'pass') {
      setLemmaExample(lemma, s)
      return 'tatoeba'
    }
  }
  const generated = await generateAndGate(
    rel,
    lang,
    cefr,
    lemma.word,
    lemma.gloss,
    apiKey,
    log,
    at,
    shipped,
  )
  if (generated?.verdict === 'pass') {
    setLemmaExample(lemma, generated.sentence)
    return 'xai'
  }
  setLemmaExample(lemma, null)
  return null
}

async function main() {
  const cli = parseCli(process.argv.slice(2))
  const apiKey = readXaiKey()
  if (!cli.dryRun && !apiKey) {
    console.error('set XAI_API_KEY (or ~/.grok/auth.json)')
    process.exit(1)
  }
  const at = new Date().toISOString().slice(0, 10)
  const log = loadExampleGateLog()
  const pin = JSON.parse(readFileSync(PIN_FILE, 'utf8')) as Record<string, unknown>
  // Persist verdicts incrementally: a crashed or re-run job then resumes here.
  const persist = (): void => {
    writeFileSync(GATE_LOG, JSON.stringify(log, null, 2) + '\n')
    writeFileSync(PIN_FILE, JSON.stringify(pin, null, 2) + '\n')
  }

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
      // Tatoeba selection runs even in --dry-run (no xAI, no writes);
      // --sentences-file points at an already-downloaded TSV instead.
      if (!index) {
        let tsv = cli.sentencesFile
        if (!tsv && !cli.noTatoeba) {
          try {
            tsv = await fetchTatoebaTsv(lang)
          } catch (err) {
            console.warn(
              `Tatoeba dump for ${lang} unavailable (${(err as Error).message}); continuing with generated-only examples`,
            )
          }
        }
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
        index = tsv
          ? buildSentenceIndex(parseTatoebaTsv(readFileSync(tsv, 'utf8')), wanted)
          : new Map()
      }

      let tatoebaCount = 0
      let generatedCount = 0
      let skipped = 0
      const original = readFileSync(file, 'utf8')

      const pending: WordPack['lemmas'] = []
      for (const lemma of pack.lemmas) {
        const key = gateKey(rel, lemma.word)
        const cached = log[key]
        // Gate version 2 (#247 reopen): entries with no version or version 1 are
        // stale — every existing verdict must re-run once under the stricter gate.
        if (isCurrentPass(cached) && !cli.force) {
          if (cached.sentence !== lemma.example) lemma.example = cached.sentence
          if (cached.source === 'tatoeba') tatoebaCount++
          else if (cached.source === 'xai' || cached.source === 'mistral') generatedCount++
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
        pending.push(lemma)
      }

      if (pending.length) {
        const sources = await mapPool(pending, CONCURRENCY, async (lemma) => {
          const source = await gateLemma(rel, lang, cefr, lemma, index!, apiKey!, log, at)
          persist()
          return source
        })
        for (const source of sources) {
          if (source === 'tatoeba') tatoebaCount++
          else if (source === 'xai') generatedCount++
          else skipped++
        }
      }

      if (cli.dryRun) {
        console.log(
          `${rel} dry-run: ${tatoebaCount} tatoeba candidates, ${skipped} without a qualifying Tatoeba sentence (would need an xAI fallback)`,
        )
        continue
      }

      applyTatoebaCredit(pack, tatoebaCount)
      let out = JSON.stringify(pack, null, 2) + '\n'
      if (out === original) {
        console.log(`${rel}: pack already up to date, no changes (${skipped} skipped)`)
      } else {
        pack.version += 1
        out = JSON.stringify(pack, null, 2) + '\n'
        writeFileSync(file, out)
        pin[rel] = packPinEntry(pack)
        console.log(
          `${rel}: ${tatoebaCount} tatoeba + ${generatedCount} generated, ${skipped} skipped; version ${pack.version}; ${original.length} -> ${out.length} bytes (+${out.length - original.length})`,
        )
      }
      persist()
    }
  }
}

if (import.meta.main) await main()
