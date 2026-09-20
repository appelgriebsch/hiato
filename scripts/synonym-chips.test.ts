import { describe, expect, test } from 'bun:test'
import {
  SYNONYM_CHIP_CAP,
  SYNONYM_COVERAGE_FLOOR,
  filterSynonymChips,
  invalidSynonymChipReason,
  lemmaHasValidChips,
  synonymCacheKeyIsSettled,
  synonymCoverageRatio,
} from './synonym-chips'

const DENY = new Set(['KILL', 'HELL', 'SEX'])

describe('filterSynonymChips', () => {
  test('drops spoiler and lemma-equal chips', () => {
    expect(
      filterSynonymChips('HOUSE', ['home', 'house', 'HOUSE', 'dwelling'], DENY),
    ).toEqual(['home', 'dwelling'])
    expect(invalidSynonymChipReason('HOUSE', 'house', DENY)).toBe('equals lemma')
    expect(invalidSynonymChipReason('APPLE', 'an apple snack', DENY)).toBe(
      'spoiler',
    )
  })

  test('caps at 3 unique chips', () => {
    expect(
      filterSynonymChips('START', ['begin', 'commence', 'open', 'launch'], DENY),
    ).toEqual(['begin', 'commence', 'open'])
    expect(SYNONYM_CHIP_CAP).toBe(3)
  })

  test('empty array is unique referent (no chips, not invalid)', () => {
    expect(filterSynonymChips('BANANA', [], DENY)).toEqual([])
    expect(lemmaHasValidChips('BANANA', [], DENY)).toBe(false)
    expect(lemmaHasValidChips('BANANA', undefined, DENY)).toBe(false)
    const cache: Record<string, string[]> = { BANANA: [] }
    expect(synonymCacheKeyIsSettled(cache, 'BANANA')).toBe(true)
    expect(synonymCacheKeyIsSettled(cache, 'APPLE')).toBe(false)
  })

  test('drops denylisted chips and whitespace', () => {
    expect(
      filterSynonymChips('HURT', ['  ', 'kill', 'harm', 'injure'], DENY),
    ).toEqual(['harm', 'injure'])
    expect(invalidSynonymChipReason('HURT', 'kill', DENY)).toBe('denylist')
    expect(invalidSynonymChipReason('BAD', 'go to hell', DENY)).toBe('denylist')
  })

  test('requires NFC and ignores duplicate case variants', () => {
    const decomposed = 'cafe\u0301'
    expect(invalidSynonymChipReason('BAR', decomposed, DENY)).toBe('not NFC')
    expect(filterSynonymChips('LARGE', ['big', 'BIG', 'huge'], DENY)).toEqual([
      'big',
      'huge',
    ])
  })

  test('coverage counts only lemmas with 1–3 valid chips', () => {
    expect(SYNONYM_COVERAGE_FLOOR).toBe(0.8)
    const lemmas = [
      { word: 'START', synonyms: ['begin'] },
      { word: 'HOUSE', synonyms: ['home', 'dwelling'] },
      { word: 'BEGIN', synonyms: ['start', 'commence'] },
      { word: 'BANANA' },
      { word: 'APPLE', synonyms: [] },
    ]
    expect(synonymCoverageRatio(lemmas, DENY)).toBe(0.6)
    expect(
      synonymCoverageRatio(
        [
          { word: 'A', synonyms: ['one'] },
          { word: 'B', synonyms: ['two'] },
          { word: 'C' },
        ],
        DENY,
      ),
    ).toBeCloseTo(2 / 3)
  })
})
