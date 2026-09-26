import { describe, expect, test } from 'bun:test'
import {
  buildLemmaEasiestBand,
  cefrAbove,
  hintCeilingViolations,
} from './hint-ceiling'
import { existsSync, renameSync } from 'node:fs'
import {
  EN_EASIEST_CEFR_PATH,
  HINT_CEILING_SCHEMA,
  computeHintCeilingStamp,
  loadEnEasiestCefr,
} from './hint-ceiling-data'

describe('hint ceiling helper', () => {
  test('missing cache fails closed', () => {
    if (!existsSync(EN_EASIEST_CEFR_PATH)) {
      expect(() => loadEnEasiestCefr()).toThrow(/missing/)
      return
    }
    const tmp = `${EN_EASIEST_CEFR_PATH}.bak-test`
    renameSync(EN_EASIEST_CEFR_PATH, tmp)
    try {
      expect(() => loadEnEasiestCefr()).toThrow(/missing/)
    } finally {
      renameSync(tmp, EN_EASIEST_CEFR_PATH)
    }
  })
  test('higher stem fails A1', () => {
    const lemmaEasiestBand = new Map([
      ['SCARE', 'a2'],
      ['HOUSE', 'a1'],
    ])
    const stemCache = new Map([['SCARED', ['SCARE']]])
    const hits = hintCeilingViolations({
      lang: 'en',
      packBand: 'a1',
      gloss: 'Feeling scared of something.',
      synonyms: [],
      lemmaEasiestBand,
      stemCache,
      enEasiestTag: new Map(),
    })
    expect(hits.some((h) => h.token.toLowerCase() === 'scared')).toBe(true)
    expect(hits[0]?.via).toBe('stem')
  })

  test('same token does not fail a B2 subject', () => {
    const lemmaEasiestBand = new Map([['SCARE', 'a2']])
    const stemCache = new Map([['SCARED', ['SCARE']]])
    const hits = hintCeilingViolations({
      lang: 'en',
      packBand: 'b2',
      gloss: 'Feeling scared of something.',
      synonyms: [],
      lemmaEasiestBand,
      stemCache,
      enEasiestTag: new Map([['SCARED', 'c1']]),
    })
    expect(hits).toEqual([])
  })

  test('unlisted token passes', () => {
    const hits = hintCeilingViolations({
      lang: 'en',
      packBand: 'a1',
      gloss: 'A flibbertigibbet sort of thing.',
      synonyms: ['xyzzy'],
      lemmaEasiestBand: new Map([['HOUSE', 'a1']]),
      stemCache: new Map(),
      enEasiestTag: new Map(),
    })
    expect(hits).toEqual([])
  })

  test('CEFR-J A1 wins over Octanove C1 (easiest tag)', () => {
    // committed map already stores the minimum; verify a1 tag passes on a1
    const hits = hintCeilingViolations({
      lang: 'en',
      packBand: 'a1',
      gloss: 'A house to live in.',
      synonyms: [],
      lemmaEasiestBand: new Map(),
      stemCache: new Map(),
      enEasiestTag: new Map([['HOUSE', 'a1']]), // min(CEFR-J a1, Octanove c1) = a1
    })
    expect(hits).toEqual([])
    // if tag were c1 it would fail
    const hard = hintCeilingViolations({
      lang: 'en',
      packBand: 'a1',
      gloss: 'A house to live in.',
      synonyms: [],
      lemmaEasiestBand: new Map(),
      stemCache: new Map(),
      enEasiestTag: new Map([['HOUSE', 'c1']]),
    })
    expect(hard.some((h) => h.via === 'cefr-tag')).toBe(true)
  })

  test('lemma easiest pack A1 passes on A1 even if also in a higher pack', () => {
    // buildLemmaEasiestBand keeps the minimum
    const map = buildLemmaEasiestBand('en', [
      { cefr: 'a1', lemmas: [{ word: 'BOOK' }] },
      { cefr: 'b2', lemmas: [{ word: 'BOOK' }] },
    ])
    expect(map.get('BOOK')).toBe('a1')
    const hits = hintCeilingViolations({
      lang: 'en',
      packBand: 'a1',
      gloss: 'A book of stories.',
      synonyms: [],
      lemmaEasiestBand: map,
      stemCache: new Map(),
      enEasiestTag: new Map(),
    })
    expect(hits).toEqual([])
  })

  test('cefrAbove is strict', () => {
    expect(cefrAbove('a2', 'a1')).toBe(true)
    expect(cefrAbove('a1', 'a1')).toBe(false)
    expect(cefrAbove('a1', 'a2')).toBe(false)
  })

  test('stamp is stable for a given wordhoard fingerprint', () => {
    expect(HINT_CEILING_SCHEMA).toBe(1)
    const a = computeHintCeilingStamp({ size: 1, sha256: 'abc' })
    const b = computeHintCeilingStamp({ size: 1, sha256: 'abc' })
    const c = computeHintCeilingStamp({ size: 2, sha256: 'abc' })
    expect(a).toBe(b)
    expect(a).not.toBe(c)
  })
})
