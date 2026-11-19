import { describe, expect, test } from 'bun:test'
import { pickDailyLemma } from '../engine/daily'
import {
  PACK_CEFR_LEVELS,
  type PackCefr,
  type PackLang,
  type WordPack,
} from '../packs/schema'
import { checkItems, suggestLevel } from './level-check'

function pack(lang: PackLang, cefr: PackCefr, words: string[]): WordPack {
  return {
    version: 1,
    lang,
    cefr,
    license: 'test',
    attribution: [],
    lemmas: words.map((word) => ({ word })),
  }
}

/** Distinct word pools per level so a mix-up between levels is visible. */
function packsFor(lang: PackLang): Record<PackCefr, WordPack> {
  const packs = {} as Record<PackCefr, WordPack>
  for (const cefr of PACK_CEFR_LEVELS) {
    packs[cefr] = pack(lang, cefr, [
      `${cefr.toUpperCase()}-ALPHA`,
      `${cefr.toUpperCase()}-BRAVO`,
      `${cefr.toUpperCase()}-CHARLIE`,
      `${cefr.toUpperCase()}-DELTA`,
    ])
  }
  return packs
}

describe('suggestLevel (ADR 0050)', () => {
  test('none known → a1', () => {
    expect(suggestLevel([])).toBe('a1')
  })

  test('single known level wins', () => {
    expect(suggestLevel(['b2'])).toBe('b2')
    expect(suggestLevel(['a1'])).toBe('a1')
  })

  test('highest known wins, gaps ignored', () => {
    expect(suggestLevel(['a1', 'b1'])).toBe('b1')
    expect(suggestLevel(['a1', 'c1'])).toBe('c1')
  })

  test('order of answers does not matter', () => {
    expect(suggestLevel(['b2', 'a2'])).toBe('b2')
    expect(suggestLevel(['c1', 'a1', 'b1'])).toBe('c1')
  })

  test('all known → c2', () => {
    expect(suggestLevel([...PACK_CEFR_LEVELS])).toBe('c2')
  })
})

describe('checkItems (ADR 0050)', () => {
  const dateKey = '2026-11-13'

  test('one item per level, in A1→C2 order', () => {
    const packs = packsFor('en')
    const items = checkItems(packs, dateKey, 'en')
    expect(items.map((i) => i.cefr)).toEqual([...PACK_CEFR_LEVELS])
    expect(items).toHaveLength(6)
  })

  test('each word is the seeded daily pick of its own level pack', () => {
    const lang = 'pt'
    const packs = packsFor(lang)
    const items = checkItems(packs, dateKey, lang)
    for (const item of items) {
      const expected = pickDailyLemma(packs[item.cefr].lemmas, dateKey, lang, item.cefr)
      expect(item.word).toBe(expected.word)
      expect(packs[item.cefr].lemmas.some((l) => l.word === item.word)).toBe(true)
    }
  })

  test('stable per local date key', () => {
    const packs = packsFor('de')
    expect(checkItems(packs, dateKey, 'de')).toEqual(checkItems(packs, dateKey, 'de'))
  })

  test('seed includes the language (lang is passed through to the pick)', () => {
    const packs = packsFor('en')
    for (const lang of ['en', 'fr', 'it'] as const) {
      for (const item of checkItems(packs, dateKey, lang)) {
        expect(item.word).toBe(
          pickDailyLemma(packs[item.cefr].lemmas, dateKey, lang, item.cefr).word,
        )
      }
    }
  })
})
