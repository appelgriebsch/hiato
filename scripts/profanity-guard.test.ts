import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import {
  isDeniedGlossToken,
  isDeniedLemma,
  letterTokens,
  loadDenylistAllow,
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
  return chip.split(/[\s'’]+/).filter(Boolean)
}

function glossTokens(text: string): string[] {
  return letterTokens(text)
}

/** Exact or pattern hit on a lemma, a gloss token, or a synonym-chip token. */
export function profanityHits(
  packs: { lang: string; cefr: string; lemmas: Lemma[] }[],
  caches: { lang: string; glossKeys: string[]; synonym: Record<string, string[]> }[],
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
    return { lang, glossKeys: Object.keys(gloss), synonym }
  })
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
        const words = lemmas.map((L) => nfcUpper(L.word))
        expect(`${rel} unique ${new Set(words).size}`).toBe(`${rel} unique 400`)
        const folds = words.map((w) => foldKey(lang as SelectLang, w))
        expect(`${rel} folds ${new Set(folds).size}`).toBe(`${rel} folds 400`)
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

  test('gloss scan is language-scoped and skips the lemma itself', () => {
    expect(isDeniedGlossToken('salaud', 'de')).toBe(false)
    expect(isDeniedGlossToken('salaud', 'fr')).toBe(true)
    expect(isDeniedGlossToken('salaud', 'fr', 'SALAUD')).toBe(false)
    expect(isDeniedGlossToken('die', 'de', 'ZEIT')).toBe(false)
    expect(isDeniedGlossToken('hell', 'de', 'TAG')).toBe(false)
    expect(isDeniedGlossToken('hell', 'en', 'PLACE')).toBe(true)
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
