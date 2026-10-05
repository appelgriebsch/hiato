import { describe, expect, test } from 'bun:test'
import {
  buildLemmaEasiestBand,
  cefrAbove,
  hintCeilingViolations,
  HINT_CEILING_SUBJECT_BANDS,
  isHintCeilingEnforcedRel,
} from './hint-ceiling'
import path from 'node:path'
import { tmpdir } from 'node:os'
import {
  HINT_CEILING_SCHEMA,
  computeHintCeilingStamp,
  loadEnEasiestCefr,
} from './hint-ceiling-data'

describe('hint ceiling helper', () => {
  test('missing cache fails closed', () => {
    const missingPath = path.join(
      tmpdir(),
      `missing-en-easiest-${process.pid}-${Date.now()}.json`,
    )
    expect(() => loadEnEasiestCefr(missingPath)).toThrow(/missing/)
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

  test('surface A1 and stem C2 does not fail a B2 pack', () => {
    const lemmaEasiestBand = new Map([
      ['WASSER', 'a1'],
      ['WASSERN', 'c2'],
    ])
    const stemCache = new Map([['WASSER', ['WASSERN']]])
    const hits = hintCeilingViolations({
      lang: 'de',
      packBand: 'b2',
      gloss: 'ein unter Wasser fahrendes Geschoss',
      synonyms: [],
      lemmaEasiestBand,
      stemCache,
    })
    expect(hits).toEqual([])
  })

  test('harder CEFR tag fails a B2 pack in the scorer', () => {
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
    expect(hits.some((h) => h.token.toLowerCase() === 'scared' && h.band === 'c1')).toBe(
      true,
    )
  })

  test('surface fails when every stem misses the pack map', () => {
    const lemmaEasiestBand = new Map([['DISLIKE', 'a2']])
    const stemCache = new Map([['DISLIKE', ['LIKE']]])
    const hits = hintCeilingViolations({
      lang: 'en',
      packBand: 'a1',
      gloss: 'feeling strong dislike',
      synonyms: [],
      lemmaEasiestBand,
      stemCache,
      enEasiestTag: new Map([
        ['LIKE', 'a1'],
        ['DISLIKE', 'a2'],
        ['FEELING', 'a1'],
        ['STRONG', 'a1'],
      ]),
    })
    expect(hits.some((h) => h.token.toLowerCase() === 'dislike' && h.via === 'pack')).toBe(
      true,
    )
    expect(hits.some((h) => h.token.toLowerCase() === 'feeling')).toBe(false)
  })

  test('subject bands stay A1–B1 so a B2 rel is not enforced', () => {
    expect([...HINT_CEILING_SUBJECT_BANDS].sort()).toEqual(['a1', 'a2', 'b1'])
    expect(isHintCeilingEnforcedRel('de/b2.json')).toBe(false)
    expect(isHintCeilingEnforcedRel('en/c1.json')).toBe(false)
    expect(isHintCeilingEnforcedRel('en/c2.json')).toBe(false)
    expect(isHintCeilingEnforcedRel('en/b1.json')).toBe(true)
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
