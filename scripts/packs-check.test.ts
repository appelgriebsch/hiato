import { describe, expect, test } from 'bun:test'
import type { WordPack } from '../src/packs/schema'
import {
  C2_MIN,
  PACK_MIN,
  checkCompleteness,
  checkLemmaFloor,
  checkPackLicense,
  checkSynonymCoverage,
  exclusiveConflicts,
  expectedPackCount,
  requiresCcBySa,
  validatePack,
} from './packs-check-lib'

function pack(partial: Partial<WordPack> & Pick<WordPack, 'lang' | 'cefr'>): WordPack {
  return {
    version: 2,
    license: 'CC0-1.0 (curated)',
    attribution: ['Hiato test pack'],
    lemmas: [{ word: 'TEST', gloss: 'a sample' }],
    ...partial,
  }
}

describe('packs:check floors', () => {
  test('C2_MIN is 200; a1–c1 use 350', () => {
    expect(C2_MIN).toBe(200)
    expect(PACK_MIN).toBe(350)
    const c1 = pack({
      lang: 'en',
      cefr: 'c1',
      lemmas: Array.from({ length: 349 }, (_, i) => ({ word: `W${i}`, gloss: 'x' })),
    })
    expect(checkLemmaFloor('en/c1.json', c1)).toMatch(/below floor 350/)
    const c2ok = pack({
      lang: 'en',
      cefr: 'c2',
      lemmas: Array.from({ length: 200 }, (_, i) => ({ word: `W${i}`, gloss: 'x' })),
    })
    expect(checkLemmaFloor('en/c2.json', c2ok)).toBeNull()
    const c2lo = pack({
      lang: 'en',
      cefr: 'c2',
      lemmas: Array.from({ length: 199 }, (_, i) => ({ word: `W${i}`, gloss: 'x' })),
    })
    expect(checkLemmaFloor('en/c2.json', c2lo)).toMatch(/below floor 200/)
  })
})

describe('packs:check exclusive bands', () => {
  test('fails with both paths when a lemma repeats in one language', () => {
    const errors = exclusiveConflicts([
      {
        rel: 'en/a1.json',
        pack: pack({ lang: 'en', cefr: 'a1', lemmas: [{ word: 'HOUSE' }] }),
      },
      {
        rel: 'en/b2.json',
        pack: pack({ lang: 'en', cefr: 'b2', lemmas: [{ word: 'HOUSE' }] }),
      },
    ])
    expect(errors.length).toBe(1)
    expect(errors[0]).toContain('en/a1.json')
    expect(errors[0]).toContain('en/b2.json')
    expect(errors[0]).toContain('HOUSE')
  })

  test('DE ß/SS fold collides across packs', () => {
    const errors = exclusiveConflicts([
      {
        rel: 'de/a1.json',
        pack: pack({ lang: 'de', cefr: 'a1', lemmas: [{ word: 'STRASSE' }] }),
      },
      {
        rel: 'de/b2.json',
        pack: pack({ lang: 'de', cefr: 'b2', lemmas: [{ word: 'STRAßE' }] }),
      },
    ])
    expect(errors[0]).toContain('de/a1.json')
    expect(errors[0]).toContain('de/b2.json')
  })

  test('same spelling in different languages is allowed', () => {
    const errors = exclusiveConflicts([
      {
        rel: 'en/a1.json',
        pack: pack({ lang: 'en', cefr: 'a1', lemmas: [{ word: 'ANIMAL' }] }),
      },
      {
        rel: 'es/a1.json',
        pack: pack({ lang: 'es', cefr: 'a1', lemmas: [{ word: 'ANIMAL' }] }),
      },
    ])
    expect(errors).toEqual([])
  })

  test('historical A1–B1 duplicates are grandfathered; A1 vs B2 still fails', () => {
    const frozen = exclusiveConflicts([
      {
        rel: 'en/a1.json',
        pack: pack({ lang: 'en', cefr: 'a1', lemmas: [{ word: 'BOOK' }] }),
      },
      {
        rel: 'en/a2.json',
        pack: pack({ lang: 'en', cefr: 'a2', lemmas: [{ word: 'BOOK' }] }),
      },
    ])
    expect(frozen).toEqual([])
    const vsNew = exclusiveConflicts([
      {
        rel: 'en/a1.json',
        pack: pack({ lang: 'en', cefr: 'a1', lemmas: [{ word: 'BOOK' }] }),
      },
      {
        rel: 'en/b2.json',
        pack: pack({ lang: 'en', cefr: 'b2', lemmas: [{ word: 'BOOK' }] }),
      },
    ])
    expect(vsNew[0]).toContain('en/b2.json')
  })
})

describe('packs:check license matrix (ADR 0029)', () => {
  test('EN B2 is not required to be SA', () => {
    expect(requiresCcBySa('en', 'b2')).toBe(false)
    const enB2 = pack({
      lang: 'en',
      cefr: 'b2',
      license: 'CC0-1.0 (curated learner lemmas; glosses original to Hiato)',
      attribution: ['Cite Tono Lab / CEFR-J'],
    })
    expect(checkPackLicense('en/b2.json', enB2)).toBeNull()
  })

  test('EN C1/C2 labelled CC0 fails; must mention CC-BY-SA', () => {
    const cc0 = pack({
      lang: 'en',
      cefr: 'c1',
      license: 'CC0-1.0',
      attribution: ['Octanove'],
    })
    expect(checkPackLicense('en/c1.json', cc0)).toMatch(/must not be labelled CC0/)
    const sa = pack({
      lang: 'en',
      cefr: 'c2',
      license: 'CC-BY-SA-4.0 (Octanove)',
      attribution: ['Share-alike'],
    })
    expect(checkPackLicense('en/c2.json', sa)).toBeNull()
  })

  test('DE/ES B2–C2 labelled CC0 fails', () => {
    const de = pack({
      lang: 'de',
      cefr: 'b2',
      license: 'CC0-1.0',
      attribution: ['wordhoard'],
    })
    expect(checkPackLicense('de/b2.json', de)).toMatch(/must not be labelled CC0/)
    const es = pack({
      lang: 'es',
      cefr: 'c2',
      license: 'CC-BY-SA-4.0 (wordhoard-full)',
      attribution: ['frequency-rank bands, not Cervantes'],
    })
    expect(checkPackLicense('es/c2.json', es)).toBeNull()
  })

  test('PT all levels require CC-BY-SA; EN/DE/ES A1–B1 keep CC0', () => {
    const pt = pack({
      lang: 'pt',
      cefr: 'a1',
      license: 'CC-BY-SA-4.0',
      attribution: ['Wiktionary'],
    })
    expect(checkPackLicense('pt/a1.json', pt)).toBeNull()
    const ptBad = pack({
      lang: 'pt',
      cefr: 'c2',
      license: 'CC0-1.0',
      attribution: ['oops'],
    })
    expect(checkPackLicense('pt/c2.json', ptBad)).toMatch(/CC0|CC-BY-SA/)
    const enA1 = pack({
      lang: 'en',
      cefr: 'a1',
      license: 'CC0-1.0',
      attribution: ['curated'],
    })
    expect(checkPackLicense('en/a1.json', enA1)).toBeNull()
  })
})

describe('packs:check completeness', () => {
  test('expected count is 24 once PACK_CEFRS is six levels', () => {
    expect(expectedPackCount()).toBe(24)
  })

  test('fails on stray JSON and wrong file count', () => {
    const errors = checkCompleteness(['en/a1.json', 'notes.json'])
    expect(errors.some((e) => e.includes('stray'))).toBe(true)
    expect(errors.some((e) => e.includes('exactly 24'))).toBe(true)
    expect(errors.some((e) => e.includes('missing'))).toBe(true)
  })
})

describe('packs:check gloss language (ADR 0030)', () => {
  test('rejects English-shaped glosses in DE/ES/PT', () => {
    expect(() =>
      validatePack(
        pack({
          lang: 'de',
          cefr: 'b2',
          lemmas: [{ word: 'LACHEN', gloss: 'to make sounds showing amusement' }],
        }),
        'de/b2.json',
      ),
    ).toThrow(/pack language/)
  })

  test('keeps German learner glosses', () => {
    const p = validatePack(
      pack({
        lang: 'de',
        cefr: 'a1',
        lemmas: [{ word: 'BLEIBEN', gloss: 'An einem Ort verweilen.' }],
      }),
      'de/a1.json',
    )
    expect(p.lemmas[0]?.gloss).toContain('Ort')
  })
})

describe('packs:check C1/C2 synonyms', () => {
  test('warns below 80% but fails only near 0', () => {
    const lemmas = Array.from({ length: 10 }, (_, i) => ({
      word: `W${i}`,
      gloss: 'x',
      ...(i === 0 ? { synonyms: ['alt'] } : {}),
    }))
    const warn = checkSynonymCoverage(
      'en/c1.json',
      pack({ lang: 'en', cefr: 'c1', lemmas }),
    )
    expect(warn.error).toBeNull()
    expect(warn.warn).toMatch(/< 80%/)

    const broken = checkSynonymCoverage(
      'en/c2.json',
      pack({
        lang: 'en',
        cefr: 'c2',
        lemmas: Array.from({ length: 10 }, (_, i) => ({ word: `W${i}`, gloss: 'x' })),
      }),
    )
    expect(broken.error).toMatch(/broken/)
  })
})
