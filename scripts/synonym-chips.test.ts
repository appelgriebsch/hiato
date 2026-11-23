import { describe, expect, test } from 'bun:test'
import {
  CHIP_LANG_GATE_LANGS,
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

  test('splits elided chips on apostrophes for a scoped denylist', () => {
    const scoped = new Set(['fr NÈGRE'])
    expect(invalidSynonymChipReason('AMI', "l'nègre", scoped, 'fr')).toBe(
      'denylist',
    )
    expect(invalidSynonymChipReason('AMI', "l'nègre", scoped, 'en')).toBeNull()
    expect(invalidSynonymChipReason('AMI', 'nègre', scoped, 'es')).toBeNull()
    expect(filterSynonymChips('AMI', ["l'nègre"], scoped)).toEqual(["l'nègre"])
    expect(filterSynonymChips('AMI', ["l'nègre"], scoped, 'fr')).toEqual([])
    expect(
      synonymCoverageRatio(
        [{ word: 'AMI', synonyms: ["l'nègre"] }],
        scoped,
        'fr',
      ),
    ).toBe(0)
    expect(
      synonymCoverageRatio([{ word: 'AMI', synonyms: ["l'nègre"] }], scoped),
    ).toBe(1)
  })

  test('drops denylisted chips and whitespace', () => {
    expect(
      filterSynonymChips('HURT', ['  ', 'kill', 'harm', 'injure'], DENY),
    ).toEqual(['harm', 'injure'])
    expect(invalidSynonymChipReason('HURT', 'kill', DENY)).toBe('denylist')
    expect(invalidSynonymChipReason('BAD', 'go to hell', DENY)).toBe('denylist')
    expect(invalidSynonymChipReason('CASA', 'merda-merda', DENY, 'pt')).toBe('denylist')
    expect(invalidSynonymChipReason('CASA', 'stronzo/cazzo', DENY, 'it')).toBe('denylist')
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

describe('#362 chip language gate (pt first)', () => {
  // Stand-in for lang-membership isWordOfLang with the testdata pt dicts:
  // pt-pt accepts for/casa/hotel, pt-br accepts come/casa/hotel.
  const ptMember = (lang: string, w: string): boolean =>
    lang === 'pt' && ['casa', 'hotel', 'for', 'come'].includes(w.toLowerCase())

  test('letter-less chips never ship: stringified "[]", "[", numerals', () => {
    expect(invalidSynonymChipReason('DOZE', '[]', DENY)).toBe('not a word')
    expect(invalidSynonymChipReason('DENTE', '[', DENY)).toBe('not a word')
    expect(invalidSynonymChipReason('SETE', '7', DENY)).toBe('not a word')
    expect(invalidSynonymChipReason('TERCEIRO', '3.', DENY)).toBe('not a word')
    expect(filterSynonymChips('DOZE', ['[]', '[', '12'], DENY, 'pt')).toEqual([])
  })

  test('pt chips must be words of pt (every letter token), phrases allowed when all tokens are pt', () => {
    expect(invalidSynonymChipReason('BEBIDA', 'drink', DENY, 'pt', ptMember)).toBe(
      'not a word of pt',
    )
    expect(invalidSynonymChipReason('JORNALISTA', 'REPORTER', DENY, 'pt', ptMember)).toBe(
      'not a word of pt',
    )
    expect(invalidSynonymChipReason('MALAS', 'valises', DENY, 'pt', ptMember)).toBe(
      'not a word of pt',
    )
    expect(invalidSynonymChipReason('BEBIDA', 'casa', DENY, 'pt', ptMember)).toBeNull()
    expect(invalidSynonymChipReason('PERTO', 'for casa', DENY, 'pt', ptMember)).toBeNull()
    expect(filterSynonymChips('BEBIDA', ['drink', 'casa'], DENY, 'pt', ptMember)).toEqual(['casa'])
  })

  test('gate is off without the membership fn, and only for gate languages', () => {
    // No dicts loaded (bun:test): membership rule skipped, shape rule still applies.
    expect(invalidSynonymChipReason('BEBIDA', 'drink', DENY, 'pt')).toBeNull()
    expect(invalidSynonymChipReason('DOZE', '[]', DENY, 'pt')).toBe('not a word')
    // Non-gated languages are unaffected even with a predicate.
    expect(invalidSynonymChipReason('BEBIDA', 'drink', DENY, 'es', ptMember)).toBeNull()
    expect(CHIP_LANG_GATE_LANGS.has('pt')).toBe(true)
    expect(CHIP_LANG_GATE_LANGS.has('de')).toBe(false)
  })
})
