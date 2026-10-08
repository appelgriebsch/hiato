#!/usr/bin/env bun
/**
 * Expand public/packs B2–C2 only (ADR 0028, 0029). Never overwrites A1–B1 lemmas.
 * Sources: CEFR-J B2; Octanove C1/C2; wordhoard v0.1.0 frequency-rank bands (DE/ES);
 * FrequencyWords PT. Same #24 gates as A1–B1: Hunspell membership, person-name
 * list skip, denylist, pack-language gloss (ADR 0030). --dry-run selects without
 * xAI or writes. --repair-gloss rewrites English leaks in any shipped pack's gloss.
 */
import { Database } from 'bun:sqlite'
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'
import path from 'node:path'
import { gunzipSync } from 'node:zlib'
import { loadDenylist, nfcUpper } from './lemma-denylist'
import { loadNameList, onNameList } from './lemma-names'
import { isPersonNameGloss } from './name-gloss'
import { isTemplateGloss, isWrongLanguageGloss } from './gloss-quality'
import { ensureDicts, isWordOfLang } from './lang-membership'
import { filterSynonymChips } from './synonym-chips'
import { generateSynonyms } from './synonym-generate'
import {
  DE_ES_BANDS,
  EXISTING_CEFRS,
  NEW_CEFRS,
  PT_BANDS,
  TARGET,
  type NewCefr,
  type SelectLang as Lang,
  assignExclusiveBands,
  assertPackWriteAllowed,
  bandFloor,
  foldKey,
  hangmanOk,
  isExistingCefr,
  isNewCefr,
  loadFoldKeysFromPackLemmas,
} from './pack-select'

const ROOT = path.join(import.meta.dir, '..')
const DATA = path.join(ROOT, 'scripts/data')
const LANGS = ['en', 'pt', 'de', 'es'] as const

type Lemma = { word: string; gloss?: string; synonyms?: string[] }

const DENY = loadDenylist()
const NAMES = loadNameList()

const EXTRA_STOP = new Set(
  `
OKAY YEAH NAH YEP NOPE GONNA WANNA GOTTA ALRIGHT HELLO THANKS PLEASE
ISSO ISTO VOCÊ VOCÊS QUÉ ÉSTO ESTO ESO VAMOS BUENO TENGO QUIERO
JETZT ALLES WEISS NICHTS ETWAS IMMER WIEDER VIELLEICHT
ABOUT ABOVE AFTER AGAIN AGO ALL ALSO ALWAYS AMONG AROUND AWAY BACK
BECAUSE BEFORE BEHIND BELOW BETWEEN BOTH DURING EACH EITHER ENOUGH EVER EVERY
FURTHER HERE HOW HOWEVER INTO JUST LEAST LESS MANY MAYBE MORE MOST MUCH
NEAR NEVER OFF ONCE ONLY ONTO OTHER OTHERWISE OVER OWN PERHAPS QUITE RATHER
REALLY SAME SINCE SOME SOMEHOW SOMEONE SOMETHING SOMEWHERE STILL SUCH THAN
THEN THERE THEREFORE THESE THIS THOSE THOUGH THROUGH THUS TOO TOWARD TOWARDS
UNDER UNTIL UPON VERY WELL WHAT WHEN WHERE WHETHER WHICH WHILE WHO WHOM WHOSE WHY
WITH WITHIN WITHOUT YET ABLE ACROSS AGAINST ABORIGINE ABNORMAL
AQUELLA AQUELLO ESTOS ESTAS ESOS ESAS MINHAS MEUS TUAS TEUS
PRIMEIRA PRIMEIRO SEGUNDA SEGUNDO AQUELA AQUELE DIESE DIESER DIESES
KEINE DORT HIER DANN DOCH DENN SEHR ALI TUDO NADA NUNCA SEMPRE TAMBÉM ENTÃO ASSIM
FAZER TER COISA DIZER POSSO ACHO FALAR DISSE AINDA DETERMINER
DIABOS XERIFE
ESTAREI ESTARIA ESTIVER ESTAVA ESTAVAM
WOZU WOHER WOHIN WIESO
MÍO MÍA TÚYO SUYO
TENIA TENÍAS
DANKE GRACIAS THANKS SIR HAUSE DESTA NESTE NESTA DESTES DESTAS TIVE SINTO ESPERO QUERO POSSO ACHO VAMOS
`.trim().split(/\s+/).map(nfcUpper),
)

function okLemma(lang: Lang, raw: string): string | null {
  const word = hangmanOk(lang, raw, DENY)
  if (!word || EXTRA_STOP.has(word)) return null
  if (!isWordOfLang(lang, word)) return null
  // B2–C2 frequency bands dump proper names; skip the #24 name list entirely
  // (A1–B1 still keep WILL/MARK with a common-noun gloss).
  if (onNameList(word, NAMES)) return null
  return word
}

function uniqueOk(lang: Lang, words: string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const raw of words) {
    const word = okLemma(lang, raw)
    if (!word) continue
    const key = foldKey(lang, word)
    if (seen.has(key)) continue
    seen.add(key)
    out.push(word)
  }
  return out
}

const CEFRJ_PATH = path.join(DATA, 'cefrj-en-with-b2.json')
const OCTANOVE_PATH = path.join(DATA, 'octanove-vocabulary-profile-c1c2-1.0.csv')
const WORDHOARD_GZ = path.join(DATA, 'wordhoard-v0.1.0.db.gz')
const WORDHOARD_DB = path.join(DATA, 'wordhoard-v0.1.0.db')
const PT_FREQ_PATH = path.join(DATA, 'pt.txt')

const WORDHOARD_GZ_URL =
  'https://github.com/natema/wordhoard/releases/download/v0.1.0/wordhoard.db.gz'
const CEFRJ_CSV_URL =
  'https://raw.githubusercontent.com/openlanguageprofiles/olp-en-cefrj/master/cefrj-vocabulary-profile-1.5.csv'
const OCTANOVE_CSV_URL =
  'https://raw.githubusercontent.com/openlanguageprofiles/olp-en-cefrj/master/octanove-vocabulary-profile-c1c2-1.0.csv'
const PT_FREQ_URL =
  'https://raw.githubusercontent.com/hermitdave/FrequencyWords/master/content/2018/pt/pt_50k.txt'

const CONTENT_POS_EN = /^(noun|verb|adjective|adverb)$/i

async function download(url: string, dest: string, label: string, binary = false): Promise<void> {
  if (existsSync(dest)) return
  console.log(`Downloading ${label}…`)
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Failed to download ${label}: ${res.status}`)
  mkdirSync(path.dirname(dest), { recursive: true })
  if (binary) {
    await Bun.write(dest, await res.arrayBuffer())
  } else {
    await Bun.write(dest, await res.text())
  }
}

function cefrjCacheHasB2(file: string): boolean {
  if (!existsSync(file)) return false
  try {
    const raw = JSON.parse(readFileSync(file, 'utf8')) as Record<string, unknown>
    const b2 = raw.B2 ?? raw.b2
    return Array.isArray(b2) && b2.length > 0
  } catch {
    return false
  }
}

function buildCefrjFromCsv(text: string): Record<string, string[]> {
  const by: Record<string, string[]> = { A1: [], A2: [], B1: [], B2: [] }
  for (const line of text.trim().split('\n').slice(1)) {
    const [head, pos, cefr] = line.split(',')
    if (!cefr || !by[cefr]) continue
    if (!CONTENT_POS_EN.test(pos || '')) continue
    const w = okLemma('en', (head || '').split('/')[0]?.trim() || '')
    if (w) by[cefr].push(w)
  }
  for (const k of Object.keys(by)) by[k] = [...new Set(by[k])]
  return by
}

async function ensureCefrj(): Promise<void> {
  if (cefrjCacheHasB2(CEFRJ_PATH)) return
  console.log('Building cefrj-en-with-b2.json from CEFR-J CSV…')
  const res = await fetch(CEFRJ_CSV_URL)
  if (!res.ok) throw new Error(`CEFR-J download failed: ${res.status}`)
  const by = buildCefrjFromCsv(await res.text())
  if (!by.B2?.length) throw new Error('CEFR-J rebuild produced no B2 lemmas')
  await Bun.write(CEFRJ_PATH, JSON.stringify(by, null, 2) + '\n')
}

function ensureWordhoardDb(): string {
  if (existsSync(WORDHOARD_DB)) return WORDHOARD_DB
  if (!existsSync(WORDHOARD_GZ)) {
    throw new Error(`Missing ${WORDHOARD_GZ} — download wordhoard v0.1.0 first`)
  }
  console.log('Decompressing wordhoard v0.1.0 db…')
  writeFileSync(WORDHOARD_DB, gunzipSync(readFileSync(WORDHOARD_GZ)))
  return WORDHOARD_DB
}

async function ensureSources(): Promise<void> {
  mkdirSync(DATA, { recursive: true })
  await download(PT_FREQ_URL, PT_FREQ_PATH, 'PT FrequencyWords')
  await download(OCTANOVE_CSV_URL, OCTANOVE_PATH, 'Octanove C1/C2')
  await download(WORDHOARD_GZ_URL, WORDHOARD_GZ, 'wordhoard v0.1.0 db.gz', true)
  ensureWordhoardDb()
  await ensureCefrj()
}

function parseCefrjB2(): string[] {
  if (!existsSync(CEFRJ_PATH)) return []
  const raw = JSON.parse(readFileSync(CEFRJ_PATH, 'utf8')) as Record<string, string[]>
  const words = raw.B2 ?? raw.b2 ?? []
  return uniqueOk('en', words)
}

function parseOctanove(): Record<'c1' | 'c2', string[]> {
  const out: Record<'c1' | 'c2', string[]> = { c1: [], c2: [] }
  if (!existsSync(OCTANOVE_PATH)) return out
  const text = readFileSync(OCTANOVE_PATH, 'utf8')
  for (const line of text.trim().split('\n').slice(1)) {
    const [head, pos, cefrRaw] = line.split(',')
    const cefr = (cefrRaw || '').trim().toLowerCase()
    if (cefr !== 'c1' && cefr !== 'c2') continue
    if (!CONTENT_POS_EN.test(pos || '')) continue
    const w = okLemma('en', (head || '').split('/')[0]?.trim() || '')
    if (w) out[cefr].push(w)
  }
  return { c1: uniqueOk('en', out.c1), c2: uniqueOk('en', out.c2) }
}

function parseWordhoardRankList(lang: 'de' | 'es'): string[] {
  const db = new Database(ensureWordhoardDb(), { readonly: true })
  try {
    const rows = db
      .query(
        `SELECT lemma, frequency_rank AS rank
         FROM word
         WHERE lang = ? AND pos IN ('NOUN', 'VERB', 'ADJ', 'ADV')
         ORDER BY frequency_rank ASC`,
      )
      .all(lang) as { lemma: string; rank: number }[]
    return uniqueOk(
      lang,
      rows.map((r) => r.lemma),
    )
  } finally {
    db.close()
  }
}

function deEsBandSlice(all: string[], cefr: NewCefr): string[] {
  const [lo, hi] = DE_ES_BANDS[cefr]
  return all.slice(lo, hi)
}

function parseWordhoardBands(lang: 'de' | 'es'): Record<NewCefr, string[]> {
  const all = parseWordhoardRankList(lang)
  return {
    b2: deEsBandSlice(all, 'b2'),
    c1: deEsBandSlice(all, 'c1'),
    c2: deEsBandSlice(all, 'c2'),
  }
}

function parseFreqPt(): string[] {
  const file = PT_FREQ_PATH
  const lines = readFileSync(file, 'utf8').split('\n')
  const stop = new Set(
    `QUE PARA COM UMA POR MAIS COMO MAS DOS DAS NOS NAS SEM ELE ELA ELES ELAS
     ISSO ISTO AQUI ALI TUDO NADA NUNCA SEMPRE TAMBÉM PORQUE ENTÃO ASSIM
     FAZER VAMOS VOCÊ TER COISA DIZER QUERO ESTAVA POSSO ACHO FALAR DISSE AINDA
     FOI SER ESTAR TEM TÊM FOI FORAM SOBRE ENTRE ATÉ DEPOIS ANTES AGORA HOJE
     MUITO POUCO TODO TODA TODOS OUTRO OUTRA MESMO MESMA BOM BOA BEM MAL
     SEI VOU VAI VÃO QUERO PODE PODEM SOU SOMOS SÃO ERA ERAM ESTOU ESTÁ
     MIM COMIGO CONTIGO NOSCO DELE DELA DELES DELAS NELE NELA`.split(/\s+/).map(nfcUpper),
  )
  const seen = new Set<string>()
  const out: string[] = []
  for (const line of lines) {
    const raw = line.trim().split(/\s+/)[0]
    if (!raw) continue
    const word = okLemma('pt', raw)
    if (!word || stop.has(word) || seen.has(word)) continue
    seen.add(word)
    out.push(word)
  }
  return out.slice(200)
}

function ptBandSlice(all: string[], cefr: NewCefr): string[] {
  const [lo, hi] = PT_BANDS[cefr]
  return all.slice(lo, hi)
}

function spoiler(hay: string, lemma: string): boolean {
  const h = hay.normalize('NFC').toLowerCase()
  const n = lemma.normalize('NFC').toLowerCase().trim()
  if (!n) return false
  const re = new RegExp(`(?:^|[^\\p{L}\\p{M}])${escapeRe(n)}(?:[^\\p{L}\\p{M}]|$)`, 'iu')
  return re.test(h)
}

function escapeRe(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function glossCachePath(lang: Lang) {
  return path.join(DATA, 'gloss-cache', `${lang}.json`)
}

function synonymCachePath(lang: Lang) {
  return path.join(DATA, 'synonym-cache', `${lang}.json`)
}

function loadGlossCache(lang: Lang): Record<string, string> {
  const f = glossCachePath(lang)
  if (!existsSync(f)) return {}
  return JSON.parse(readFileSync(f, 'utf8')) as Record<string, string>
}

function saveGlossCache(lang: Lang, cache: Record<string, string>) {
  mkdirSync(path.dirname(glossCachePath(lang)), { recursive: true })
  writeFileSync(glossCachePath(lang), JSON.stringify(cache, null, 2) + '\n')
}

function loadSynonymCache(lang: Lang): Record<string, string[]> {
  const f = synonymCachePath(lang)
  if (!existsSync(f)) return {}
  return JSON.parse(readFileSync(f, 'utf8')) as Record<string, string[]>
}

function saveSynonymCache(lang: Lang, cache: Record<string, string[]>) {
  mkdirSync(path.dirname(synonymCachePath(lang)), { recursive: true })
  writeFileSync(synonymCachePath(lang), JSON.stringify(cache, null, 2) + '\n')
}

/** On-disk packs not in the write set are frozen exclusive keys (ADR 0028). */
function loadFrozenFoldKeys(lang: Lang, writeLevels: ReadonlySet<string>): Set<string> {
  const packs: { lemmas: { word: string }[] }[] = []
  for (const cefr of [...EXISTING_CEFRS, ...NEW_CEFRS]) {
    if (writeLevels.has(cefr)) continue
    const file = path.join(ROOT, 'public/packs', lang, `${cefr}.json`)
    if (!existsSync(file)) continue
    packs.push(JSON.parse(readFileSync(file, 'utf8')) as { lemmas: { word: string }[] })
  }
  return loadFoldKeysFromPackLemmas(lang, packs)
}

function sourceCandidates(lang: Lang, ptAll: string[] | null): Record<NewCefr, string[]> {
  if (lang === 'en') {
    const oct = parseOctanove()
    return { b2: parseCefrjB2(), c1: oct.c1, c2: oct.c2 }
  }
  if (lang === 'pt') {
    const all = ptAll ?? parseFreqPt()
    return {
      b2: ptBandSlice(all, 'b2'),
      c1: ptBandSlice(all, 'c1'),
      c2: ptBandSlice(all, 'c2'),
    }
  }
  return parseWordhoardBands(lang)
}

function readXaiKey(): string | null {
  const authPath = `${process.env.HOME}/.grok/auth.json`
  if (existsSync(authPath)) {
    try {
      const auth = JSON.parse(readFileSync(authPath, 'utf8')) as Record<
        string,
        { key?: string }
      >
      for (const v of Object.values(auth)) {
        if (v?.key) return v.key
      }
    } catch {
      /* fall through to env */
    }
  }
  return process.env.XAI_API_KEY || null
}

const LANG_NAME: Record<Lang, string> = {
  en: 'English',
  de: 'German',
  es: 'Spanish',
  pt: 'Portuguese',
}

const GLOSS_STYLE: Record<Lang, string> = {
  en: 'Prefer "a/an/the …" or "to …" style definitions.',
  de: 'Schreib ausschließlich auf Deutsch — kein Englisch. Bevorzuge "ein/eine/der …" oder einen Infinitiv ohne "to".',
  es: 'Escribe únicamente en español — nunca inglés. Prefiere "un/una/el …" o un infinitivo sin "to".',
  pt: 'Escreve apenas em português — nunca inglês. Prefere "um/uma/o/a …" ou um infinitivo sem "to".',
}

function glossRejected(lang: Lang, word: string, gloss: string | undefined): boolean {
  if (!gloss || isTemplateGloss(gloss) || spoiler(gloss, word)) return true
  if (onNameList(word, NAMES) && isPersonNameGloss(gloss, lang)) return true
  return isWrongLanguageGloss(lang, gloss, isWordOfLang)
}

async function xaiChat(key: string, system: string, prompt: string, temperature: number): Promise<string> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const res = await fetch('https://api.x.ai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        model: 'grok-4-fast-non-reasoning',
        temperature,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: prompt },
        ],
      }),
    })
    if (res.status === 429) {
      const wait = 1000 * 2 ** attempt
      console.warn(`  xAI 429, backing off ${wait}ms`)
      await Bun.sleep(wait)
      continue
    }
    if (!res.ok) {
      const t = await res.text()
      throw new Error(`xAI API ${res.status}: ${t.slice(0, 300)}`)
    }
    const body = (await res.json()) as {
      choices?: { message?: { content?: string } }[]
    }
    return body.choices?.[0]?.message?.content || ''
  }
  throw new Error('xAI API 429: retries exhausted')
}

function parseJsonObject(content: string): Record<string, unknown> | null {
  const jsonMatch = content.match(/\{[\s\S]*\}/)
  if (!jsonMatch) return null
  try {
    return JSON.parse(jsonMatch[0]) as Record<string, unknown>
  } catch {
    return null
  }
}

function lookupParsed(parsed: Record<string, unknown>, w: string): unknown {
  return (
    parsed[w] ??
    parsed[w.toLowerCase()] ??
    parsed[nfcUpper(w)] ??
    Object.entries(parsed).find(([k]) => nfcUpper(k) === w)?.[1]
  )
}

async function generateGlosses(
  lang: Lang,
  words: string[],
  cache: Record<string, string>,
): Promise<void> {
  const missing = words.filter((w) => glossRejected(lang, w, cache[w]))
  if (missing.length === 0) return

  const key = readXaiKey()
  if (!key) {
    throw new Error(
      `Need glosses for ${missing.length} ${lang} lemmas but no xAI key (set XAI_API_KEY or ~/.grok/auth.json)`,
    )
  }

  const BATCH = 60
  console.log(`Generating ${missing.length} ${lang} glosses in batches of ${BATCH}…`)
  for (let i = 0; i < missing.length; i += BATCH) {
    const batch = missing.slice(i, i + BATCH)
    const prompt =
      `Language: ${LANG_NAME[lang]} (${lang}).\n` +
      `Write a short learner dictionary gloss for each lemma in ${LANG_NAME[lang]} only (one simple sentence or clause).\n` +
      `Rules: never include the lemma itself as a whole word in its gloss (do not start with the lemma); ` +
      `no letter-count or classroom-template fluff; no NSFW; never define a lemma as a given name, surname, or person. ${GLOSS_STYLE[lang]}\n` +
      `Return JSON object mapping each UPPERCASE lemma to its gloss string.\n` +
      `Lemmas:\n${batch.join('\n')}`

    const content = await xaiChat(
      key,
      `You write concise learner-dictionary glosses in ${LANG_NAME[lang]} only (ADR 0030). Reply with a single JSON object only.`,
      prompt,
      0.2,
    )
    const parsed = parseJsonObject(content)
    if (!parsed) throw new Error(`No JSON in gloss response: ${content.slice(0, 200)}`)
    for (const w of batch) {
      const g = lookupParsed(parsed, w)
      if (!g || typeof g !== 'string') {
        console.warn(`  missing gloss for ${w}`)
        continue
      }
      const gloss = g.trim()
      if (glossRejected(lang, w, gloss)) {
        console.warn(`  rejected gloss for ${w}: ${gloss.slice(0, 60)}`)
        continue
      }
      cache[w] = gloss
    }
    saveGlossCache(lang, cache)
    console.log(`  ${lang} glosses ${Math.min(i + BATCH, missing.length)}/${missing.length}`)
  }

  let leftovers = words.filter((w) => glossRejected(lang, w, cache[w]))
  for (let attempt = 0; attempt < 3 && leftovers.length; attempt++) {
    console.log(`  ${lang} retry ${attempt + 1}: ${leftovers.length} leftovers`)
    for (let i = 0; i < leftovers.length; i += 20) {
      const batch = leftovers.slice(i, i + 20)
      const prompt =
        `Language: ${LANG_NAME[lang]} (${lang}).\n` +
        `For each lemma, write a short ${LANG_NAME[lang]} learner gloss that does NOT contain the lemma as a whole word at all.\n` +
        `${GLOSS_STYLE[lang]} Define the meaning using other ${LANG_NAME[lang]} words only. JSON object mapping UPPERCASE lemma → gloss.\n` +
        batch.map((w) => `- ${w}`).join('\n')
      try {
        const content = await xaiChat(
          key,
          `JSON only. Gloss in ${LANG_NAME[lang]} only (ADR 0030). Each gloss must avoid the headword as a whole word (ADR 0023).`,
          prompt,
          0.4,
        )
        const parsed = parseJsonObject(content)
        if (!parsed) continue
        for (const w of batch) {
          const g = lookupParsed(parsed, w)
          if (!g || typeof g !== 'string') continue
          const gloss = g.trim()
          if (glossRejected(lang, w, gloss)) continue
          cache[w] = gloss
        }
      } catch {
        /* retry leftover batch later */
      }
      saveGlossCache(lang, cache)
    }
    leftovers = words.filter((w) => glossRejected(lang, w, cache[w]))
  }
  if (leftovers.length) {
    console.warn(`  ${lang} still missing glosses: ${leftovers.join(', ')}`)
  }
}

function cleanSynonyms(lemma: string, raw: unknown): string[] {
  const list = Array.isArray(raw)
    ? raw.filter((x): x is string => typeof x === 'string')
    : typeof raw === 'string'
      ? raw.split(/[,;|/]/)
      : []
  return filterSynonymChips(lemma, list, DENY)
}

function attribution(lang: Lang, cefr: NewCefr): { license: string; attribution: string[] } {
  const level = cefr.toUpperCase()
  if (lang === 'en' && cefr === 'b2') {
    return {
      license:
        'CEFR-J Wordlist terms: free use with citation (© Tono Laboratory, TUFS)',
      attribution: [
        `Hiato EN ${level} learner pack — original glosses and synonym chips (2026).`,
        'The CEFR-J Wordlist Version 1.5. Compiled by Yukio Tono, Tokyo University of Foreign Studies. Retrieved from http://www.cefr-j.org/download.html on 1/20/2020 (via openlanguageprofiles/olp-en-cefrj).',
        'English B2 lemmas selected from that wordlist at the same level. Not a public-domain dedication and not a verbatim dump. Glosses and synonym chips are original Hiato learner copy.',
      ],
    }
  }
  if (lang === 'en') {
    return {
      license:
        'CC-BY-SA-4.0 (lemmas from Octanove Vocabulary Profile C1/C2; glosses original to Hiato)',
      attribution: [
        `Hiato EN ${level} learner pack — original glosses and synonym chips (2026).`,
        'English C1/C2 lemmas selected from the Octanove Vocabulary Profile (CC-BY-SA-4.0) as a tagged add-on above CEFR-J.',
        'Creator: Octanove Labs. Source: https://github.com/openlanguageprofiles/olp-en-cefrj',
        'Share-alike applies to the redistributed lemma list. Glosses and synonym chips are original Hiato learner copy (2026).',
      ],
    }
  }
  if (lang === 'pt') {
    return {
      license: 'CC-BY-SA-4.0 (FrequencyWords pt_50k; glosses original to Hiato)',
      attribution: [
        `Hiato PT ${level} learner pack — original glosses and synonym chips (2026).`,
        'Portuguese lemmas, including the original v0 packs and later bands, come from hermitdave/FrequencyWords content/2018/pt/pt_50k.txt (OpenSubtitles frequency). Content CC-BY-SA-4.0; the FrequencyWords code is MIT. Not a Wiktionary dump.',
        'Creator: Hermit Dave. Source: https://github.com/hermitdave/FrequencyWords',
        'C-levels are frequency-rank slices, not CAPLE lists (ADR 0029).',
        'Glosses and synonym chips are original Hiato learner copy (2026).',
      ],
    }
  }
  const names: Record<'de' | 'es', string> = { de: 'DE', es: 'ES' }
  const honesty =
    lang === 'de'
      ? 'DE B2–C2 lemmas are frequency-rank bands from wordhoard v0.1.0 (CC-BY-SA-4.0). German CEFR labels in that dataset are calibrated against Goethe-Institut lists, not copied from them (ADR 0029).'
      : 'ES B2–C2 lemmas are frequency-rank bands from wordhoard v0.1.0 (CC-BY-SA-4.0), not Instituto Cervantes lists (ADR 0029).'
  return {
    license:
      'CC-BY-SA-4.0 (lemmas from wordhoard frequency-rank bands; glosses original to Hiato)',
    attribution: [
      `Hiato ${names[lang]} ${level} learner pack — original glosses and synonym chips (2026).`,
      honesty,
      'Creator: natema. Source: https://github.com/natema/wordhoard. Also credit Wiktionary contributors and OpenSubtitles via hermitdave/FrequencyWords, as the wordhoard NOTICE requires.',
      'Share-alike applies to the redistributed lemma list. Glosses and synonym chips are original Hiato learner copy (2026).',
    ],
  }
}

function hasRealGloss(lang: Lang, word: string, cache: Record<string, string>): boolean {
  return !glossRejected(lang, word, cache[word])
}

function buildLemmas(
  lang: Lang,
  words: string[],
  glossCache: Record<string, string>,
  synCache: Record<string, string[]>,
): Lemma[] {
  const lemmas: Lemma[] = []
  for (const w of words) {
    const gloss = glossCache[w]
    if (glossRejected(lang, w, gloss)) {
      throw new Error(`${lang}: missing real gloss for ${w}`)
    }
    const synonyms = cleanSynonyms(w, synCache[w])
    lemmas.push({
      word: w,
      gloss,
      ...(synonyms.length ? { synonyms } : {}),
    })
  }
  return lemmas
}

function parseArgs(argv: string[]) {
  let dryRun = false
  let repairGloss = false
  let forceGloss = false
  let levels: NewCefr[] = [...NEW_CEFRS]
  const langs: Lang[] = [...LANGS]
  for (const a of argv) {
    if (a === '--dry-run') dryRun = true
    else if (a === '--repair-gloss') repairGloss = true
    else if (a === '--force-gloss') forceGloss = true
    else if (a.startsWith('--levels=')) {
      const parts = a
        .slice('--levels='.length)
        .split(',')
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean)
      if (parts.length === 0) throw new Error('--levels= must list at least one of b2,c1,c2')
      for (const p of parts) {
        assertPackWriteAllowed(`${p}.json`, p)
        if (!isNewCefr(p)) throw new Error(`invalid level ${p}`)
      }
      levels = parts as NewCefr[]
    }
  }
  return { dryRun, repairGloss, forceGloss, levels, langs }
}

function writePack(lang: Lang, cefr: NewCefr, lemmas: Lemma[]) {
  const outFile = path.join(ROOT, 'public/packs', lang, `${cefr}.json`)
  assertPackWriteAllowed(outFile, cefr)
  const meta = attribution(lang, cefr)
  const pack = {
    version: 3,
    lang,
    cefr,
    license: meta.license,
    attribution: meta.attribution,
    lemmas,
  }
  writeFileSync(outFile, JSON.stringify(pack, null, 2) + '\n')
  console.log(`${lang}/${cefr}: wrote ${lemmas.length} lemmas`)
}

type ShippedPack = {
  version: number
  lang: Lang
  cefr: string
  license: string
  attribution: string[]
  lemmas: Lemma[]
}

async function repairGlossLanguage(langs: Lang[]): Promise<void> {
  for (const lang of langs) {
    const cache = loadGlossCache(lang)
    const need = new Set<string>()
    const packs: { file: string; cefr: string; pack: ShippedPack }[] = []
    for (const cefr of [...EXISTING_CEFRS, ...NEW_CEFRS]) {
      const file = path.join(ROOT, 'public/packs', lang, `${cefr}.json`)
      if (!existsSync(file)) continue
      const pack = JSON.parse(readFileSync(file, 'utf8')) as ShippedPack
      packs.push({ file, cefr, pack })
      for (const L of pack.lemmas) {
        const w = nfcUpper(L.word)
        if (L.gloss && !cache[w]) cache[w] = L.gloss
        if (!hasRealGloss(lang, w, cache)) need.add(w)
      }
    }
    await generateGlosses(lang, [...need], cache)
    saveGlossCache(lang, cache)
    for (const { file, cefr, pack } of packs) {
      let changed = 0
      for (const L of pack.lemmas) {
        const w = nfcUpper(L.word)
        const g = cache[w]
        if (g && g !== L.gloss && hasRealGloss(lang, w, cache)) {
          L.gloss = g
          changed++
        }
      }
      if (!changed) continue
      if (!isExistingCefr(cefr)) assertPackWriteAllowed(file, cefr)
      pack.version = pack.version + 1
      writeFileSync(file, JSON.stringify(pack, null, 2) + '\n')
      console.log(`${lang}/${cefr}: repaired ${changed} glosses`)
    }
  }
}

async function main() {
  const { dryRun, repairGloss, forceGloss, levels, langs } = parseArgs(
    process.argv.slice(2),
  )
  await ensureDicts()
  await ensureSources()

  if (repairGloss) {
    if (dryRun) {
      console.log('dry-run: skip --repair-gloss writes')
      return
    }
    await repairGlossLanguage(langs)
    return
  }

  const ptAll = langs.includes('pt') ? parseFreqPt() : null
  const writeSet = new Set<string>(levels)

  const selections: Record<string, Record<NewCefr, string[]>> = {}
  for (const lang of langs) {
    const frozen = loadFrozenFoldKeys(lang, writeSet)
    const candidates = sourceCandidates(lang, ptAll)
    const byBand: Record<NewCefr, string[]> = { b2: [], c1: [], c2: [] }
    for (const cefr of levels) byBand[cefr] = candidates[cefr]
    const assigned = assignExclusiveBands(lang, frozen, byBand, TARGET, DENY)
    selections[lang] = assigned

    for (const cefr of levels) {
      const sourceOk = candidates[cefr].length
      const n = assigned[cefr].length
      console.log(
        `${lang}/${cefr}: hangman-ok ${sourceOk} in-band → exclusive ${n} (frozen subtract ${frozen.size})`,
      )
      const floor = bandFloor(cefr)
      if (n < floor) {
        throw new Error(
          `${lang}/${cefr}: exclusive ${n} below floor ${floor} after frozen subtract (no other-band top-up)`,
        )
      }
    }
  }

  if (dryRun) {
    console.log('dry-run: skip gloss/synonym generation and pack writes')
    return
  }

  for (const lang of langs) {
    const glossCache = loadGlossCache(lang)
    const synCache = loadSynonymCache(lang)
    const needGloss = new Set<string>()
    const needSyn = new Set<string>()
    for (const cefr of levels) {
      for (const w of selections[lang]![cefr]!) {
        if (lang !== 'en' && (forceGloss || glossRejected(lang, w, glossCache[w]))) {
          delete glossCache[w]
        }
        if (!hasRealGloss(lang, w, glossCache)) needGloss.add(w)
        if (cefr === 'c1' || cefr === 'c2') needSyn.add(w)
      }
    }
    await generateGlosses(lang, [...needGloss], glossCache)
    saveGlossCache(lang, glossCache)
    await generateSynonyms(lang, [...needSyn], synCache, DENY, (cache) =>
      saveSynonymCache(lang, cache),
    )
    saveSynonymCache(lang, synCache)

    for (const cefr of levels) {
      const selected = selections[lang]![cefr]!.filter((w) =>
        hasRealGloss(lang, w, glossCache),
      )
      const floor = bandFloor(cefr)
      if (selected.length < floor) {
        throw new Error(
          `${lang}/${cefr}: only ${selected.length} glossed lemmas after filters (floor ${floor}); no other-band top-up`,
        )
      }
      const sliced = selected.slice(0, TARGET)
      if (cefr === 'c1' || cefr === 'c2') {
        const withSyn = sliced.filter((w) => cleanSynonyms(w, synCache[w]).length > 0).length
        const pct = sliced.length ? withSyn / sliced.length : 0
        if (pct < 0.8) {
          console.warn(
            `  ${lang}/${cefr}: synonym coverage ${(pct * 100).toFixed(0)}% < 80% (unique referents allowed; not failing the run)`,
          )
        }
      }
      const lemmas = buildLemmas(lang, sliced, glossCache, synCache)
      writePack(lang, cefr, lemmas)
    }
  }
}

await main()
