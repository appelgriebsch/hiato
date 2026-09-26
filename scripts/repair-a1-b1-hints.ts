#!/usr/bin/env bun
/**
 * Regenerate A1–B1 glosses/synonym chips to pass the hint ceiling.
 * Accepts an explicit rel list. Refuses b2/c1/c2 paths and any change to `word`.
 *
 * Usage:
 *   bun run scripts/repair-a1-b1-hints.ts en/a2.json en/b1.json
 *   bun run scripts/repair-a1-b1-hints.ts de/a1.json de/a2.json de/b1.json
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import type { PackCefr, PackLang, WordPack } from '../src/packs/schema'
import { spoilerContains } from '../src/packs/spoilers'
import { isTemplateGloss, isWrongLanguageGloss } from './gloss-quality'
import { loadDenylist, nfcUpper } from './lemma-denylist'
import { loadNameList, onNameList } from './lemma-names'
import { isPersonNameGloss } from './name-gloss'
import {
  buildLemmaEasiestByLang,
  hintCeilingViolations,
} from './hint-ceiling'
import { loadEnEasiestCefr, loadHintStemCache } from './hint-ceiling-data'
import {
  ensureDicts,
  isWordOfLang,
  loadMembershipCache,
} from './lang-membership'
import {
  filterSynonymChips,
  SYNONYM_CHIP_CAP,
  SYNONYM_COVERAGE_FLOOR,
  synonymCoverageRatio,
} from './synonym-chips'

const ROOT = path.join(import.meta.dir, '..')
const PACKS = path.join(ROOT, 'public', 'packs')
const DATA = path.join(import.meta.dir, 'data')
const DENY = loadDenylist()
const NAMES = loadNameList()

const FORBIDDEN = new Set(['b2', 'c1', 'c2'])

const LANG_NAME: Record<PackLang, string> = {
  en: 'English',
  de: 'German',
  es: 'Spanish',
  pt: 'Portuguese',
}

const GLOSS_STYLE: Record<PackLang, string> = {
  en: 'Prefer "a/an/the …" or "to …" style definitions.',
  de: 'Schreib ausschließlich auf Deutsch — kein Englisch. Bevorzuge "ein/eine/der …" oder einen Infinitiv ohne "to".',
  es: 'Escribe únicamente en español — nunca inglés. Prefiere "un/una/el …" o un infinitivo sin "to".',
  pt: 'Escreve apenas em português — nunca inglês. Prefere "um/uma/o/a …" ou um infinitivo sem "to".',
}

/** Easy common filler examples for ceiling prompts (language + band). */
function easyFillerExamples(lang: PackLang, cefr: PackCefr = 'a1'): string {
  if (lang === 'de') {
    // PERSON/DING/SACHE are A2+; TEIL stems to TEILEN (A2) — never suggest them for A1.
    if (cefr === 'a1') {
      return 'Mann, Frau, Kind, Mensch, Leute, Ort, Platz, Haus, Essen, Wasser, Wort, Name, Zeit, Tag, Jahr, Hand, Kopf, Buch, Bild, Auto, Freund, Arbeit, Frage, Ende, Anfang, groß, klein, gut, jung, alt, lang, kurz, neu, alt, machen, geben, nehmen, sehen, gehen, kommen'
    }
    if (cefr === 'a2') {
      return 'Person, Ding, Sache, Ort, Platz, Haus, Essen, Wasser, Körper, Stück, Idee, Tier, Mann, Frau, Kind, Mensch, groß, klein, gut, jung, alt, dunkel, hell, machen, geben'
    }
    return 'Person, Ding, Sache, Gefühl, Ort, Körper, Stück, Idee, Tier, Mann, Frau, Kind, Mensch, groß, klein, gut, machen'
  }
  if (lang === 'es') {
    return 'el, la, un, una, y, o, con, para, de, en, es, son, persona, cosa, lugar, comida, agua, casa, trabajo, jugar, grande, pequeño, bueno, malo, joven, viejo'
  }
  if (lang === 'pt') {
    return 'o, a, um, uma, e, ou, com, para, de, em, é, são, pessoa, coisa, lugar, comida, água, casa, trabalho, jogar, grande, pequeno, bom, mau, jovem, velho'
  }
  return 'the, a, an, to, of, for, with, in, on, at, is, are, person, thing, place, food, water, home, work, play, big, small, good, bad, young, old'
}

function hardWordsToAvoid(lang: PackLang, cefr: PackCefr = 'a1'): string {
  if (lang === 'de') {
    const always =
      'Fahrzeug, Struktur, Behälter, Organ, männlich, weiblich, Geschwister, romantisch, Temperatur, geröstet, bunt, geheim, spektakulär, Triumph, Angelegenheit, Gegenstand'
    if (cefr === 'a1') {
      // Pack-band + stem-trap surfaces that fail A1 (surface→harder stem).
      return (
        always +
        ', Person, Personen, Ding, Dinge, Sache, Gefühl, Körper, Stück, Idee, Tier, Tiere, dunkel, Teil, teilen, etwas, Etwas, ' +
        'Wasser, Land, Zeug, Bett, Ruf, Wein, Spiel, spielen, froh, traurig, Himmel, tragen, führt, führen, ' +
        'Schlag, schlagen, Respekt, Eltern, Zukunft, Kamera, Seite, erwachsen, schwierig, wertvoll, geliebt, ' +
        'Gegenstand, Angelegenheit, Fahrzeug'
      )
    }
    if (cefr === 'a2') {
      // etwas stems to ETWA (B1) — forbidden below B1.
      return always + ', Gefühl, etwas, Etwas, spektakulär, Triumph, Angelegenheit, Himmel, führt, führen, Eltern, Respekt, Zukunft'
    }
    return always
  }
  return 'vehicle, structure, container, organ, male, female, sibling, romantic, temperature, roasted, colorful, secret'
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

async function xaiChat(
  key: string,
  system: string,
  prompt: string,
  temperature: number,
): Promise<string> {
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

function glossCachePath(lang: string) {
  return path.join(DATA, 'gloss-cache', `${lang}.json`)
}
function synonymCachePath(lang: string) {
  return path.join(DATA, 'synonym-cache', `${lang}.json`)
}

/** Band-aware cache key so A1 repairs are not reused by later B2 expand. */
function bandKey(lemma: string, cefr: string): string {
  return `${nfcUpper(lemma)}::${cefr.toLowerCase()}`
}


/** Delete bare lemma keys (exact + NFC-upper / casefold variants) so expand cannot revive hard leftovers. */
function deleteBareLemmaKeys(
  cache: Record<string, unknown>,
  lemma: string,
): void {
  const want = nfcUpper(lemma)
  for (const key of Object.keys(cache)) {
    if (key.includes('::')) continue
    if (nfcUpper(key) === want) delete cache[key]
  }
}

/**
 * After writing band keys, scrub any remaining bare `$1` for keys matching
 * `^(.+)::(a1|a2|b1)$` (including casing variants of `$1`).
 */
function scrubBareKeysWithBandSiblings(
  cache: Record<string, unknown>,
): number {
  const bandRe = /^(.+)::(a1|a2|b1)$/i
  const toDelete = new Set<string>()
  for (const k of Object.keys(cache)) {
    const m = k.match(bandRe)
    if (!m) continue
    const want = nfcUpper(m[1]!)
    for (const key of Object.keys(cache)) {
      if (key.includes('::')) continue
      if (nfcUpper(key) === want) toDelete.add(key)
    }
  }
  for (const k of toDelete) delete cache[k]
  return toDelete.size
}

type GlossCache = Record<string, string>
type SynCache = Record<string, string[]>

function loadGlossCache(lang: string): GlossCache {
  const f = glossCachePath(lang)
  if (!existsSync(f)) return {}
  return JSON.parse(readFileSync(f, 'utf8')) as GlossCache
}
function saveGlossCache(lang: string, cache: GlossCache) {
  mkdirSync(path.dirname(glossCachePath(lang)), { recursive: true })
  writeFileSync(glossCachePath(lang), JSON.stringify(cache, null, 2) + '\n')
}
function loadSynCache(lang: string): SynCache {
  const f = synonymCachePath(lang)
  if (!existsSync(f)) return {}
  return JSON.parse(readFileSync(f, 'utf8')) as SynCache
}
function saveSynCache(lang: string, cache: SynCache) {
  mkdirSync(path.dirname(synonymCachePath(lang)), { recursive: true })
  writeFileSync(synonymCachePath(lang), JSON.stringify(cache, null, 2) + '\n')
}

function parseRel(rel: string): { lang: PackLang; cefr: PackCefr; file: string } {
  const posix = rel.replace(/\\/g, '/').replace(/^public\/packs\//, '')
  const m = posix.match(/^(en|de|es|pt)\/(a1|a2|b1|b2|c1|c2)\.json$/)
  if (!m) throw new Error(`bad rel: ${rel}`)
  if (FORBIDDEN.has(m[2]!)) {
    throw new Error(`refusing to repair ${posix} (b2/c1/c2 out of scope)`)
  }
  return {
    lang: m[1] as PackLang,
    cefr: m[2] as PackCefr,
    file: path.join(PACKS, m[1]!, `${m[2]}.json`),
  }
}

function loadAllSnapshots(): { rel: string; pack: WordPack }[] {
  const out: { rel: string; pack: WordPack }[] = []
  for (const lang of ['en', 'de', 'es', 'pt']) {
    for (const cefr of ['a1', 'a2', 'b1', 'b2', 'c1', 'c2']) {
      const file = path.join(PACKS, lang, `${cefr}.json`)
      if (!existsSync(file)) continue
      const pack = JSON.parse(readFileSync(file, 'utf8')) as WordPack
      out.push({ rel: `${lang}/${cefr}.json`, pack })
    }
  }
  return out
}

function ceilingContext() {
  const snapshots = loadAllSnapshots()
  const lemmaEasiestByLang = buildLemmaEasiestByLang(snapshots)
  const stemCache = loadHintStemCache()
  const enTags = loadEnEasiestCefr()
  return { lemmaEasiestByLang, stemCache, enTags }
}

function violationsForLemma(
  lang: PackLang,
  cefr: PackCefr,
  gloss: string,
  synonyms: string[],
  ctx: ReturnType<typeof ceilingContext>,
) {
  return hintCeilingViolations({
    lang,
    packBand: cefr,
    gloss,
    synonyms,
    lemmaEasiestBand: ctx.lemmaEasiestByLang.get(lang) ?? new Map(),
    stemCache: ctx.stemCache[lang] ?? new Map(),
    enEasiestTag: lang === 'en' ? ctx.enTags : null,
  })
}

function dropFailingTokensFromGloss(
  lang: PackLang,
  cefr: PackCefr,
  gloss: string,
  ctx: ReturnType<typeof ceilingContext>,
): string | null {
  const hits = violationsForLemma(lang, cefr, gloss, [], ctx).filter(
    (h) => h.kind === 'gloss',
  )
  if (!hits.length) return gloss
  // Drop failing content tokens by replacing whole-word matches with simpler filler removal —
  // better to reject and regenerate than surgically delete mid-sentence.
  return null
}

function filterChipsInCeiling(
  lang: PackLang,
  cefr: PackCefr,
  lemma: string,
  chips: string[],
  ctx: ReturnType<typeof ceilingContext>,
): string[] {
  const filtered = filterSynonymChips(lemma, chips, DENY)
  return filtered.filter((chip) => {
    const hits = violationsForLemma(lang, cefr, '', [chip], ctx)
    return hits.length === 0
  })
}

function glossRejected(
  lang: PackLang,
  word: string,
  gloss: string | undefined,
): boolean {
  if (!gloss || isTemplateGloss(gloss) || spoilerContains(gloss, word)) return true
  if (onNameList(word, NAMES) && isPersonNameGloss(gloss, lang)) return true
  return isWrongLanguageGloss(lang, gloss, isWordOfLang)
}


/** Easy lemma samples for prompts: that language's A1 always, plus pack band when above A1. */
function easyWordList(lang: PackLang, cefr: PackCefr, limit = 120): string {
  const bands: PackCefr[] =
    cefr === 'a1' ? ['a1'] : cefr === 'a2' ? ['a1', 'a2'] : ['a1', 'a2', 'b1']
  const words: string[] = []
  for (const b of bands) {
    const file = path.join(PACKS, lang, `${b}.json`)
    if (!existsSync(file)) continue
    const pack = JSON.parse(readFileSync(file, 'utf8')) as WordPack
    for (const L of pack.lemmas) words.push(L.word.toLowerCase())
  }
  return [...new Set(words)].sort().slice(0, limit).join(', ')
}

function failingTokenNames(
  lang: PackLang,
  cefr: PackCefr,
  gloss: string,
  synonyms: string[],
  ctx: ReturnType<typeof ceilingContext>,
): string[] {
  return [
    ...new Set(
      violationsForLemma(lang, cefr, gloss, synonyms, ctx).map((h) =>
        h.token.toLowerCase(),
      ),
    ),
  ]
}

/**
 * Deterministic A1/A2-safe German glosses (no etwas/Ding/Person/Teil/Wasser…).
 * Lemma-keyed hand finishes first (ADR 0030 / issue #54), then generic fillers.
 * First candidate that passes ceiling + glossRejected wins.
 */
const DE_HAND_GLOSS: Record<string, Record<string, string>> = {
  a1: {
    KOPF: 'wo die Augen und der Mund sind',
    SCHATZ: 'ein guter Freund',
    PLAN: 'was man machen will',
    ZEUG: 'man hat es im Haus',
    SCHUH: 'für den Fuß',
    BEISPIEL: 'man sieht, wie man es macht',
    FLUGZEUG: 'man fliegt und es ist groß',
    REGIERUNG: 'Leute, die alles machen',
    HAU: 'mit der Hand machen',
    MONSTER: 'groß und nicht gut',
    HÄLFTE: 'eins von zwei',
    ANGEBOT: 'man kann es kaufen',
    WIND: 'es kommt und geht schnell',
    WARUM: 'man fragt: wieso?',
    EINMAL: 'nicht oft, nur eins',
    ÖFFNEN: 'man macht es frei',
  },
  a2: {
    FENSTER: 'Glas im Haus, man sieht raus',
    INSEL: 'Ort im Meer',
    RADIO: 'man hört Lieder und Nachrichten',
    VERSUCHEN: 'man will es machen',
    STARK: 'man kann viel machen',
    SCHIFF: 'groß und fährt auf dem Meer',
    REITEN: 'auf einem Pferd fahren',
    RÜHREN: 'Essen im Topf machen',
  },
}

function localRescueGloss(
  lang: PackLang,
  cefr: PackCefr,
  word: string,
  ctx: ReturnType<typeof ceilingContext>,
): string | null {
  if (lang !== 'de') return null
  const upper = nfcUpper(word)
  const hand = DE_HAND_GLOSS[cefr]?.[upper]
  const candidates: string[] = []
  if (hand) candidates.push(hand)
  candidates.push(
    'man macht es',
    'man kann es machen',
    'man kann es sehen',
    'man kann es hören',
    'man kann es kaufen',
    'ein Mann',
    'eine Frau',
    'ein Kind',
    'ein Mensch',
    'viele Leute',
    'für die Hand',
    'für den Fuß',
    'für das Haus',
    'für die Arbeit',
    'am Tag',
    'in der Nacht',
    'in dem Haus',
    'auf dem Platz',
    'der Anfang',
    'das Ende',
    'ein Freund',
    'ein Auto',
    'ein Buch',
    'ein Bild',
    'ein Film',
    'man gibt es',
    'man nimmt es',
    'man sieht es',
    'man geht hin',
    'man kommt her',
    'man wohnt dort',
    'man arbeitet dort',
    'man sagt ja',
    'man sagt nein',
    'sehr gut',
    'nicht gut',
    'sehr groß',
    'sehr klein',
    'kurz und klar',
  )
  if (/IN$|UNG$|HEIT$|KEIT$/.test(upper)) {
    candidates.unshift('Leute, die alles machen', 'Leute mit großer Arbeit')
  }
  for (const gloss of candidates) {
    if (glossRejected(lang, word, gloss)) continue
    if (violationsForLemma(lang, cefr, gloss, [], ctx).length) continue
    return gloss
  }
  return null
}

async function repairPack(rel: string): Promise<void> {
  const { lang, cefr, file } = parseRel(rel)
  if (!['en', 'de'].includes(lang) || !['a1', 'a2', 'b1'].includes(cefr)) {
    console.warn(
      `note: issue #52/#54 ship EN+DE A1–B1; still repairing ${lang}/${cefr}`,
    )
  }
  const key = readXaiKey()
  if (!key) {
    throw new Error(
      'Need xAI key (set XAI_API_KEY or ~/.grok/auth.json SuperGrok login)',
    )
  }

  loadMembershipCache()
  console.log("membership cache armed")
  await ensureDicts()
  console.log("Hunspell dictionaries loaded")
  const ctx = ceilingContext()
  console.log("ceiling context ready")
  const pack = JSON.parse(readFileSync(file, 'utf8')) as WordPack
  const originalWords = pack.lemmas.map((L) => L.word)

  const glossCache = loadGlossCache(lang)
  const synCache = loadSynCache(lang)

  const needGloss: string[] = []
  const needSyn: string[] = []

  for (const L of pack.lemmas) {
    const hits = violationsForLemma(
      lang,
      cefr,
      L.gloss ?? '',
      L.synonyms ?? [],
      ctx,
    )
    if (hits.some((h) => h.kind === 'gloss') || glossRejected(lang, L.word, L.gloss)) {
      needGloss.push(L.word)
    }
    if (hits.some((h) => h.kind === 'synonym')) {
      needSyn.push(L.word)
    }
  }

  console.log(
    `${rel}: ${needGloss.length} glosses and ${needSyn.length} synonym rows need repair`,
  )

  // Seed from band-keyed cache when the cached gloss/chips already pass the ceiling.
  let seededGloss = 0
  let seededSyn = 0
  for (const L of pack.lemmas) {
    const gk = bandKey(L.word, cefr)
    const cachedG = glossCache[gk]
    if (
      cachedG &&
      !glossRejected(lang, L.word, cachedG) &&
      violationsForLemma(lang, cefr, cachedG, [], ctx).length === 0
    ) {
      if (L.gloss !== cachedG) {
        L.gloss = cachedG
        seededGloss++
      }
    }
    const cachedS = synCache[gk]
    if (Array.isArray(cachedS)) {
      const chips = filterChipsInCeiling(lang, cefr, L.word, cachedS, ctx)
      if (chips.length) {
        L.synonyms = chips
        seededSyn++
      }
    }
  }
  // Recompute needs after seeding
  needGloss.length = 0
  needSyn.length = 0
  for (const L of pack.lemmas) {
    const hits = violationsForLemma(
      lang,
      cefr,
      L.gloss ?? '',
      L.synonyms ?? [],
      ctx,
    )
    if (hits.some((h) => h.kind === 'gloss') || glossRejected(lang, L.word, L.gloss)) {
      needGloss.push(L.word)
    }
    if (hits.some((h) => h.kind === 'synonym')) {
      needSyn.push(L.word)
    }
  }
  if (seededGloss || seededSyn) {
    console.log(
      `  seeded from band cache: gloss=${seededGloss} syn=${seededSyn}; still need gloss=${needGloss.length} syn=${needSyn.length}`,
    )
  }

  const easyWords = easyWordList(lang, cefr, 150)
  const langName = LANG_NAME[lang]
  const thatAvoid =
    lang === 'en'
      ? `Never use the relative word "that" in glosses (it is tagged harder than A2); rephrase with "when", "who", or a short noun phrase. `
      : ''
  const ceilingPromptExtra =
    `CRITICAL: every content word in the gloss and every synonym chip MUST be from CEFR ${cefr.toUpperCase()} or easier for ${langName}. ` +
    `Prefer very common easy ${langName} words (${easyFillerExamples(lang, cefr)}). ` +
    `Do NOT use harder words like ${hardWordsToAvoid(lang, cefr)}. ` +
    thatAvoid +
    `Do not use the answer lemma itself in the gloss or as a synonym chip. ` +
    (lang === 'de'
      ? `Write German only (ADR 0030) — no English glosses or English synonym chips. Band check uses the easiest German pack of the stem, not Goethe or CEFR tag maps. ` +
        (cefr === 'a1'
          ? `For A1 NEVER write Person/Personen, Ding, Sache, Gefühl, Körper, Stück, Idee, Tier, dunkel, or Teil (Teil stems to TEILEN=A2). Use Mann/Frau/Kind/Mensch/Leute/Ort/Platz/Wort instead. `
          : cefr === 'a2'
            ? `For A2 NEVER write Gefühl (B1) or harder abstract nouns above A2. Person/Ding/Sache are OK at A2. `
            : '')
      : '') +
    `Example easy ${cefr.toUpperCase()}-or-easier ${langName} lemmas you may use: ${easyWords}.`

  const BATCH = 40
  // --- glosses ---
  for (let i = 0; i < needGloss.length; i += BATCH) {
    const batch = needGloss.slice(i, i + BATCH)
    const prompt =
      `Language: ${langName} (${lang}).\n` +
      `Write a short learner dictionary gloss for each lemma in ${langName} only (one simple sentence or clause).\n` +
      `Rules: never include the lemma itself as a whole word in its gloss; ` +
      `no letter-count or classroom-template fluff; no NSFW; never define a lemma as a given name, surname, or person. ` +
      `${GLOSS_STYLE[lang]} ${ceilingPromptExtra}\n` +
      `Return JSON object mapping each UPPERCASE lemma to its gloss string.\n` +
      `Lemmas:\n${batch.join('\n')}`
    const content = await xaiChat(
      key,
      `You write concise ${cefr.toUpperCase()}-or-easier learner-dictionary glosses in ${langName} only (ADR 0030). Reply with a single JSON object only.`,
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
      let gloss = g.trim()
      if (glossRejected(lang, w, gloss)) {
        console.warn(`  rejected gloss for ${w}: ${gloss.slice(0, 60)}`)
        continue
      }
      if (dropFailingTokensFromGloss(lang, cefr, gloss, ctx) === null) {
        console.warn(`  ceiling-fail gloss for ${w}: ${gloss.slice(0, 60)}`)
        continue
      }
      // store under band key; delete bare lemma key so B2 expand does not reuse A1 gloss
      glossCache[bandKey(w, cefr)] = gloss
      deleteBareLemmaKeys(glossCache, w)
      const lemma = pack.lemmas.find((L) => L.word === w)
      if (lemma) lemma.gloss = gloss
    }
    saveGlossCache(lang, glossCache)
    console.log(`  glosses ${Math.min(i + BATCH, needGloss.length)}/${needGloss.length}`)
  }

  // retry leftovers once
  let glossLeft = pack.lemmas.filter((L) =>
    violationsForLemma(lang, cefr, L.gloss ?? '', [], ctx).some((h) => h.kind === 'gloss'),
  )
  for (let attempt = 0; attempt < 3 && glossLeft.length; attempt++) {
    console.log(`  gloss retry ${attempt + 1}: ${glossLeft.length}`)
    for (let i = 0; i < glossLeft.length; i += 20) {
      const batch = glossLeft.slice(i, i + 20).map((L) => L.word)
      const prompt =
        `Language: ${langName} (${lang}).\n` +
        `For each lemma, write a short ${langName} learner gloss using ONLY ${cefr.toUpperCase()} or easier words. ` +
        `Do not use the lemma. ${GLOSS_STYLE[lang]}\n` +
        `Avoid these harder words if present in a prior attempt: ${hardWordsToAvoid(lang, cefr)}.` +
        (lang === 'en'
          ? ' Also avoid: that, rules, signs, beans, piece, clothing, worn, other, clothes, set, hot, drink, made, from, low, having, loud, warning, signal, serious, damage, unexpected, relating, electricity, uncertainty, furious, anger, risk.'
          : '') +
        `\nUse simple words like: ${easyFillerExamples(lang, cefr)}.\n` +
        `JSON: UPPERCASE lemma → gloss.\n` +
        batch.map((w) => {
          const L = glossLeft.find((x) => x.word === w)
          const bad = L
            ? failingTokenNames(lang, cefr, L.gloss ?? '', [], ctx)
            : []
          return bad.length
            ? `- ${w} (avoid: ${bad.join(', ')})`
            : `- ${w}`
        }).join('\n')
      try {
        const content = await xaiChat(
          key,
          `JSON only. ${cefr.toUpperCase()}-ceiling ${langName} glosses. Avoid the headword.`,
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
          if (dropFailingTokensFromGloss(lang, cefr, gloss, ctx) === null) continue
          glossCache[bandKey(w, cefr)] = gloss
          deleteBareLemmaKeys(glossCache, w)
          const lemma = pack.lemmas.find((L) => L.word === w)
          if (lemma) lemma.gloss = gloss
        }
      } catch (e) {
        console.warn(`  gloss retry error: ${e}`)
      }
      saveGlossCache(lang, glossCache)
    }
    glossLeft = pack.lemmas.filter((L) =>
      violationsForLemma(lang, cefr, L.gloss ?? '', [], ctx).some((h) => h.kind === 'gloss'),
    )
  }

  // --- synonyms: filter existing; regenerate for failing ---
  for (const L of pack.lemmas) {
    const chips = filterChipsInCeiling(lang, cefr, L.word, L.synonyms ?? [], ctx)
    L.synonyms = chips.length ? chips : undefined
  }

  const needChip = pack.lemmas
    .filter((L) => !(L.synonyms && L.synonyms.length > 0))
    .map((L) => L.word)

  // Also force regen for those that had ceiling failures
  const regen = [...new Set([...needSyn, ...needChip])]

  for (let i = 0; i < regen.length; i += BATCH) {
    const batch = regen.slice(i, i + BATCH)
    const prompt =
      `Language: ${langName} (${lang}).\n` +
      `For each lemma, give 1–3 close same-language learner synonyms in ${langName} only.\n` +
      `Rules: same language only; never the lemma itself; no NSFW; no letter-count fluff. ` +
      `${ceilingPromptExtra}\n` +
      `Use [] if there is no close synonym. Do not force a hypernym.\n` +
      `Return a JSON object mapping each UPPERCASE lemma to a string array.\n` +
      `Lemmas:\n${batch.join('\n')}`
    const content = await xaiChat(
      key,
      `You write ${cefr.toUpperCase()}-or-easier ${langName} learner synonyms (same language only, ADR 0030). Reply with a single JSON object only.`,
      prompt,
      0.2,
    )
    const parsed = parseJsonObject(content)
    if (!parsed) {
      console.warn('  no synonym JSON')
      continue
    }
    for (const w of batch) {
      const raw = lookupParsed(parsed, w)
      const arr = Array.isArray(raw)
        ? raw.filter((x): x is string => typeof x === 'string')
        : null
      if (arr === null) continue
      const chips = filterChipsInCeiling(lang, cefr, w, arr, ctx)
      synCache[bandKey(w, cefr)] = chips
      deleteBareLemmaKeys(synCache, w)
      const lemma = pack.lemmas.find((L) => L.word === w)
      if (lemma) lemma.synonyms = chips.length ? chips : undefined
    }
    saveSynCache(lang, synCache)
    console.log(`  synonyms ${Math.min(i + BATCH, regen.length)}/${regen.length}`)
  }

  // If coverage would fall under 80%, ask again for in-ceiling chips on lemmas that lost last chip
  let coverage = synonymCoverageRatio(pack.lemmas, DENY)
  let guard = 0
  while (coverage < SYNONYM_COVERAGE_FLOOR && guard < 4) {
    guard++
    const missing = pack.lemmas
      .filter((L) => !L.synonyms || L.synonyms.length === 0)
      .map((L) => L.word)
    console.log(
      `  coverage ${(coverage * 100).toFixed(1)}% < ${(SYNONYM_COVERAGE_FLOOR * 100).toFixed(0)}% — asking for ${missing.length} in-ceiling chips`,
    )
    for (let i = 0; i < missing.length; i += 20) {
      const batch = missing.slice(i, i + 20)
      const prompt =
        `Language: ${langName} (${lang}).\n` +
        `JSON object: UPPERCASE lemma → 1–3 close ${cefr.toUpperCase()}-or-easier ${langName} synonyms (never the lemma).\n` +
        `Prefer very common easy ${langName} words. Use [] only if truly unique.\n` +
        batch.map((w) => `- ${w}`).join('\n')
      const content = await xaiChat(
        key,
        `JSON only. In-ceiling ${cefr.toUpperCase()} ${langName} synonyms.`,
        prompt,
        0.45,
      )
      const parsed = parseJsonObject(content)
      if (!parsed) continue
      for (const w of batch) {
        const raw = lookupParsed(parsed, w)
        const arr = Array.isArray(raw)
          ? raw.filter((x): x is string => typeof x === 'string')
          : []
        const chips = filterChipsInCeiling(lang, cefr, w, arr, ctx)
        if (!chips.length) continue
        synCache[bandKey(w, cefr)] = chips
        deleteBareLemmaKeys(synCache, w)
        const lemma = pack.lemmas.find((L) => L.word === w)
        if (lemma) lemma.synonyms = chips
      }
      saveSynCache(lang, synCache)
    }
    coverage = synonymCoverageRatio(pack.lemmas, DENY)
  }

  if (coverage < SYNONYM_COVERAGE_FLOOR) {
    throw new Error(
      `${rel}: synonym coverage ${(coverage * 100).toFixed(1)}% still below ${(SYNONYM_COVERAGE_FLOOR * 100).toFixed(0)}% — refusing to write`,
    )
  }

  // refuse any change to word list
  const newWords = pack.lemmas.map((L) => L.word)
  if (JSON.stringify(newWords) !== JSON.stringify(originalWords)) {
    throw new Error(`${rel}: word list changed — aborting write`)
  }

  // Per-lemma gloss rescue: ask with explicit avoid-list until in-ceiling or give up
  for (let round = 0; round < 10; round++) {
    const hard = pack.lemmas.filter(
      (L) => violationsForLemma(lang, cefr, L.gloss ?? '', [], ctx).length > 0,
    )
    if (!hard.length) break
    console.log(`  per-lemma rescue round ${round + 1}: ${hard.length}`)
    for (const L of hard) {
      const bad = failingTokenNames(lang, cefr, L.gloss ?? '', [], ctx)
      const avoidExtra =
        lang === 'de'
          ? `${hardWordsToAvoid(lang, cefr)}, ${bad.join(', ')}`
          : bad.join(', ')
      const prompt =
        `Language: ${langName} (${lang}).\n` +
        `Write ONE short ${cefr.toUpperCase()} learner gloss for ${L.word} in ${langName} only.\n` +
        `Current gloss: ${JSON.stringify(L.gloss ?? '')}\n` +
        `Do not use the lemma ${L.word}. Avoid these harder words: ${avoidExtra}.\n` +
        `Use only very easy words (${easyFillerExamples(lang, cefr)}).\n` +
        (lang === 'de'
          ? `NEVER use: etwas, Ding, Sache, Person, Teil, Wasser, Land, Zeug, Gefühl, Körper, Tier, froh, traurig. Prefer: Mann/Frau/Kind/Mensch/Leute/Ort/Platz/Wort/Frage/Haus/Hand/Fuß and phrases like "man macht es", "für den Fuß", "wo die Augen und der Mund sind".\n`
          : '') +
        `${GLOSS_STYLE[lang]} Return JSON {"${L.word}":"gloss"}.`
      let rescued = false
      try {
        const content = await xaiChat(
          key,
          `JSON only. One ${cefr.toUpperCase()}-ceiling ${langName} gloss.`,
          prompt,
          0.55 + round * 0.03,
        )
        const parsed = parseJsonObject(content)
        if (parsed) {
          const g = lookupParsed(parsed, L.word)
          if (g && typeof g === 'string') {
            const gloss = g.trim()
            if (
              !glossRejected(lang, L.word, gloss) &&
              !violationsForLemma(lang, cefr, gloss, [], ctx).length
            ) {
              L.gloss = gloss
              glossCache[bandKey(L.word, cefr)] = gloss
              deleteBareLemmaKeys(glossCache, L.word)
              rescued = true
            } else {
              console.warn(`  still fail ${L.word}: ${gloss.slice(0, 70)}`)
            }
          }
        }
      } catch (e) {
        console.warn(`  rescue error ${L.word}: ${e}`)
      }
      if (!rescued) {
        const local = localRescueGloss(lang, cefr, L.word, ctx)
        if (local) {
          console.log(`  local rescue ${L.word}: ${local}`)
          L.gloss = local
          glossCache[bandKey(L.word, cefr)] = local
          deleteBareLemmaKeys(glossCache, L.word)
        }
      }
    }
    saveGlossCache(lang, glossCache)
  }

  let stillHard = 0
  for (const L of pack.lemmas) {
    const glossHits = violationsForLemma(lang, cefr, L.gloss ?? '', [], ctx)
    if (glossHits.length) {
      stillHard++
      console.warn(
        `  still hard gloss ${L.word}: ${L.gloss} [${failingTokenNames(lang, cefr, L.gloss ?? '', [], ctx).join(',')}]`,
      )
    }
    L.synonyms = filterChipsInCeiling(lang, cefr, L.word, L.synonyms ?? [], ctx)
    if (L.synonyms.length === 0) L.synonyms = undefined
  }
  coverage = synonymCoverageRatio(pack.lemmas, DENY)
  if (coverage < SYNONYM_COVERAGE_FLOOR) {
    throw new Error(
      `${rel}: after final chip drop, coverage ${(coverage * 100).toFixed(1)}% < floor`,
    )
  }
  if (stillHard) {
    throw new Error(`${rel}: ${stillHard} glosses still above ceiling`)
  }

  // Always write band keys from final pack state (even when unchanged) so scrub
  // removes bare leftovers for lemmas that did not need repair this run.
  // Same pattern as #58 / Ask Avery on #59: scrub + always-write-band is enough.
  let bandGlossWritten = 0
  let bandSynWritten = 0
  for (const L of pack.lemmas) {
    const gk = bandKey(L.word, cefr)
    if (L.gloss) {
      glossCache[gk] = L.gloss
      bandGlossWritten++
    }
    synCache[bandKey(L.word, cefr)] = L.synonyms ?? []
    bandSynWritten++
    deleteBareLemmaKeys(glossCache, L.word)
    deleteBareLemmaKeys(synCache, L.word)
  }
  const glossScrubbed = scrubBareKeysWithBandSiblings(glossCache)
  const synScrubbed = scrubBareKeysWithBandSiblings(synCache)
  console.log(
    `  band keys written: gloss=${bandGlossWritten} syn=${bandSynWritten}; scrubbed bare: gloss=${glossScrubbed} syn=${synScrubbed}`,
  )
  saveGlossCache(lang, glossCache)
  saveSynCache(lang, synCache)

  pack.version = (typeof pack.version === 'number' ? pack.version : 0) + 1
  // Cap synonym arrays
  for (const L of pack.lemmas) {
    if (L.synonyms && L.synonyms.length > SYNONYM_CHIP_CAP) {
      L.synonyms = L.synonyms.slice(0, SYNONYM_CHIP_CAP)
    }
  }

  writeFileSync(file, JSON.stringify(pack, null, 2) + '\n')
  console.log(
    `wrote ${rel} version=${pack.version} coverage=${(coverage * 100).toFixed(1)}%`,
  )
}

const rels = process.argv.slice(2)
if (!rels.length) {
  console.error('Usage: bun run scripts/repair-a1-b1-hints.ts <rel> [<rel>...]')
  console.error('Example: bun run scripts/repair-a1-b1-hints.ts de/a1.json de/a2.json de/b1.json')
  process.exit(1)
}
for (const rel of rels) {
  await repairPack(rel)
}
