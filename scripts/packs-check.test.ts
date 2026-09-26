import { describe, expect, test } from 'bun:test'
import path from 'node:path'
import { tmpdir } from 'node:os'
import type { WordPack } from '../src/packs/schema'
import {
  C2_MIN,
  PACK_MIN,
  checkCompleteness,
  checkHintCeiling,
  checkLemmaFloor,
  checkPackLicense,
  checkSynonymCoverage,
  failClosedOnHunspellMiss,
  exclusiveConflicts,
  expectedPackCount,
  requiresCcBySa,
  validatePack,
  buildLemmaEasiestByLang,
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
  test('EN B2 requires CC0 and a CEFR-J / Tono citation, and rejects SA', () => {
    expect(requiresCcBySa('en', 'b2')).toBe(false)
    const enB2 = pack({
      lang: 'en',
      cefr: 'b2',
      license: 'CC0-1.0 (curated learner lemmas; glosses original to Hiato)',
      attribution: ['Cite Tono Lab / CEFR-J'],
    })
    expect(checkPackLicense('en/b2.json', enB2)).toBeNull()
    const sa = pack({
      lang: 'en',
      cefr: 'b2',
      license: 'CC-BY-SA-4.0',
      attribution: ['CEFR-J'],
    })
    expect(checkPackLicense('en/b2.json', sa)).toMatch(/CC-BY-SA/)
    const noCite = pack({
      lang: 'en',
      cefr: 'b2',
      license: 'CC0-1.0',
      attribution: ['curated learner lemmas'],
    })
    expect(checkPackLicense('en/b2.json', noCite)).toMatch(/CEFR-J/)
  })

  test('a Hunspell cache miss fails closed when CI is set', () => {
    expect(failClosedOnHunspellMiss({ CI: 'true' })).toBe(true)
    expect(failClosedOnHunspellMiss({ CI: '1' })).toBe(true)
    expect(failClosedOnHunspellMiss({})).toBe(false)
    expect(failClosedOnHunspellMiss({ CI: 'false' })).toBe(false)
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

describe('packs:check person-name gloss (#24)', () => {
  test('rejects a name-list lemma with a person-name gloss', () => {
    expect(() =>
      validatePack(
        pack({
          lang: 'en',
          cefr: 'b2',
          lemmas: [{ word: 'MARIA', gloss: 'a given name used in English' }],
        }),
        'en/b2.json',
      ),
    ).toThrow(/person-name gloss/)
  })

  test('keeps a name-list lemma with a common-noun gloss', () => {
    const p = validatePack(
      pack({
        lang: 'en',
        cefr: 'a1',
        lemmas: [{ word: 'WILL', gloss: 'a legal document of wishes' }],
      }),
      'en/a1.json',
    )
    expect(p.lemmas[0]?.word).toBe('WILL')
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

describe('packs:check A1–B1 synonym floor (#24)', () => {
  test('fails A1–B1 below 80% chip coverage', () => {
    const lemmas = Array.from({ length: 10 }, (_, i) => ({
      word: `WORD${i}`,
      gloss: 'a sample',
    }))
    const miss = checkSynonymCoverage(
      'en/a1.json',
      pack({ lang: 'en', cefr: 'a1', lemmas }),
    )
    expect(miss.error).toMatch(/below 80%/)
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


describe('packs:check hint ceiling enforcement (#50/#52/#54/#53/#51)', () => {
  test('enforces en/a1–b1; en/b2 with a hard gloss does not error', () => {
    const snapshots = [
      {
        rel: 'en/a1.json',
        pack: pack({
          lang: 'en',
          cefr: 'a1',
          lemmas: [{ word: 'AFRAID', gloss: 'Feeling scared.', synonyms: ['scared'] }],
        }),
      },
      {
        rel: 'en/a2.json',
        pack: pack({
          lang: 'en',
          cefr: 'a2',
          lemmas: [{ word: 'SCARE', gloss: 'to frighten' }],
        }),
      },
      {
        rel: 'en/b1.json',
        pack: pack({
          lang: 'en',
          cefr: 'b1',
          lemmas: [{ word: 'ALARM', gloss: 'a sudden serious warning signal' }],
        }),
      },
      {
        rel: 'en/b2.json',
        pack: pack({
          lang: 'en',
          cefr: 'b2',
          lemmas: [{ word: 'FRIGHTEN', gloss: 'to terrify' }],
        }),
      },
    ]
    const lemmaEasiestByLang = buildLemmaEasiestByLang(snapshots)
    const stemCache = {
      en: new Map([['SCARED', ['SCARE']]]),
      de: new Map(),
      es: new Map(),
      pt: new Map(),
    }
    const enTags = new Map<string, string>([
      ['FRIGHTEN', 'c1'],
      ['TERRIFY', 'c1'],
      ['SUDDEN', 'b2'],
      ['SERIOUS', 'b2'],
      ['WARNING', 'b2'],
      ['SIGNAL', 'b2'],
    ])
    const a1 = checkHintCeiling(
      'en/a1.json',
      snapshots[0]!.pack,
      lemmaEasiestByLang,
      stemCache,
      enTags,
    )
    expect(a1.length).toBeGreaterThan(0)
    expect(a1[0]).toMatch(/hint ceiling/)
    const a2 = checkHintCeiling(
      'en/a2.json',
      snapshots[1]!.pack,
      lemmaEasiestByLang,
      stemCache,
      enTags,
    )
    expect(a2.length).toBeGreaterThan(0)
    expect(a2[0]).toMatch(/hint ceiling/)
    const b1 = checkHintCeiling(
      'en/b1.json',
      snapshots[2]!.pack,
      lemmaEasiestByLang,
      stemCache,
      enTags,
    )
    expect(b1.length).toBeGreaterThan(0)
    expect(b1[0]).toMatch(/hint ceiling/)
    const b2 = checkHintCeiling(
      'en/b2.json',
      snapshots[3]!.pack,
      lemmaEasiestByLang,
      stemCache,
      enTags,
    )
    expect(b2).toEqual([])
  })

  test('enforces de/a1–b1; de/b2 with a hard gloss does not error', () => {
    const snapshots = [
      {
        rel: 'de/a1.json',
        pack: pack({
          lang: 'de',
          cefr: 'a1',
          lemmas: [{ word: 'TISCH', gloss: 'Ein Möbel zum Essen.', synonyms: ['Möbel'] }],
        }),
      },
      {
        rel: 'de/a2.json',
        pack: pack({
          lang: 'de',
          cefr: 'a2',
          lemmas: [{ word: 'SACHE', gloss: 'Ein Gegenstand oder eine Angelegenheit.' }],
        }),
      },
      {
        rel: 'de/b1.json',
        pack: pack({
          lang: 'de',
          cefr: 'b1',
          lemmas: [{ word: 'ERFOLG', gloss: 'Ein Triumph nach Anstrengung.' }],
        }),
      },
      {
        rel: 'de/b2.json',
        pack: pack({
          lang: 'de',
          cefr: 'b2',
          lemmas: [
            { word: 'MÖBEL', gloss: 'x' },
            { word: 'GEGENSTAND', gloss: 'x' },
            { word: 'ANGELEGENHEIT', gloss: 'x' },
            { word: 'TRIUMPH', gloss: 'x' },
            { word: 'ANSTRENGUNG', gloss: 'x' },
          ],
        }),
      },
    ]
    const lemmaEasiestByLang = buildLemmaEasiestByLang(snapshots)
    const stemCache = {
      en: new Map(),
      de: new Map(),
      es: new Map(),
      pt: new Map(),
    }
    const a1 = checkHintCeiling(
      'de/a1.json',
      snapshots[0]!.pack,
      lemmaEasiestByLang,
      stemCache,
      null,
    )
    expect(a1.length).toBeGreaterThan(0)
    expect(a1[0]).toMatch(/hint ceiling/)
    const a2 = checkHintCeiling(
      'de/a2.json',
      snapshots[1]!.pack,
      lemmaEasiestByLang,
      stemCache,
      null,
    )
    expect(a2.length).toBeGreaterThan(0)
    expect(a2[0]).toMatch(/hint ceiling/)
    const b1 = checkHintCeiling(
      'de/b1.json',
      snapshots[2]!.pack,
      lemmaEasiestByLang,
      stemCache,
      null,
    )
    expect(b1.length).toBeGreaterThan(0)
    expect(b1[0]).toMatch(/hint ceiling/)
    const b2 = checkHintCeiling(
      'de/b2.json',
      snapshots[3]!.pack,
      lemmaEasiestByLang,
      stemCache,
      null,
    )
    expect(b2).toEqual([])
  })

  test('enforces pt/a1–b1; pt/b2 with a hard gloss does not error', () => {
    const snapshots = [
      {
        rel: 'pt/a1.json',
        pack: pack({
          lang: 'pt',
          cefr: 'a1',
          lemmas: [{ word: 'CASA', gloss: 'Um conjunto de paredes.', synonyms: ['conjunto'] }],
        }),
      },
      {
        rel: 'pt/a2.json',
        pack: pack({
          lang: 'pt',
          cefr: 'a2',
          lemmas: [{ word: 'IGUAL', gloss: 'Com a mesma qualidade.' }],
        }),
      },
      {
        rel: 'pt/b1.json',
        pack: pack({
          lang: 'pt',
          cefr: 'b1',
          lemmas: [{ word: 'TAREFA', gloss: 'Uma atividade relativa ao trabalho.' }],
        }),
      },
      {
        rel: 'pt/b2.json',
        pack: pack({
          lang: 'pt',
          cefr: 'b2',
          lemmas: [
            { word: 'CONJUNTO', gloss: 'x' },
            { word: 'QUALIDADE', gloss: 'x' },
            { word: 'ATIVIDADE', gloss: 'x' },
            { word: 'RELATIVO', gloss: 'x' },
            { word: 'PAREDES', gloss: 'x' },
          ],
        }),
      },
    ]
    const lemmaEasiestByLang = buildLemmaEasiestByLang(snapshots)
    const stemCache = {
      en: new Map(),
      de: new Map(),
      es: new Map(),
      pt: new Map(),
    }
    const a1 = checkHintCeiling(
      'pt/a1.json',
      snapshots[0]!.pack,
      lemmaEasiestByLang,
      stemCache,
      null,
    )
    expect(a1.length).toBeGreaterThan(0)
    expect(a1[0]).toMatch(/hint ceiling/)
    const a2 = checkHintCeiling(
      'pt/a2.json',
      snapshots[1]!.pack,
      lemmaEasiestByLang,
      stemCache,
      null,
    )
    expect(a2.length).toBeGreaterThan(0)
    expect(a2[0]).toMatch(/hint ceiling/)
    const b1 = checkHintCeiling(
      'pt/b1.json',
      snapshots[2]!.pack,
      lemmaEasiestByLang,
      stemCache,
      null,
    )
    expect(b1.length).toBeGreaterThan(0)
    expect(b1[0]).toMatch(/hint ceiling/)
    const b2 = checkHintCeiling(
      'pt/b2.json',
      snapshots[3]!.pack,
      lemmaEasiestByLang,
      stemCache,
      null,
    )
    expect(b2).toEqual([])
  })


  test('enforces es/a1–b1; es/b2 with a hard gloss does not error', () => {
    const snapshots = [
      {
        rel: 'es/a1.json',
        pack: pack({
          lang: 'es',
          cefr: 'a1',
          lemmas: [{ word: 'CASA', gloss: 'Un edificio donde vive la gente.', synonyms: ['hogar'] }],
        }),
      },
      {
        rel: 'es/a2.json',
        pack: pack({
          lang: 'es',
          cefr: 'a2',
          lemmas: [{ word: 'HOGAR', gloss: 'Un vehículo de la familia.' }],
        }),
      },
      {
        rel: 'es/b1.json',
        pack: pack({
          lang: 'es',
          cefr: 'b1',
          lemmas: [{ word: 'VEHÍCULO', gloss: 'Una prenda para viajar.' }],
        }),
      },
      {
        rel: 'es/b2.json',
        pack: pack({
          lang: 'es',
          cefr: 'b2',
          lemmas: [
            { word: 'EDIFICIO', gloss: 'x' },
            { word: 'VEHÍCULO', gloss: 'x' },
            { word: 'PRENDA', gloss: 'x' },
            { word: 'FAMILIA', gloss: 'x' },
          ],
        }),
      },
    ]
    const lemmaEasiestByLang = buildLemmaEasiestByLang(snapshots)
    const stemCache = {
      en: new Map(),
      de: new Map(),
      es: new Map(),
      pt: new Map(),
    }
    const a1 = checkHintCeiling(
      'es/a1.json',
      snapshots[0]!.pack,
      lemmaEasiestByLang,
      stemCache,
      null,
    )
    expect(a1.length).toBeGreaterThan(0)
    expect(a1[0]).toMatch(/hint ceiling/)
    const a2 = checkHintCeiling(
      'es/a2.json',
      snapshots[1]!.pack,
      lemmaEasiestByLang,
      stemCache,
      null,
    )
    expect(a2.length).toBeGreaterThan(0)
    expect(a2[0]).toMatch(/hint ceiling/)
    const b1 = checkHintCeiling(
      'es/b1.json',
      snapshots[2]!.pack,
      lemmaEasiestByLang,
      stemCache,
      null,
    )
    expect(b1.length).toBeGreaterThan(0)
    expect(b1[0]).toMatch(/hint ceiling/)
    const b2 = checkHintCeiling(
      'es/b2.json',
      snapshots[3]!.pack,
      lemmaEasiestByLang,
      stemCache,
      null,
    )
    expect(b2).toEqual([])
  })

  test('de/b2 gloss with de/c1 lemma does not fail; same gloss fails on a2 (#50)', () => {
    const hardGloss = 'Ein Triumph nach Anstrengung.'
    const snapshots = [
      {
        rel: 'de/a2.json',
        pack: pack({
          lang: 'de',
          cefr: 'a2',
          lemmas: [{ word: 'SACHE', gloss: hardGloss }],
        }),
      },
      {
        rel: 'de/b2.json',
        pack: pack({
          lang: 'de',
          cefr: 'b2',
          lemmas: [{ word: 'ERFOLG', gloss: hardGloss }],
        }),
      },
      {
        rel: 'de/c1.json',
        pack: pack({
          lang: 'de',
          cefr: 'c1',
          lemmas: [
            { word: 'TRIUMPH', gloss: 'x' },
            { word: 'ANSTRENGUNG', gloss: 'x' },
          ],
        }),
      },
    ]
    const lemmaEasiestByLang = buildLemmaEasiestByLang(snapshots)
    const stemCache = {
      en: new Map(),
      de: new Map(),
      es: new Map(),
      pt: new Map(),
    }
    const b2 = checkHintCeiling(
      'de/b2.json',
      snapshots[1]!.pack,
      lemmaEasiestByLang,
      stemCache,
      null,
    )
    expect(b2).toEqual([])
    const a2 = checkHintCeiling(
      'de/a2.json',
      snapshots[0]!.pack,
      lemmaEasiestByLang,
      stemCache,
      null,
    )
    expect(a2.length).toBeGreaterThan(0)
    expect(a2[0]).toMatch(/hint ceiling/)
  })

  test('missing cache path is fail-closed at loader', async () => {
    const { loadEnEasiestCefr } = await import('./hint-ceiling-data')
    const missingPath = path.join(
      tmpdir(),
      `missing-en-easiest-${process.pid}-${Date.now()}.json`,
    )
    expect(() => loadEnEasiestCefr(missingPath)).toThrow(/missing/)
  })
})
