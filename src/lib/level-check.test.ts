import { describe, expect, test } from 'bun:test'
import { dailySeedKey, hashString, localDateKey, pickDailyLemma } from '../engine/daily'
import {
  PACK_CEFR_LEVELS,
  PACK_LANGS,
  type PackCefr,
  type PackLang,
  type WordPack,
} from '../packs/schema'
import { checkItems, pickLevelCheckLemma, suggestLevel } from './level-check'

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

describe('pickLevelCheckLemma (ADR 0050 amendment 2026-11-19)', () => {
  test('seed is dailySeedKey + "|level-check", bumped past the Daily index', () => {
    const lang = 'en'
    const cefr: PackCefr = 'b1'
    const lemmas = packsFor(lang)[cefr].lemmas
    for (const dateKey of ['2026-11-13', '2026-11-19', localDateKey()]) {
      const seed = dailySeedKey(dateKey, lang, cefr)
      const dailyIdx = hashString(seed) % lemmas.length
      let expected = hashString(`${seed}|level-check`) % lemmas.length
      if (expected === dailyIdx && lemmas.length > 1) expected = (expected + 1) % lemmas.length
      expect(pickLevelCheckLemma(lemmas, dateKey, lang, cefr).word).toBe(lemmas[expected]!.word)
    }
  })

  test('never returns the Daily lemma, for all 6 languages × 6 levels × several date keys incl. today', () => {
    const dateKeys = ['2026-10-18', '2026-11-13', '2026-11-19', localDateKey()]
    for (const lang of PACK_LANGS) {
      const packs = packsFor(lang)
      for (const dateKey of dateKeys) {
        for (const item of checkItems(packs, dateKey, lang)) {
          const daily = pickDailyLemma(packs[item.cefr].lemmas, dateKey, lang, item.cefr)
          expect(item.word).not.toBe(daily.word)
          expect(packs[item.cefr].lemmas.some((l) => l.word === item.word)).toBe(true)
        }
      }
    }
  })

  test('single-lemma pack: no alternative lemma exists, returns the only one', () => {
    const lemmas = [{ word: 'ONLY' }]
    expect(pickLevelCheckLemma(lemmas, '2026-11-19', 'en', 'a1').word).toBe('ONLY')
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

  test('each word comes from its own level pack and never equals that level\u2019s Daily', () => {
    const lang = 'pt'
    const packs = packsFor(lang)
    const items = checkItems(packs, dateKey, lang)
    for (const item of items) {
      const daily = pickDailyLemma(packs[item.cefr].lemmas, dateKey, lang, item.cefr)
      expect(item.word).not.toBe(daily.word)
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
          pickLevelCheckLemma(packs[item.cefr].lemmas, dateKey, lang, item.cefr).word,
        )
      }
    }
  })
})
