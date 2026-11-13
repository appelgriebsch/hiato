import { describe, expect, test } from 'bun:test'
import {
  applyTatoebaCredit,
  buildSentenceIndex,
  cleanSentence,
  CONTENT_RULE,
  gatePrompt,
  generatePrompt,
  parseGateVerdict,
  aunAsiMismatch,
  pickTatoebaCandidate,
  recordGateEntry,
  reuseCachedPass,
  sentenceAllowed,
  setLemmaExample,
  tatoebaCandidates,
  tatoebaUrl,
  parseTatoebaTsv,
  type ExampleGateEntry,
  type ExampleGateLog,
} from './example-sentences'
import { GATE_VERSION, isCurrentPass } from './example-gate'
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
    expect(sentenceAllowed('Foste tu, Tomás?', 'pt', 'FOSTE')).toBe(false)
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

  test('rejects person names that still ship, including accented forms', () => {
    expect(sentenceAllowed('Fadil left the house.', 'en', 'HOUSE')).toBe(false)
    expect(sentenceAllowed('The director is Flavio.', 'en', 'DIRECTOR')).toBe(false)
    expect(sentenceAllowed('Quiero conocer a María.', 'es', 'CONOCER')).toBe(false)
    expect(sentenceAllowed('Fadil left the house.', 'en', 'FADIL')).toBe(true)
  })

  test('AUN rejects "aun así" and still allows another sentence', () => {
    expect(aunAsiMismatch('Aun así, sigo paranoico.', 'AUN')).toBe(true)
    expect(sentenceAllowed('Aun así, sigo paranoico.', 'es', 'AUN')).toBe(false)
    expect(sentenceAllowed('Aun no ha llegado el correo.', 'es', 'AUN')).toBe(true)
    const index = buildSentenceIndex(
      ['Aun así, sigo paranoico.', 'Aun no ha llegado el correo.'],
      new Set([nfcUpper('AUN')]),
    )
    expect(tatoebaCandidates(index, 'es', 'AUN')).toEqual(['Aun no ha llegado el correo.'])
  })

  test('a cached pass is not reused when it contains a stock name', () => {
    const pass = { verdict: 'pass' as const, gate: GATE_VERSION, sentence: 'Fadil left the house.' }
    expect(reuseCachedPass(pass, 'HOUSE')).toBe(false)
    expect(reuseCachedPass({ ...pass, sentence: 'The house is big.' }, 'HOUSE')).toBe(true)
    expect(reuseCachedPass({ verdict: 'pass', gate: 1, sentence: 'The house is big.' }, 'HOUSE')).toBe(false)
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
  test('PASS/FAIL verdicts keep the reason', () => {
    expect(parseGateVerdict('PASS — all A1 words.')).toEqual({
      verdict: 'pass',
      reason: 'all A1 words.',
    })
    expect(parseGateVerdict('fail: uses B2 structure')).toEqual({
      verdict: 'reject',
      reason: 'uses B2 structure',
    })
    expect(parseGateVerdict('FAIL: death\n\nThe sentence describes a death.')).toEqual({
      verdict: 'reject',
      reason: 'death',
    })
    expect(parseGateVerdict('maybe?')).toBeNull()
  })

  test('isCurrentPass is only a pass at GATE_VERSION', () => {
    expect(isCurrentPass({ verdict: 'pass', gate: GATE_VERSION })).toBe(true)
    expect(isCurrentPass({ verdict: 'pass', gate: 1 })).toBe(false)
    expect(isCurrentPass({ verdict: 'pass' })).toBe(false)
    expect(isCurrentPass({ verdict: 'reject', gate: GATE_VERSION })).toBe(false)
    expect(isCurrentPass(undefined)).toBe(false)
  })

  test('a failed re-gate drops the previous example', () => {
    const lemma: { example?: string } = { example: 'Jack stand früh auf.' }
    setLemmaExample(lemma, null)
    expect(lemma.example).toBeUndefined()
    expect('example' in lemma).toBe(false)
    setLemmaExample(lemma, 'Die Jacke ist blau.')
    expect(lemma.example).toBe('Die Jacke ist blau.')
  })

  test('a later candidate does not overwrite the shipped sentence reject', () => {
    const log: ExampleGateLog = {}
    const shipped = 'Tom è morto.'
    recordGateEntry(
      log,
      'it/a1.json',
      'MORTO',
      {
        sentence: shipped,
        source: 'tatoeba',
        verdict: 'reject',
        reason: 'death',
        level: 'a1',
        at: '2026-11-12',
        gate: GATE_VERSION,
      },
      shipped,
    )
    recordGateEntry(
      log,
      'it/a1.json',
      'MORTO',
      {
        sentence: 'Il gatto è morto.',
        source: 'mistral',
        verdict: 'pass',
        level: 'a1',
        at: '2026-11-12',
        gate: GATE_VERSION,
      },
      shipped,
    )
    expect(log['it/a1.json|MORTO']?.sentence).toBe('Il gatto è morto.')
    expect(log['it/a1.json|MORTO|reject']).toEqual({
      sentence: shipped,
      source: 'tatoeba',
      verdict: 'reject',
      reason: 'death',
      level: 'a1',
      at: '2026-11-12',
      gate: GATE_VERSION,
    })
  })
})

describe('Tatoeba credit (#247)', () => {
  test('stays with one sentence and goes at zero', () => {
    const credit =
      'Example sentences selected from Tatoeba (https://tatoeba.org), licensed CC-BY 2.0 FR.'
    const suffix = '; example sentences from Tatoeba, CC-BY 2.0 FR'
    const kept = {
      attribution: ['Hiato pack', credit],
      license: `CC-BY-SA-4.0${suffix}`,
    }
    applyTatoebaCredit(kept, 1)
    expect(kept.attribution).toEqual(['Hiato pack', credit])
    expect(kept.license).toBe(`CC-BY-SA-4.0${suffix}`)

    const gone = {
      attribution: ['Hiato pack', credit],
      license: `CC-BY-SA-4.0${suffix}`,
    }
    applyTatoebaCredit(gone, 0)
    expect(gone.attribution).toEqual(['Hiato pack'])
    expect(gone.license).toBe('CC-BY-SA-4.0')

    const added = { attribution: ['Hiato pack'], license: 'CC-BY-SA-4.0' }
    applyTatoebaCredit(added, 2)
    expect(added.attribution).toEqual(['Hiato pack', credit])
    expect(added.license).toBe(`CC-BY-SA-4.0${suffix}`)
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

  test('a current pass stays current for source mistral', () => {
    for (const source of ['mistral'] as const) {
      const entry = { ...gate['en/a1.json|HOUSE']!, source }
      expect(isCurrentPass(entry)).toBe(true)
      expect(checkExampleGate('en/a1.json', pack, { 'en/a1.json|HOUSE': entry })).toEqual([])
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
