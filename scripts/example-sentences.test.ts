import { describe, expect, test } from 'bun:test'
import {
  buildSentenceIndex,
  cleanSentence,
  parseGateVerdict,
  pickTatoebaCandidate,
  sentenceAllowed,
  tatoebaCandidates,
  tatoebaUrl,
  parseTatoebaTsv,
  type ExampleGateLog,
} from './example-sentences'
import { nfcUpper } from './lemma-denylist'
import { checkExampleGate } from './packs-check-lib'
import type { WordPack } from '../src/packs/schema'

describe('example-sentences cleanSentence (#247)', () => {
  test('trims and collapses whitespace, keeps one terminal mark', () => {
    expect(cleanSentence('  We   live in a house. ')).toBe('We live in a house.')
    expect(cleanSentence('She is afraid of the dark!')).toBe('She is afraid of the dark!')
  })

  test('rejects non-sentences: too short, too long, no terminal mark, multi-sentence', () => {
    expect(cleanSentence('Hi.')).toBeNull()
    expect(cleanSentence('No period at the end')).toBeNull()
    expect(cleanSentence(`word ${'x'.repeat(200)}.`)).toBeNull()
    expect(cleanSentence('One sentence. Two sentences.')).toBeNull()
  })
})

describe('example-sentences guards (ADR 0048)', () => {
  test('requires the lemma as a whole word, case-insensitive', () => {
    expect(sentenceAllowed('We live in a small house.', 'en', 'HOUSE')).toBe(true)
    expect(sentenceAllowed('The greenhouse is big.', 'en', 'HOUSE')).toBe(false)
    expect(sentenceAllowed('Please add one more apple.', 'en', 'ADD')).toBe(true)
    expect(sentenceAllowed('The address has one more letter.', 'en', 'ADD')).toBe(false)
  })

  test('rejects sentences with capitalized person names, but not sentence-initial words', () => {
    // MARIA is on the name list mid-sentence; sentence-initial "The" is not a name.
    expect(sentenceAllowed('My friend Maria is here.', 'en', 'FRIEND')).toBe(false)
    expect(sentenceAllowed('The house is big.', 'en', 'HOUSE')).toBe(true)
  })

  test('tatoebaCandidates sorts shortest first and skips non-whole-word hits', () => {
    const dump = [
      'This is a much longer sentence about the house we saw.',
      'The house is big.',
      'The greenhouse stays open.',
    ]
    const index = buildSentenceIndex(dump, new Set([nfcUpper('HOUSE')]))
    const hits = tatoebaCandidates(index, 'en', 'HOUSE')
    expect(hits[0]).toBe('The house is big.')
    expect(hits.some((h) => h.includes('greenhouse'))).toBe(false)
    expect(pickTatoebaCandidate(index, 'en', 'HOUSE')).toBe('The house is big.')
    expect(pickTatoebaCandidate(index, 'en', 'MISSING')).toBeNull()
  })

  test('parseTatoebaTsv reads id<TAB>lang<TAB>text lines', () => {
    expect(
      parseTatoebaTsv('12\teng\tHello world.\n13\teng\tAnother one here.\n\nbadline'),
    ).toEqual(['Hello world.', 'Another one here.'])
  })

  test('tatoebaUrl uses ISO 639-3 per-language exports', () => {
    expect(tatoebaUrl('en')).toBe(
      'https://downloads.tatoeba.org/exports/per_language/eng/eng_sentences.tsv.bz2',
    )
    expect(tatoebaUrl('de')).toBe(
      'https://downloads.tatoeba.org/exports/per_language/deu/deu_sentences.tsv.bz2',
    )
  })
})

describe('example-sentences CEFR gate parsing (#247)', () => {
  test('PASS/FAIL verdicts, case-insensitive, garbage rejects', () => {
    expect(parseGateVerdict('PASS — all A1 words.')).toBe('pass')
    expect(parseGateVerdict('fail: uses B2 structure')).toBe('reject')
    expect(parseGateVerdict('maybe?')).toBeNull()
  })
})

describe('packs:check example gate log (ADR 0048, #247)', () => {
  const pack = {
    version: 11,
    lang: 'en',
    cefr: 'a1',
    license: 'CEFR-J Wordlist terms: free use with citation (© Tono Laboratory, TUFS)',
    attribution: ['Hiato test pack'],
    lemmas: [
      { word: 'HOUSE', gloss: 'a building', example: 'We live in a small house.' },
      { word: 'APPLE', gloss: 'a fruit' },
    ],
  } as unknown as WordPack

  const gate: ExampleGateLog = {
    'en/a1.json|HOUSE': {
      sentence: 'We live in a small house.',
      source: 'fixture',
      verdict: 'pass',
      level: 'a1',
      at: '2026-11-11',
    },
  }

  test('passes when every shipped example has a matching pass entry', () => {
    expect(checkExampleGate('en/a1.json', pack, gate)).toEqual([])
  })

  test('fails when the gate entry is missing, rejected, or stale', () => {
    const missing = checkExampleGate('en/a1.json', pack, {})
    expect(missing[0]).toMatch(/no CEFR gate entry/)
    const rejected: ExampleGateLog = {
      'en/a1.json|HOUSE': { ...gate['en/a1.json|HOUSE']!, verdict: 'reject' },
    }
    expect(checkExampleGate('en/a1.json', pack, rejected)[0]).toMatch(/gated REJECT/)
    const stale: ExampleGateLog = {
      'en/a1.json|HOUSE': { ...gate['en/a1.json|HOUSE']!, sentence: 'A different house.' },
    }
    expect(checkExampleGate('en/a1.json', pack, stale)[0]).toMatch(/differs from the gated sentence/)
  })
})
