#!/usr/bin/env bun
/**
 * Repair B2 (and C1) glosses / synonym chips so they pass the hint ceiling.
 * Refuses A1–B1 and C2. Not a CI step — exits immediately when CI=true.
 * Does not import scripts/repair-a1-b1-hints.ts (80% floor, top-level await).
 *
 * Usage:
 *   bun run scripts/repair-b2-c2-hints.ts en/b2.json
 *   bun run scripts/repair-b2-c2-hints.ts --replace-only pt/c1.json
 *
 * Writes shipped glosses and chips under the bare lemma key
 * (expand-packs.ts reads that key). Does not run packs:expand.
 * Coverage target is 70% (packs:check warning line). Unique referents stay
 * gloss-only; a shortfall is reported, not thrown.
 *
 * --replace-only repairs failing glosses, drops chips above the ceiling, and
 * asks the model only to replace a removed chip. It does not run the
 * coverage-fill rounds. Without the flag, fill-to-70% behavior is unchanged.
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
} from './synonym-chips'
import { synonymCoverage } from './packs-check-lib'

const COVERAGE_TARGET = 0.7

const ROOT = path.join(import.meta.dir, '..')
const PACKS = path.join(ROOT, 'public', 'packs')
const DATA = path.join(import.meta.dir, 'data')
const DENY = loadDenylist()
const NAMES = loadNameList()

/** A1–B1 stay on repair-a1-b1-hints.ts. C2 is a later slice. */
const REFUSED = new Set(['a1', 'a2', 'b1', 'c2'])

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

/**
 * Last-resort English glosses for lemmas the model could not land under B2.
 * Each line was checked with hintCeilingViolations before it was added.
 */
const EN_B2_HAND_GLOSS: Record<string, string> = {
  ADJUSTMENT: 'a small change so things work better',
  AIRCREW: 'the people who fly and work in the air',
  ANCHORAGE: 'a safe place where ships can stop',
  ASSERT: 'to say something in a strong sure way',
  ATYPICAL: 'not of the usual kind',
  BELLOW: 'to shout in a deep loud way',
  BROADEN: 'to make something wider',
  BUM: 'a person who will not work',
  CHEERFULLY: 'in a happy and bright way',
  CHIMNEY: 'a tall pipe that takes smoke out of a house',
  COARSE: 'rough to the touch or not polite',
  DEFY: 'to go against what someone says',
  DETERMINED: 'set on a choice and not giving up',
}

type GlossCache = Record<string, string>
type SynCache = Record<string, string[]>
type CeilingCtx = ReturnType<typeof ceilingContext>

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
  if (REFUSED.has(m[2]!)) {
    throw new Error(
      `refusing to repair ${posix} (A1–B1 and C2 are out of scope for this script)`,
    )
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
  ctx: CeilingCtx,
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

function glossRejected(
  lang: PackLang,
  word: string,
  gloss: string | undefined,
): boolean {
  if (!gloss || isTemplateGloss(gloss) || spoilerContains(gloss, word)) return true
  if (onNameList(word, NAMES) && isPersonNameGloss(gloss, lang)) return true
  return isWrongLanguageGloss(lang, gloss, isWordOfLang)
}

function glossFails(
  lang: PackLang,
  cefr: PackCefr,
  word: string,
  gloss: string | undefined,
  ctx: CeilingCtx,
): boolean {
  if (glossRejected(lang, word, gloss)) return true
  return violationsForLemma(lang, cefr, gloss ?? '', [], ctx).some(
    (h) => h.kind === 'gloss',
  )
}

function failingTokenNames(
  lang: PackLang,
  cefr: PackCefr,
  gloss: string,
  synonyms: string[],
  ctx: CeilingCtx,
): string[] {
  return [
    ...new Set(
      violationsForLemma(lang, cefr, gloss, synonyms, ctx).map((h) =>
        h.token.toLowerCase(),
      ),
    ),
  ]
}

function filterChipsInCeiling(
  lang: PackLang,
  cefr: PackCefr,
  lemma: string,
  chips: string[],
  ctx: CeilingCtx,
): string[] {
  const filtered = filterSynonymChips(lemma, chips, DENY).map((chip) =>
    lang === 'en' ? chip.toLowerCase() : chip,
  )
  const kept: string[] = []
  const seen = new Set<string>()
  for (const chip of filtered) {
    const key = nfcUpper(chip)
    if (seen.has(key)) continue
    const hits = violationsForLemma(lang, cefr, '', [chip], ctx)
    if (hits.length) continue
    seen.add(key)
    kept.push(chip)
    if (kept.length >= SYNONYM_CHIP_CAP) break
  }
  return kept
}

function bandsAtOrBelow(cefr: PackCefr): PackCefr[] {
  const order: PackCefr[] = ['a1', 'a2', 'b1', 'b2', 'c1', 'c2']
  const i = order.indexOf(cefr)
  return order.slice(0, i + 1)
}

function easyWordList(lang: PackLang, cefr: PackCefr, limit = 180): string {
  const words: string[] = []
  for (const b of bandsAtOrBelow(cefr)) {
    const file = path.join(PACKS, lang, `${b}.json`)
    if (!existsSync(file)) continue
    const pack = JSON.parse(readFileSync(file, 'utf8')) as WordPack
    for (const L of pack.lemmas) words.push(L.word.toLowerCase())
  }
  return [...new Set(words)].sort().slice(0, limit).join(', ')
}

function ceilingRules(lang: PackLang, cefr: PackCefr): string {
  const easy = easyWordList(lang, cefr)
  return (
    `CRITICAL: every content word in the gloss and every synonym chip must sit at CEFR ${cefr.toUpperCase()} or easier for ${LANG_NAME[lang]}. Easier words are allowed. ` +
    `Do not use the answer lemma. Same language only. No spoiler of the lemma. No template gloss. Never define a lemma as a given name, surname, or person. ` +
    `Cap synonym chips at ${SYNONYM_CHIP_CAP}. ` +
    `Example ${cefr.toUpperCase()}-or-easier lemmas you may use: ${easy}.`
  )
}

function asStringArray(raw: unknown): string[] | null {
  if (raw === undefined || raw === null) return null
  if (Array.isArray(raw)) return raw.filter((x): x is string => typeof x === 'string')
  if (typeof raw === 'string') {
    const t = raw.trim()
    if (!t || t === '[]') return []
    return t.split(/[,;|/]/).map((s) => s.trim()).filter(Boolean)
  }
  return null
}

function handGloss(lang: PackLang, cefr: PackCefr, word: string): string | null {
  if (lang === 'en' && cefr === 'b2') return EN_B2_HAND_GLOSS[nfcUpper(word)] ?? null
  return null
}

/**
 * EN B2 lemmas with no close synonym (specific creature, food, instrument,
 * garment, place, element, or shape). Empty chip list — not a hypernym.
 * Wrong-sense model chips are replaced with an in-ceiling paraphrase.
 */
const EN_B2_CHIP_OVERRIDE: Record<string, string[]> = {
  ALUMINUM: [],
  ALTAR: [],
  ANTIVIRUS: [],
  APOSTROPHE: [],
  ARCTIC: [],
  ASTRONOMY: [],
  BALLET: [],
  BAROMETER: [],
  BEAGLE: [],
  BIKINI: [],
  BIRDCAGE: [],
  BOTANY: [],
  BOURBON: [],
  BULIMIA: [],
  CARDIGAN: [],
  CEILING: [],
  CELLIST: [],
  CELLO: [],
  CLAM: [],
  COCONUT: [],
  COLONIAL: [],
  CONCRETE: [],
  CONE: [],
  CORNET: [],
  CORRESPOND: [],
  CRAB: [],
  CROCODILE: [],
  CUBE: [],
  CUBISM: [],
  DANDELION: [],
  DATABASE: [],
  DATED: [],
  DEPOSIT: [],
  DIARRHEA: [],
  AIRCREW: ['flight staff', 'crew'],
  AMPLIFIER: ['booster'],
  ARTERY: ['vessel'],
  AUBERGINE: ['eggplant'],
  BACKWARD: ['reverse', 'behind'],
  BACKYARD: ['yard'],
  BANKER: ['financier'],
  BARTENDER: ['server'],
  BEAK: ['bill'],
  BEAM: ['support'],
  BOLT: ['pin', 'fastener', 'peg'],
  BOXER: ['fighter'],
  BULLY: ['tormentor', 'thug', 'brute'],
  BUM: ['loafer'],
  BUMPER: ['protective bar'],
  BURIAL: ['interment'],
  CANNONBALL: ['round shot'],
  CAST: ['actors', 'troupe', 'ensemble'],
  CATHEDRAL: ['church'],
  CENTIGRADE: ['celsius'],
  CLAP: ['applaud'],
  CLERICAL: ['administrative'],
  COMMISSION: ['committee', 'board', 'panel'],
  COMPLEXION: ['skin tone'],
  CONVENTION: ['meeting', 'gathering', 'conference'],
  CRIMINAL: ['offender', 'crook', 'lawbreaker'],
  DAYTIME: ['day', 'daylight'],
  DEBIT: ['charge'],
  DEDUCTION: ['conclusion'],
  DELEGATE: ['representative'],
  DELICACY: ['treat', 'specialty'],
  DESKTOP: ['screen', 'computer screen'],
}

function curatedChips(lang: PackLang, cefr: PackCefr, word: string): string[] | null {
  if (lang === 'en' && cefr === 'b2') {
    const hit = EN_B2_CHIP_OVERRIDE[nfcUpper(word)]
    return hit ? [...hit] : null
  }
  return null
}

function lemmaKey(word: string): string {
  return nfcUpper(word)
}

function chipsOf(lemma: { synonyms?: string[] }): string[] {
  return lemma.synonyms ?? []
}

async function repairGlosses(
  lang: PackLang,
  cefr: PackCefr,
  pack: WordPack,
  glossCache: GlossCache,
  ctx: CeilingCtx,
  key: string,
): Promise<number> {
  const need = () =>
    pack.lemmas.filter((L) => glossFails(lang, cefr, L.word, L.gloss, ctx))

  let pending = need()
  console.log(`${lang}/${cefr}: ${pending.length} glosses need repair`)
  if (!pending.length) return 0

  const rules = ceilingRules(lang, cefr)
  const applyGloss = (word: string, gloss: string) => {
    if (glossFails(lang, cefr, word, gloss, ctx)) return false
    const lemma = pack.lemmas.find((L) => L.word === word)
    if (!lemma) return false
    lemma.gloss = gloss
    glossCache[lemmaKey(word)] = gloss
    return true
  }

  for (let round = 0; round < 4 && pending.length; round++) {
    console.log(`  gloss round ${round + 1}: ${pending.length}`)
    for (let i = 0; i < pending.length; i += 20) {
      const batch = pending.slice(i, i + 20)
      const prompt =
        `Language: ${LANG_NAME[lang]} (${lang}). Band: ${cefr.toUpperCase()}.\n` +
        `Rewrite each gloss in ${LANG_NAME[lang]} only. One short clause. ${GLOSS_STYLE[lang]}\n` +
        `${rules}\n` +
        `The current gloss scores above the band. Avoid the listed words.\n` +
        `Return a JSON object mapping each UPPERCASE lemma to its new gloss.\n` +
        batch
          .map((L) => {
            const bad = failingTokenNames(lang, cefr, L.gloss ?? '', [], ctx)
            return `- ${L.word} current=${JSON.stringify(L.gloss ?? '')} avoid=${bad.join(', ') || '(none)'}`
          })
          .join('\n')
      try {
        const content = await xaiChat(
          key,
          `JSON only. ${cefr.toUpperCase()}-or-easier ${LANG_NAME[lang]} learner glosses (ADR 0030). Never the headword.`,
          prompt,
          0.3 + round * 0.05,
        )
        const parsed = parseJsonObject(content)
        if (!parsed) {
          console.warn('  no gloss JSON')
          continue
        }
        for (const L of batch) {
          const g = lookupParsed(parsed, L.word)
          if (!g || typeof g !== 'string') continue
          if (!applyGloss(L.word, g.trim())) {
            console.warn(`  still above ceiling ${L.word}: ${g.trim().slice(0, 80)}`)
          }
        }
      } catch (e) {
        console.warn(`  gloss round error: ${e}`)
      }
      saveGlossCache(lang, glossCache)
    }
    pending = need()
  }

  for (const L of need()) {
    const local = handGloss(lang, cefr, L.word)
    if (local && applyGloss(L.word, local)) {
      console.log(`  hand gloss ${L.word}`)
    }
  }
  saveGlossCache(lang, glossCache)

  const left = need()
  if (left.length) {
    for (const L of left) {
      console.warn(
        `  hard gloss ${L.word}: ${L.gloss} [${failingTokenNames(lang, cefr, L.gloss ?? '', [], ctx).join(',')}]`,
      )
    }
    throw new Error(`${lang}/${cefr}: ${left.length} glosses still above the ceiling`)
  }
  return pack.lemmas.filter((L) => glossCache[lemmaKey(L.word)] === L.gloss).length
}

async function repairSynonyms(
  lang: PackLang,
  cefr: PackCefr,
  pack: WordPack,
  synCache: SynCache,
  ctx: CeilingCtx,
  key: string,
  replaceOnly = false,
): Promise<{ coverage: number; unique: string[]; unresolved: string[] }> {
  const unique = new Set<string>()
  const rejected = new Map<string, string[]>()
  const originalCount = new Map(
    pack.lemmas.map((L) => [L.word, (L.synonyms ?? []).length]),
  )

  for (const L of pack.lemmas) {
    const original = L.synonyms ?? []
    const fromPack = filterChipsInCeiling(lang, cefr, L.word, original, ctx)
    const cached = synCache[lemmaKey(L.word)]
    const fromCache = Array.isArray(cached)
      ? filterChipsInCeiling(lang, cefr, L.word, cached, ctx)
      : []
    if (replaceOnly) {
      const removed = original.filter(
        (chip) => !fromPack.some((kept) => nfcUpper(kept) === nfcUpper(chip)),
      )
      const chips = [...fromPack]
      if (removed.length) {
        for (const chip of fromCache) {
          if (chips.length >= SYNONYM_CHIP_CAP) break
          if (chips.some((kept) => nfcUpper(kept) === nfcUpper(chip))) continue
          chips.push(chip)
        }
        const prev = rejected.get(L.word) ?? []
        rejected.set(L.word, [
          ...new Set([...prev, ...removed.map((chip) => chip.toLowerCase())]),
        ])
      }
      if (chips.length) L.synonyms = chips
      else L.synonyms = undefined
      continue
    }
    const chips = fromPack.length ? fromPack : fromCache
    if (chips.length) {
      L.synonyms = chips
      continue
    }
    L.synonyms = undefined
    if (Array.isArray(cached) && cached.length === 0) unique.add(L.word)
  }

  const rules = ceilingRules(lang, cefr)

  async function ask(
    words: string[],
    temperature: number,
    reconsider: boolean,
    mergeExisting = false,
  ) {
    for (let i = 0; i < words.length; i += 25) {
      const batch = words.slice(i, i + 25)
      const prompt =
        `Language: ${LANG_NAME[lang]} (${lang}). Band: ${cefr.toUpperCase()}.\n` +
        `For each lemma, give 1–3 close same-language learner synonyms at ${cefr.toUpperCase()} or easier.\n` +
        `${rules}\n` +
        `Use [] only for a unique referent (a specific fruit, weekday, number, colour, place, or thing with no near synonym). ` +
        `Do not force a hypernym (never banana → fruit). ` +
        `Most verbs, adjectives, and abstract nouns have a close learner synonym.\n` +
        (reconsider
          ? `These were left empty. Add a real in-ceiling synonym when one exists. Keep [] only if it is truly unique.\n`
          : '') +
        `Return a JSON object mapping each UPPERCASE lemma to a string array.\n` +
        batch
          .map((w) => {
            const bad = rejected.get(w) ?? []
            return bad.length ? `- ${w} (do not reuse: ${bad.join(', ')})` : `- ${w}`
          })
          .join('\n')
      let parsed: Record<string, unknown> | null = null
      try {
        const content = await xaiChat(
          key,
          `JSON only. ${cefr.toUpperCase()}-or-easier ${LANG_NAME[lang]} synonyms (ADR 0023). Same language. No headword.`,
          prompt,
          temperature,
        )
        parsed = parseJsonObject(content)
      } catch (e) {
        console.warn(`  synonym batch error: ${e}`)
      }
      if (!parsed) {
        console.warn('  no synonym JSON')
        continue
      }
      for (const w of batch) {
        const arr = asStringArray(lookupParsed(parsed, w))
        if (arr === null) continue
        const lemma = pack.lemmas.find((L) => L.word === w)
        const kept = lemma?.synonyms ?? []
        if (arr.length === 0) {
          if (mergeExisting && kept.length) continue
          unique.add(w)
          synCache[lemmaKey(w)] = []
          continue
        }
        const chips = filterChipsInCeiling(
          lang,
          cefr,
          w,
          mergeExisting ? [...kept, ...arr] : arr,
          ctx,
        )
        if (!chips.length || (mergeExisting && chips.length <= kept.length)) {
          const prev = rejected.get(w) ?? []
          rejected.set(w, [...new Set([...prev, ...arr.map((c) => c.toLowerCase())])])
          console.warn(`  dropped chips for ${w}: ${arr.join(', ')}`)
          continue
        }
        unique.delete(w)
        if (lemma) lemma.synonyms = chips
        synCache[lemmaKey(w)] = chips
      }
      saveSynCache(lang, synCache)
      const cov = synonymCoverage(pack)
      console.log(
        `  synonyms ${Math.min(i + 25, words.length)}/${words.length} coverage ${(cov * 100).toFixed(1)}%`,
      )
    }
  }

  if (replaceOnly) {
    for (let round = 0; round < 4; round++) {
      const missing = pack.lemmas
        .filter((L) => {
          const orig = originalCount.get(L.word) ?? 0
          if (orig === 0 || unique.has(L.word)) return false
          return chipsOf(L).length < Math.min(SYNONYM_CHIP_CAP, orig)
        })
        .map((L) => L.word)
      if (!missing.length) break
      console.log(
        `  replace-only round ${round + 1}: ${missing.length} lemmas lost a chip to the ceiling`,
      )
      await ask(missing, 0.25 + round * 0.08, false, true)
    }
  } else {
    for (let round = 0; round < 4; round++) {
      const coverage = synonymCoverage(pack)
      if (coverage >= COVERAGE_TARGET) break
      const missing = pack.lemmas
        .filter((L) => chipsOf(L).length === 0 && !unique.has(L.word))
        .map((L) => L.word)
      if (!missing.length) break
      console.log(
        `  coverage ${(coverage * 100).toFixed(1)}% < 70% — round ${round + 1}, ${missing.length} lemmas`,
      )
      await ask(missing, 0.25 + round * 0.08, false)
    }

    if (synonymCoverage(pack) < COVERAGE_TARGET && unique.size) {
      const again = [...unique]
      console.log(`  reconsidering ${again.length} empty chip lists once`)
      for (const w of again) unique.delete(w)
      await ask(again, 0.45, true)
    }
  }

  for (const L of pack.lemmas) {
    const curated = curatedChips(lang, cefr, L.word)
    const source = curated ?? L.synonyms ?? []
    const chips = filterChipsInCeiling(lang, cefr, L.word, source, ctx)
    if (curated && curated.length === 0) {
      L.synonyms = undefined
      unique.add(L.word)
      synCache[lemmaKey(L.word)] = []
      continue
    }
    if (chips.length) {
      L.synonyms = chips
      synCache[lemmaKey(L.word)] = chips
      unique.delete(L.word)
    } else {
      L.synonyms = undefined
      if (unique.has(L.word) || curated) synCache[lemmaKey(L.word)] = []
      if (
        replaceOnly &&
        (originalCount.get(L.word) ?? 0) > 0 &&
        !curated
      ) {
        synCache[lemmaKey(L.word)] = []
      }
      if (curated) unique.add(L.word)
    }
  }
  saveSynCache(lang, synCache)

  const unresolved = pack.lemmas
    .filter((L) => chipsOf(L).length === 0 && !unique.has(L.word))
    .map((L) => L.word)
  return {
    coverage: synonymCoverage(pack),
    unique: [...unique].sort(),
    unresolved,
  }
}

async function repairPack(rel: string, replaceOnly = false): Promise<void> {
  const { lang, cefr, file } = parseRel(rel)
  const key = readXaiKey()
  if (!key) {
    throw new Error(
      'Need xAI key (set XAI_API_KEY or ~/.grok/auth.json SuperGrok login)',
    )
  }
  if (lang !== 'en') {
    loadMembershipCache()
    await ensureDicts()
  }

  const ctx = ceilingContext()
  const pack = JSON.parse(readFileSync(file, 'utf8')) as WordPack
  const originalWords = pack.lemmas.map((L) => L.word)
  const before = pack.lemmas.map((L) => ({
    gloss: L.gloss,
    synonyms: [...(L.synonyms ?? [])],
  }))

  const glossCache = loadGlossCache(lang)
  const synCache = loadSynCache(lang)

  for (const L of pack.lemmas) {
    const cached = glossCache[lemmaKey(L.word)]
    if (
      glossFails(lang, cefr, L.word, L.gloss, ctx) &&
      cached &&
      !glossFails(lang, cefr, L.word, cached, ctx)
    ) {
      L.gloss = cached
    }
  }

  await repairGlosses(lang, cefr, pack, glossCache, ctx, key)
  const syn = await repairSynonyms(
    lang,
    cefr,
    pack,
    synCache,
    ctx,
    key,
    replaceOnly,
  )

  const newWords = pack.lemmas.map((L) => L.word)
  if (JSON.stringify(newWords) !== JSON.stringify(originalWords)) {
    throw new Error(`${rel}: word list changed — aborting write`)
  }

  let glossHits = 0
  let synHits = 0
  for (const L of pack.lemmas) {
    const hits = violationsForLemma(lang, cefr, L.gloss ?? '', L.synonyms ?? [], ctx)
    glossHits += hits.filter((h) => h.kind === 'gloss').length
    synHits += hits.filter((h) => h.kind === 'synonym').length
    if ((L.synonyms?.length ?? 0) > SYNONYM_CHIP_CAP) {
      L.synonyms = L.synonyms!.slice(0, SYNONYM_CHIP_CAP)
    }
    if (!L.synonyms?.length) delete L.synonyms
    glossCache[lemmaKey(L.word)] = L.gloss ?? glossCache[lemmaKey(L.word)] ?? ''
  }
  if (glossHits || synHits) {
    throw new Error(
      `${rel}: ceiling hits remain gloss=${glossHits} synonym=${synHits}`,
    )
  }

  saveGlossCache(lang, glossCache)
  saveSynCache(lang, synCache)

  const changed = pack.lemmas.some((L, i) => {
    const prev = before[i]!
    return (
      L.gloss !== prev.gloss ||
      JSON.stringify(L.synonyms ?? []) !== JSON.stringify(prev.synonyms)
    )
  })
  if (changed) {
    pack.version = (typeof pack.version === 'number' ? pack.version : 0) + 1
    writeFileSync(file, JSON.stringify(pack, null, 2) + '\n')
  }

  console.log(
    `wrote ${rel} version=${pack.version} changed=${changed} coverage=${(syn.coverage * 100).toFixed(1)}% unique=${syn.unique.length} unresolved=${syn.unresolved.length}`,
  )
  if (syn.unique.length) {
    console.log(`unique referents (gloss-only): ${syn.unique.join(', ')}`)
  }
  if (syn.unresolved.length) {
    console.log(`unresolved (no chip, not marked unique): ${syn.unresolved.join(', ')}`)
  }
  if (syn.coverage < COVERAGE_TARGET) {
    console.warn(
      `${rel}: synonym coverage ${(syn.coverage * 100).toFixed(1)}% is under 70%. Unique referents stay gloss-only.`,
    )
  }
}

if (process.env.CI === 'true' || process.env.CI === '1') {
  console.error('scripts/repair-b2-c2-hints.ts does not run under CI=true')
  process.exit(1)
}

async function applyCuratedOnly(rel: string): Promise<void> {
  const { lang, cefr, file } = parseRel(rel)
  const ctx = ceilingContext()
  const pack = JSON.parse(readFileSync(file, 'utf8')) as WordPack
  const synCache = loadSynCache(lang)
  let changed = 0
  for (const L of pack.lemmas) {
    const curated = curatedChips(lang, cefr, L.word)
    if (!curated) continue
    const chips = filterChipsInCeiling(lang, cefr, L.word, curated, ctx)
    const next = chips.length ? chips : undefined
    if (JSON.stringify(L.synonyms ?? []) !== JSON.stringify(next ?? [])) changed++
    if (next) L.synonyms = next
    else delete L.synonyms
    synCache[lemmaKey(L.word)] = next ?? []
  }
  saveSynCache(lang, synCache)
  writeFileSync(file, JSON.stringify(pack, null, 2) + '\n')
  console.log(
    `${rel}: curated chip overrides ${changed}; coverage ${(synonymCoverage(pack) * 100).toFixed(1)}%`,
  )
}

const overridesOnly = process.argv.includes('--overrides-only')
const replaceOnly = process.argv.includes('--replace-only')
const rels = process.argv.slice(2).filter(
  (a) => a !== '--overrides-only' && a !== '--replace-only',
)
if (!rels.length) {
  console.error(
    'Usage: bun run scripts/repair-b2-c2-hints.ts [--replace-only] <rel> [<rel>...]',
  )
  console.error('Example: bun run scripts/repair-b2-c2-hints.ts en/b2.json')
  process.exit(1)
}
if (overridesOnly && replaceOnly) {
  console.error('Use only one of --overrides-only and --replace-only')
  process.exit(1)
}
for (const rel of rels) {
  if (overridesOnly) await applyCuratedOnly(rel)
  else await repairPack(rel, replaceOnly)
}
