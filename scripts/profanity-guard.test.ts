import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import {
  isDeniedGlossToken,
  isDeniedLemma,
  letterTokens,
  loadDenylistAllow,
  loadGlossExempt,
  loadPatternDenylist,
  nfcUpper,
  staleAllowEntries,
  staleGlossExempt,
} from './lemma-denylist'
import { foldKey, type SelectLang } from './pack-select'

const ROOT = path.join(import.meta.dir, '..')
const PACKS = path.join(ROOT, 'public', 'packs')
const LANGS = ['en', 'de', 'es', 'pt', 'fr', 'it'] as const
const CEFRS = ['a1', 'a2', 'b1', 'b2', 'c1', 'c2'] as const

type Lemma = { word: string; gloss?: string; synonyms?: string[] }
type Pack = { lemmas: Lemma[] }

function readPack(lang: string, cefr: string): Pack {
  return JSON.parse(readFileSync(path.join(PACKS, lang, `${cefr}.json`), 'utf8')) as Pack
}

function chipTokens(chip: string): string[] {
  return letterTokens(chip)
}

function glossTokens(text: string): string[] {
  return letterTokens(text)
}

/** Exact or pattern hit on a lemma, a gloss token, a gloss-cache value, or a synonym chip. */
export function profanityHits(
  packs: { lang: string; cefr: string; lemmas: Lemma[] }[],
  caches: {
    lang: string
    glossKeys: string[]
    gloss?: Record<string, string>
    synonym: Record<string, string[]>
  }[],
): string[] {
  const errors: string[] = []
  for (const pack of packs) {
    pack.lemmas.forEach((L, i) => {
      if (isDeniedLemma(L.word, undefined, pack.lang)) {
        errors.push(`${pack.lang}/${pack.cefr} #${i} lemma ${L.word}`)
      }
      for (const tok of glossTokens(L.gloss ?? '')) {
        if (isDeniedGlossToken(tok, pack.lang, L.word)) {
          errors.push(`${pack.lang}/${pack.cefr} #${i} gloss ${L.word} :: ${tok}`)
        }
      }
      for (const chip of L.synonyms ?? []) {
        const bad =
          isDeniedLemma(chip, undefined, pack.lang) ||
          chipTokens(chip).some((t) => isDeniedLemma(t, undefined, pack.lang))
        if (bad) errors.push(`${pack.lang}/${pack.cefr} #${i} chip ${L.word} :: ${chip}`)
      }
    })
  }
  for (const cache of caches) {
    for (const key of cache.glossKeys) {
      if (isDeniedLemma(key, undefined, cache.lang)) {
        errors.push(`gloss-cache ${cache.lang} ${key}`)
      }
    }
    for (const [key, text] of Object.entries(cache.gloss ?? {})) {
      for (const tok of glossTokens(text)) {
        if (isDeniedGlossToken(tok, cache.lang, key)) {
          errors.push(`gloss-cache ${cache.lang} ${key} :: ${tok}`)
        }
      }
    }
    for (const [key, chips] of Object.entries(cache.synonym)) {
      if (isDeniedLemma(key, undefined, cache.lang)) {
        errors.push(`synonym-cache ${cache.lang} key ${key}`)
      }
      for (const chip of chips) {
        const bad =
          isDeniedLemma(chip, undefined, cache.lang) ||
          chipTokens(chip).some((t) => isDeniedLemma(t, undefined, cache.lang))
        if (bad) errors.push(`synonym-cache ${cache.lang} ${key} :: ${chip}`)
      }
    }
  }
  return errors
}

function loadCaches() {
  return LANGS.map((lang) => {
    const gloss = JSON.parse(
      readFileSync(path.join(ROOT, 'scripts/data/gloss-cache', `${lang}.json`), 'utf8'),
    ) as Record<string, string>
    const synonym = JSON.parse(
      readFileSync(path.join(ROOT, 'scripts/data/synonym-cache', `${lang}.json`), 'utf8'),
    ) as Record<string, string[]>
    return { lang, glossKeys: Object.keys(gloss), gloss, synonym }
  })
}

/** NFC-unique and fold-unique. A DE ß/SS pair or a FR È/É pair is a fold fault. */
export function lemmaUniquenessFaults(lang: string, words: string[]): string[] {
  const faults: string[] = []
  const upper = words.map((w) => nfcUpper(w))
  if (new Set(upper).size !== upper.length) faults.push('nfc')
  const folds = upper.map((w) => foldKey(lang as SelectLang, w))
  if (new Set(folds).size !== folds.length) faults.push('fold')
  return faults
}

function loadPacks() {
  return LANGS.flatMap((lang) =>
    CEFRS.map((cefr) => ({ lang, cefr, lemmas: readPack(lang, cefr).lemmas })),
  )
}

describe('profanity guard', () => {
  test('FR BAISER and IT FIGA stay blocked', () => {
    expect(isDeniedLemma('BAISER', undefined, 'fr')).toBe(true)
    expect(isDeniedLemma('FIGA', undefined, 'it')).toBe(true)
  })

  test('every pack has exactly 400 unique lemmas', () => {
    const counts: Record<string, number> = {}
    for (const lang of LANGS) {
      for (const cefr of CEFRS) {
        const lemmas = readPack(lang, cefr).lemmas
        const rel = `${lang}/${cefr}`
        counts[rel] = lemmas.length
        expect(`${rel} length ${lemmas.length}`).toBe(`${rel} length 400`)
        expect(lemmaUniquenessFaults(lang, lemmas.map((L) => L.word))).toEqual([])
      }
    }
    expect(Object.keys(counts).length).toBe(36)
  })

  test('shipped packs and both caches have no denylist hit', () => {
    expect(profanityHits(loadPacks(), loadCaches())).toEqual([])
  })

  test('a profane gloss fails', () => {
    const packs = loadPacks()
    const pt = packs.find((p) => p.lang === 'pt' && p.cefr === 'a1')!
    pt.lemmas = pt.lemmas.map((L, i) =>
      i === 0 ? { ...L, gloss: 'fazer merda com alguém, foder' } : L,
    )
    const es = packs.find((p) => p.lang === 'es' && p.cefr === 'a1')!
    es.lemmas = es.lemmas.map((L, i) =>
      i === 0 ? { ...L, gloss: 'follar con alguien; coño' } : L,
    )
    const errors = profanityHits(packs, [])
    expect(errors.some((e) => e.includes('merda'))).toBe(true)
    expect(errors.some((e) => e.includes('foder'))).toBe(true)
    expect(errors.some((e) => e.includes('follar'))).toBe(true)
    expect(errors.some((e) => e.includes('coño'))).toBe(true)
  })

  test('a slur in a gloss fails', () => {
    const packs = loadPacks()
    const fr = packs.find((p) => p.lang === 'fr' && p.cefr === 'a1')!
    fr.lemmas = fr.lemmas.map((L, i) => (i === 0 ? { ...L, gloss: 'un pédé' } : L))
    const it = packs.find((p) => p.lang === 'it' && p.cefr === 'a1')!
    it.lemmas = it.lemmas.map((L, i) => (i === 0 ? { ...L, gloss: 'un frocio' } : L))
    const errors = profanityHits([fr, it], [])
    expect(errors.some((e) => e.includes(' gloss ') && e.toLowerCase().includes('pédé'))).toBe(true)
    expect(errors.some((e) => e.includes(' gloss ') && e.toLowerCase().includes('frocio'))).toBe(true)
  })

  test('a pattern-only gloss token fails', () => {
    const packs = loadPacks()
    const pt = packs.find((p) => p.lang === 'pt' && p.cefr === 'a1')!
    pt.lemmas = pt.lemmas.map((L, i) => (i === 0 ? { ...L, gloss: 'ver fodido' } : L))
    const es = packs.find((p) => p.lang === 'es' && p.cefr === 'a1')!
    es.lemmas = es.lemmas.map((L, i) => (i === 0 ? { ...L, gloss: 'ellos chingaron' } : L))
    const errors = profanityHits([pt, es], [])
    expect(errors.some((e) => e.includes(' gloss ') && e.includes('fodido'))).toBe(true)
    expect(errors.some((e) => e.includes(' gloss ') && e.includes('chingaron'))).toBe(true)
  })

  test('a stale gloss exemption is reported', () => {
    const stale = staleGlossExempt([
      ...loadGlossExempt(),
      { lang: 'fr', word: 'MAISON', reason: 'not a profanity exact' },
    ])
    expect(stale.map((e) => `${e.lang} ${e.word}`)).toContain('fr MAISON')
  })

  test('exact profanity and slurs in a gloss fail', () => {
    const packs = loadPacks()
    const plant: [string, string, string[]][] = [
      ['de', 'Arschloch, Fotze, Hure', ['Arschloch', 'Fotze', 'Hure']],
      ['fr', 'salaud', ['salaud']],
      ['it', 'puttana, vaffanculo, figa', ['puttana', 'vaffanculo', 'figa']],
      ['es', 'hijo de puta, cabrón', ['puta', 'cabrón']],
    ]
    for (const [lang, gloss] of plant) {
      const pack = packs.find((p) => p.lang === lang && p.cefr === 'a1')!
      pack.lemmas = pack.lemmas.map((L, i) => (i === 0 ? { ...L, gloss } : L))
    }
    const errors = profanityHits(packs, [])
    for (const [, , toks] of plant) {
      for (const tok of toks) {
        expect(errors.some((e) => e.includes(' gloss ') && e.toLowerCase().includes(tok.toLowerCase()))).toBe(true)
      }
    }
  })

  test('an NFC-unique fold duplicate is a fault', () => {
    expect(lemmaUniquenessFaults('de', ['STRASSE', 'STRAßE'])).toEqual(['fold'])
    expect(lemmaUniquenessFaults('fr', ['ÉVÉNEMENT', 'ÉVÈNEMENT'])).toEqual(['fold'])
  })

  test('a punctuation-glued gloss token is still reported', () => {
    const packs = loadPacks()
    const de = packs.find((p) => p.lang === 'de' && p.cefr === 'a1')!
    de.lemmas = de.lemmas.map((L, i) => (i === 0 ? { ...L, gloss: 'Arschloch,' } : L))
    const fr = packs.find((p) => p.lang === 'fr' && p.cefr === 'a1')!
    fr.lemmas = fr.lemmas.map((L, i) => (i === 0 ? { ...L, gloss: 'salaud.' } : L))
    const errors = profanityHits([de, fr], [])
    const gloss = errors.filter((e) => e.includes(' gloss '))
    expect(gloss.some((e) => e.includes('Arschloch'))).toBe(true)
    expect(gloss.some((e) => e.includes('salaud'))).toBe(true)
  })

  test('gloss scan is language-scoped and skips the lemma itself', () => {
    expect(isDeniedGlossToken('salaud', 'de')).toBe(false)
    expect(isDeniedGlossToken('salaud', 'fr')).toBe(true)
    expect(isDeniedGlossToken('salaud', 'fr', 'SALAUD')).toBe(false)
    expect(isDeniedGlossToken('die', 'de', 'ZEIT')).toBe(false)
    expect(isDeniedGlossToken('hell', 'de', 'TAG')).toBe(false)
    expect(isDeniedGlossToken('hell', 'en', 'PLACE')).toBe(true)
    expect(isDeniedGlossToken('dick', 'de', 'BREI')).toBe(false)
    expect(isDeniedGlossToken('dick', 'en', 'PLACE')).toBe(true)
    expect(isDeniedGlossToken('Arschloch', 'de', 'ARSCHLOCH')).toBe(false)
    expect(isDeniedGlossToken('Fotze', 'de', 'ARSCHLOCH')).toBe(true)
  })

  test('the allowlist has no stale entry', () => {
    expect(staleAllowEntries()).toEqual([])
  })

  test('the gloss exemption file has no stale entry', () => {
    expect(staleGlossExempt()).toEqual([])
  })

  test('reinserting FODI into pt/c2 fails', () => {
    const packs = loadPacks()
    const pt = packs.find((p) => p.lang === 'pt' && p.cefr === 'c2')!
    pt.lemmas = pt.lemmas.map((L, i) => (i === 140 ? { ...L, word: 'FODI' } : L))
    const errors = profanityHits(packs, [])
    expect(errors.some((e) => e.includes('FODI'))).toBe(true)
  })

  test('a hyphen or slash in a chip is split', () => {
    const packs = loadPacks()
    const pt = packs.find((p) => p.lang === 'pt' && p.cefr === 'a1')!
    pt.lemmas = pt.lemmas.map((L, i) => (i === 0 ? { ...L, synonyms: ['merda-merda'] } : L))
    const it = packs.find((p) => p.lang === 'it' && p.cefr === 'a1')!
    it.lemmas = it.lemmas.map((L, i) => (i === 0 ? { ...L, synonyms: ['stronzo/cazzo'] } : L))
    const errors = profanityHits(packs, [])
    expect(errors.some((e) => e.includes('merda-merda'))).toBe(true)
    expect(errors.some((e) => e.includes('stronzo/cazzo'))).toBe(true)
  })

  test('a multi-word chip is split', () => {
    const packs = loadPacks()
    const es = packs.find((p) => p.lang === 'es' && p.cefr === 'a1')!
    es.lemmas = es.lemmas.map((L, i) => (i === 0 ? { ...L, synonyms: ['ver jodido'] } : L))
    const errors = profanityHits(packs, [])
    expect(errors.some((e) => e.includes('jodido'))).toBe(true)
  })

  test('the cache scan runs', () => {
    const errors = profanityHits([], [{ lang: 'pt', glossKeys: ['FODI'], synonym: { CASA: ['ver fodido'] } }])
    expect(errors.some((e) => e.includes('gloss-cache') && e.includes('FODI'))).toBe(true)
    expect(errors.some((e) => e.includes('fodido'))).toBe(true)
  })

  test('a gloss-cache value is scanned word by word', () => {
    const errors = profanityHits(
      [],
      [{ lang: 'en', glossKeys: [], gloss: { PLACE: 'to fuck around' }, synonym: {} }],
    )
    expect(errors.some((e) => e.includes('gloss-cache') && e.includes('PLACE') && e.includes('fuck'))).toBe(true)
  })

  test('a jodido chip fails', () => {
    const packs = loadPacks()
    const es = packs.find((p) => p.lang === 'es' && p.cefr === 'c1')!
    es.lemmas = es.lemmas.map((L, i) =>
      i === 0 ? { ...L, synonyms: [...(L.synonyms ?? []), 'jodido'] } : L,
    )
    const errors = profanityHits(packs, [])
    expect(errors.some((e) => e.includes('jodido'))).toBe(true)
  })

  test('a stale allowlist entry fails', () => {
    const stale = staleAllowEntries(loadPatternDenylist(), [
      ...loadDenylistAllow(),
      { lang: 'fr', word: 'MAISON', reason: 'no pattern matches' },
    ])
    expect(stale.map((e) => `${e.lang} ${e.word}`)).toContain('fr MAISON')
  })
})
