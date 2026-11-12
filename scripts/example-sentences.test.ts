import { describe, expect, test } from 'bun:test'
import {
  buildSentenceIndex,
  cleanSentence,
  CONTENT_RULE,
  GATE_VERSION,
  gatePrompt,
  generatePrompt,
  parseGateVerdict,
  pickTatoebaCandidate,
  sentenceAllowed,
  tatoebaCandidates,
  tatoebaUrl,
  parseTatoebaTsv,
  type ExampleGateEntry,
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

  test('rejects sentence-initial Tatoeba stock names (#247 reopen)', () => {
    expect(sentenceAllowed('Tom is happy today.', 'en', 'HAPPY')).toBe(false)
    expect(sentenceAllowed('Mary has a big house.', 'en', 'HOUSE')).toBe(false)
    expect(sentenceAllowed('Bob and Dan are friends.', 'en', 'FRIEND')).toBe(false)
  })

  test('a lemma that equals a stock name is not rejected for itself', () => {
    expect(sentenceAllowed('Jack stand früh auf.', 'de', 'JACK')).toBe(true)
    expect(sentenceAllowed('Jack is a nice jacket.', 'en', 'JACK')).toBe(true)
  })

  test('a sentence-initial common word is not rejected as a stock name', () => {
    // ROSE is a common German noun/verb, not on the stock-name list.
    expect(sentenceAllowed('Rose ist eine schöne Blume.', 'de', 'BLUME')).toBe(true)
  })

  test('stock names are rejected mid-sentence too', () => {
    expect(sentenceAllowed('I saw Tom at the house.', 'en', 'HOUSE')).toBe(false)
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

describe('example-sentences gate/generate prompts (#247 reopen)', () => {
  test('gate prompt includes the gloss sense and the content rule', () => {
    const p = gatePrompt('de', 'a1', 'Die Jacke ist neu.', 'JACK', 'eine Jacke')
    expect(p).toContain('"JACK"')
    expect(p).toContain('"eine Jacke"')
    expect(p).toContain('meaning given by the gloss')
    expect(p).toContain(CONTENT_RULE)
  })

  test('gate prompt skips the sense check when the lemma has no gloss', () => {
    const p = gatePrompt('en', 'a1', 'The house is big.', 'HOUSE')
    expect(p).not.toContain('meaning given by the gloss')
    expect(p).toContain(CONTENT_RULE)
  })

  test('generate prompt includes the gloss and the content rule', () => {
    const p = generatePrompt('fr', 'a1', 'PARTIE', 'une portion')
    expect(p).toContain('"PARTIE"')
    expect(p).toContain('"une portion"')
    expect(p).toContain(CONTENT_RULE)
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

  const gateEntry = (overrides: Partial<ExampleGateEntry> = {}): ExampleGateEntry => ({
    sentence: 'We live in a small house.',
    source: 'fixture',
    verdict: 'pass',
    level: 'a1',
    at: '2026-11-11',
    gate: GATE_VERSION,
    ...overrides,
  })

  const gate: ExampleGateLog = {
    'en/a1.json|HOUSE': gateEntry(),
  }

  test('passes when every shipped example has a matching gate-2 pass entry', () => {
    expect(checkExampleGate('en/a1.json', pack, gate)).toEqual([])
  })

  test('accepts a new xai entry and a legacy generated entry', () => {
    for (const source of ['xai', 'mistral'] as const) {
      const log: ExampleGateLog = {
        'en/a1.json|HOUSE': { ...gate['en/a1.json|HOUSE']!, source },
      }
      expect(checkExampleGate('en/a1.json', pack, log)).toEqual([])
    }
  })

  test('fails when the gate entry is missing, rejected, or stale', () => {
    const missing = checkExampleGate('en/a1.json', pack, {})
    expect(missing[0]).toMatch(/no CEFR gate entry/)
    const rejected: ExampleGateLog = {
      'en/a1.json|HOUSE': gateEntry({ verdict: 'reject' }),
    }
    expect(checkExampleGate('en/a1.json', pack, rejected)[0]).toMatch(/gated REJECT/)
    const stale: ExampleGateLog = {
      'en/a1.json|HOUSE': gateEntry({ sentence: 'A different house.' }),
    }
    expect(checkExampleGate('en/a1.json', pack, stale)[0]).toMatch(/differs from the gated sentence/)
  })

  test('a version-1 or missing gate version counts as stale (#247 reopen)', () => {
    const v1: ExampleGateLog = {
      'en/a1.json|HOUSE': gateEntry({ gate: 1 }),
    }
    expect(checkExampleGate('en/a1.json', pack, v1)[0]).toMatch(/stale gate entry/)
    const noVersion: ExampleGateLog = {
      'en/a1.json|HOUSE': gateEntry({ gate: undefined }),
    }
    expect(checkExampleGate('en/a1.json', pack, noVersion)[0]).toMatch(/stale gate entry/)
  })

  test('fails a shipped example containing a Tatoeba stock name (#247 reopen)', () => {
    const badPack = {
      ...pack,
      lemmas: [
        { word: 'HAPPY', gloss: 'glücklich', example: 'Tom is happy today.' },
      ],
    } as unknown as WordPack
    const badGate: ExampleGateLog = {
      'en/a1.json|HAPPY': gateEntry({ sentence: 'Tom is happy today.' }),
    }
    const errors = checkExampleGate('en/a1.json', badPack, badGate)
    expect(errors[0]).toMatch(/Tatoeba stock name "Tom"/)
  })
})
