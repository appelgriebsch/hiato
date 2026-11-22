import { describe, expect, test } from 'bun:test'
import {
  BAND_TARGETS,
  CEFR_LEVEL_PARITY,
  DE_ES_BANDS,
  EXISTING_CEFRS,
  LOW_BAND_WINDOWS,
  NEW_CEFRS,
  PACK_TARGET_CAP,
  PT_BANDS,
  assignExclusiveBands,
  assertGrowAppendOnly,
  assertPackWriteAllowed,
  bandTarget,
  bandWindow,
  foldKey,
  hangmanOk,
  loadFoldKeysFromPackLemmas,
  planGrowBand,
  takeExclusive,
} from './pack-select'
import { PACK_CEFR_LEVELS } from '../src/packs/schema'

describe('pack-select CEFR split', () => {
  test('EXISTING_CEFRS are read-only A1–B1; NEW_CEFRS are B2–C2', () => {
    expect(EXISTING_CEFRS).toEqual(['a1', 'a2', 'b1'])
    expect(NEW_CEFRS).toEqual(['b2', 'c1', 'c2'])
    expect(CEFR_LEVEL_PARITY).toBe(true)
    expect([...EXISTING_CEFRS, ...NEW_CEFRS]).toEqual([...PACK_CEFR_LEVELS])
  })

  test('PT windows are the widened ADR 0058 grow windows and stay inside the 50k tail', () => {
    expect(PT_BANDS.b2).toEqual([4000, 9000])
    expect(PT_BANDS.c1).toEqual([9000, 16000])
    expect(PT_BANDS.c2).toEqual([16000, 26000])
    expect(PT_BANDS.c2[1]).toBeLessThan(50000)
  })

  test('DE/ES use the same frequency-rank windows as PT (not cefr_estimate)', () => {
    expect(DE_ES_BANDS).toEqual(PT_BANDS)
  })

  test('grow windows are contiguous and non-overlapping across all six bands', () => {
    expect(LOW_BAND_WINDOWS).toEqual({
      a1: [0, 1500],
      a2: [1500, 3000],
      b1: [3000, 4000],
    })
    for (const prev of ['a1', 'a2', 'b1', 'b2', 'c1'] as const) {
      const next = PACK_CEFR_LEVELS[PACK_CEFR_LEVELS.indexOf(prev) + 1]!
      expect(bandWindow(prev)[1]).toBe(bandWindow(next)[0])
    }
    expect(bandWindow('c2')[1]).toBeLessThan(50000)
  })
})

describe('ADR 0058 band targets', () => {
  test('PACK_TARGET_CAP is 1000; every bandTarget sits in [400, cap]', () => {
    expect(PACK_TARGET_CAP).toBe(1000)
    for (const lang of ['en', 'pt', 'de', 'es', 'fr', 'it'] as const) {
      for (const cefr of PACK_CEFR_LEVELS) {
        const t = bandTarget(lang, cefr)
        expect(t).toBe(BAND_TARGETS[lang][cefr])
        expect(t).toBeGreaterThanOrEqual(400)
        expect(t).toBeLessThanOrEqual(PACK_TARGET_CAP)
      }
    }
  })
})

describe('planGrowBand (ADR 0058 --grow selection)', () => {
  test('append passes: appends exactly room lemmas in candidate order, skipping taken fold-keys', () => {
    const existing = Array.from({ length: 400 }, (_, i) => `OLD${i}`)
    const taken = new Set(existing)
    const candidates = [...existing.slice(0, 10), 'NEWORD', 'BRIDGE', 'WINDOW', 'ORCHARD']
    const plan = planGrowBand('en', 'b2', existing, candidates, taken)
    expect(plan.existing).toBe(400)
    expect(plan.capacity).toBe(4)
    expect(plan.target).toBe(Math.min(400 + 4, PACK_TARGET_CAP))
    expect(plan.room).toBeGreaterThan(0)
    expect(plan.appended).toEqual(
      ['NEWORD', 'BRIDGE', 'WINDOW', 'ORCHARD'].slice(0, plan.room),
    )
    expect(plan.appended.length).toBe(Math.min(plan.room, plan.capacity))
    if (plan.room > 0) expect(taken.has('NEWORD')).toBe(true)
  })

  test('over-cap: room is 0 when the pack already sits at bandTarget', () => {
    const atCap = Array.from({ length: bandTarget('en', 'b2') }, (_, i) => `W${i}`)
    const taken = new Set(atCap)
    const plan = planGrowBand('en', 'b2', atCap, ['NEWORD'], taken)
    expect(plan.room).toBe(0)
    expect(plan.appended).toEqual([])
    expect(plan.target).toBe(Math.min(atCap.length + 1, PACK_TARGET_CAP))
    expect(taken.has('NEWORD')).toBe(false)
  })

  test('fold-key duplicates inside the window count once and prefer the ß form for DE', () => {
    const plan = planGrowBand('de', 'c2', ['HAUS'], ['STRASSE', 'STRAßE', 'WALD'], new Set(['HAUS']))
    expect(plan.capacity).toBe(2)
    expect(plan.appended).toContain('STRAßE')
    expect(plan.appended).not.toContain('STRASSE')
  })
})

describe('assertGrowAppendOnly (ADR 0058 hard refuse)', () => {
  const before = [{ word: 'HOUSE' }, { word: 'WINDOW' }]
  test('an exact prefix plus appends passes', () => {
    expect(() =>
      assertGrowAppendOnly('en/a1.json', before, [...before, { word: 'GARDEN' }]),
    ).not.toThrow()
    expect(() => assertGrowAppendOnly('en/a1.json', before, before)).not.toThrow()
  })
  test('a rewrite of an existing slot fails', () => {
    expect(() =>
      assertGrowAppendOnly('en/a1.json', before, [{ word: 'HOTEL' }, { word: 'WINDOW' }]),
    ).toThrow(/refuses to rewrite slot 0/)
  })
  test('a reorder fails', () => {
    expect(() =>
      assertGrowAppendOnly('en/a1.json', before, [{ word: 'WINDOW' }, { word: 'HOUSE' }]),
    ).toThrow(/slot 0/)
  })
  test('a removal fails', () => {
    expect(() => assertGrowAppendOnly('en/a1.json', before, [before[0]!])).toThrow(/append-only/)
  })
})

describe('hangmanOk + foldKey', () => {
  test('length, charset, and denylist', () => {
    expect(hangmanOk('en', 'window')).toBe('WINDOW')
    expect(hangmanOk('en', 'ok')).toBeNull()
    expect(hangmanOk('en', 'supercalifragilistic')).toBeNull()
    expect(hangmanOk('en', 'mull over')).toBeNull()
    expect(hangmanOk('en', 'self-help')).toBeNull()
    expect(hangmanOk('en', 'KILL', new Set(['KILL']))).toBeNull()
    expect(hangmanOk('de', 'Straße')).toBe('STRAßE')
    expect(hangmanOk('es', 'niño')).toBe('NIÑO')
    expect(hangmanOk('pt', 'maçã')).toBe('MAÇÃ')
    expect(hangmanOk('fr', 'cœur')).toBe('CŒUR')
    expect(hangmanOk('fr', 'jusqu')).toBeNull()
    expect(hangmanOk('fr', 'aujourd’hui')).toBeNull()
    expect(hangmanOk('fr', 'cæcum')).toBeNull()
    expect(hangmanOk('fr', 'où')).toBeNull()
    const deny = new Set(['fr BITE', 'KILL'])
    expect(hangmanOk('en', 'BITE', deny)).toBe('BITE')
    expect(hangmanOk('fr', 'BITE', deny)).toBeNull()
    expect(hangmanOk('fr', 'QUEUE', deny)).toBe('QUEUE')
    expect(hangmanOk('it', 'perché')).toBe('PERCHÉ')
    expect(hangmanOk('it', 'città')).toBe('CITTÀ')
    expect(hangmanOk('it', 'più')).toBe('PIÙ')
    expect(hangmanOk('it', 'così')).toBe('COSÌ')
    expect(hangmanOk('it', 'sí')).toBeNull()
    expect(hangmanOk('it', 'cosí')).toBeNull()
    expect(hangmanOk('it', 'dí')).toBeNull()
    expect(hangmanOk('it', 'piú')).toBeNull()
    expect(hangmanOk('it', 'íl')).toBeNull()
    expect(hangmanOk('it', 'în')).toBeNull()
    expect(hangmanOk('it', 'del')).toBeNull()
    expect(hangmanOk('it', 'glielo')).toBeNull()
    expect(hangmanOk('it', 'collo')).toBe('COLLO')
    expect(hangmanOk('it', 'di il')).toBeNull()
    const itDeny = new Set(['it NEGRO'])
    expect(hangmanOk('it', 'NEGRO', itDeny)).toBeNull()
    expect(hangmanOk('en', 'NEGRO', itDeny)).toBe('NEGRO')
    expect(hangmanOk('es', 'NEGRO', itDeny)).toBe('NEGRO')
  })

  test('DE ß/SS fold collides STRAßE with STRASSE', () => {
    expect(foldKey('de', 'STRAßE')).toBe(foldKey('de', 'STRASSE'))
    expect(foldKey('de', 'straße')).toBe('STRASSE')
    expect(foldKey('en', 'STRAßE')).not.toBe(foldKey('en', 'STRASSE'))
    expect(foldKey('fr', 'ÉVÉNEMENT')).toBe(foldKey('fr', 'ÉVÈNEMENT'))
    expect(foldKey('fr', 'MÛR')).not.toBe(foldKey('fr', 'MUR'))
    expect(foldKey('fr', 'SÛR')).not.toBe(foldKey('fr', 'SUR'))
    expect(foldKey('fr', 'PÊCHE')).not.toBe(foldKey('fr', 'PÉCHÉ'))
  })
})

describe('exclusive assign (ADR 0028)', () => {
  test('fold-keys already in fixture A1–B1 never enter B2–C2', () => {
    const existing = loadFoldKeysFromPackLemmas('en', [
      { lemmas: [{ word: 'HOUSE' }, { word: 'TABLE' }] },
      { lemmas: [{ word: 'WATER' }] },
    ])
    const assigned = assignExclusiveBands('en', existing, {
      b2: ['WINDOW', 'HOUSE', 'GARDEN'],
      c1: ['EPHEMERAL', 'TABLE', 'LUCID'],
      c2: ['QUIXOTIC', 'WATER', 'WINDOW'],
    })
    expect(assigned.b2).toEqual(['WINDOW', 'GARDEN'])
    expect(assigned.c1).toEqual(['EPHEMERAL', 'LUCID'])
    expect(assigned.c2).toEqual(['QUIXOTIC'])
    expect(assigned.b2).not.toContain('HOUSE')
    expect(assigned.c1).not.toContain('TABLE')
    expect(assigned.c2).not.toContain('WATER')
  })

  test('C2 does not consume B1 leftovers or earlier new-band lemmas', () => {
    const b1Leftovers = ['APPLE', 'BREAD', 'CHAIR']
    const assigned = assignExclusiveBands(
      'en',
      loadFoldKeysFromPackLemmas('en', [{ lemmas: b1Leftovers.map((word) => ({ word })) }]),
      {
        b2: ['BRIDGE', 'APPLE'],
        c1: ['CANDID', 'BREAD'],
        c2: ['APPLE', 'BREAD', 'CHAIR', 'BRIDGE', 'CANDID', 'ZENITH'],
      },
    )
    expect(assigned.b2).toEqual(['BRIDGE'])
    expect(assigned.c1).toEqual(['CANDID'])
    expect(assigned.c2).toEqual(['ZENITH'])
    for (const leftover of b1Leftovers) {
      expect(assigned.c2).not.toContain(leftover)
    }
  })

  test('B2 is assigned before C1 before C2 (first band wins the fold-key)', () => {
    const assigned = assignExclusiveBands('en', [], {
      b2: ['ORBIT'],
      c1: ['ORBIT', 'NEBULA'],
      c2: ['ORBIT', 'NEBULA', 'QUASAR'],
    })
    expect(assigned.b2).toEqual(['ORBIT'])
    expect(assigned.c1).toEqual(['NEBULA'])
    expect(assigned.c2).toEqual(['QUASAR'])
  })

  test('DE ß form is excluded when A1–B1 already has SS spelling', () => {
    const existing = loadFoldKeysFromPackLemmas('de', [
      { lemmas: [{ word: 'STRASSE' }] },
    ])
    const assigned = assignExclusiveBands('de', existing, {
      b2: ['STRAßE', 'BAHNHOF'],
      c1: [],
      c2: ['STRASSE', 'STRAßE'],
    })
    expect(assigned.b2).toEqual(['BAHNHOF'])
    expect(assigned.c2).toEqual([])
  })

  test('within-band take prefers ß over SS and does not top up from other bands', () => {
    const taken = new Set<string>()
    const got = takeExclusive('de', ['STRASSE', 'STRAßE', 'WALD'], taken, 400)
    expect(got).toEqual(['STRAßE', 'WALD'])
    expect(taken.has(foldKey('de', 'STRAßE'))).toBe(true)
  })
})

describe('write-guard', () => {
  test('refuses a1/a2/b1.json regardless of intended cefr', () => {
    expect(() => assertPackWriteAllowed('public/packs/en/a1.json', 'a1')).toThrow(
      /refuses to overwrite a1\.json/i,
    )
    expect(() => assertPackWriteAllowed('public/packs/de/a2.json', 'a2')).toThrow(
      /refuses to overwrite/i,
    )
    expect(() => assertPackWriteAllowed('public/packs/pt/b1.json', 'b2')).toThrow(
      /refuses to overwrite b1\.json/i,
    )
  })

  test('allows b2/c1/c2 pack paths', () => {
    expect(() => assertPackWriteAllowed('public/packs/en/b2.json', 'b2')).not.toThrow()
    expect(() => assertPackWriteAllowed('public/packs/es/c1.json', 'c1')).not.toThrow()
    expect(() => assertPackWriteAllowed('public/packs/de/c2.json', 'c2')).not.toThrow()
  })

  test('--grow may write a1–b1 for every language once; other modes still refuse', () => {
    expect(() => assertPackWriteAllowed('public/packs/en/a1.json', 'a1', { grow: true })).not.toThrow()
    expect(() => assertPackWriteAllowed('public/packs/pt/b1.json', 'b1', { grow: true })).not.toThrow()
    expect(() => assertPackWriteAllowed('public/packs/de/a2.json', 'a2', { grow: true })).not.toThrow()
    expect(() => assertPackWriteAllowed('public/packs/es/a1.json', 'a1', { grow: true })).not.toThrow()
    expect(() => assertPackWriteAllowed('public/packs/fr/a1.json', 'a1', { grow: true })).not.toThrow()
    expect(() => assertPackWriteAllowed('public/packs/it/b1.json', 'b1', { grow: true })).not.toThrow()
    expect(() => assertPackWriteAllowed('public/packs/en/b2.json', 'b2', { grow: true })).not.toThrow()
    expect(() => assertPackWriteAllowed('public/packs/en/a1.json', 'a1')).toThrow(/refuses to overwrite/)
    expect(() => assertPackWriteAllowed('public/packs/en/a1.json', 'a1', { grow: false })).toThrow(
      /refuses to overwrite/,
    )
    expect(() => assertPackWriteAllowed('public/packs/en/x9.json', 'x9', { grow: true })).toThrow(
      /expand writes only/,
    )
    expect(() => assertPackWriteAllowed('public/packs/en/b2.json', 'a1', { grow: true })).toThrow(
      /refuses to overwrite/,
    )
  })

  test('fr/it bootstrap may create missing a1–b1 once; other langs stay frozen', () => {
    expect(() =>
      assertPackWriteAllowed('public/packs/fr/a1.json', 'a1', { bootstrapLang: 'fr' }),
    ).not.toThrow()
    expect(() =>
      assertPackWriteAllowed('public/packs/fr/b1.json', 'b1', { bootstrapLang: 'fr' }),
    ).not.toThrow()
    expect(() =>
      assertPackWriteAllowed('public/packs/it/a1.json', 'a1', { bootstrapLang: 'it' }),
    ).not.toThrow()
    expect(() =>
      assertPackWriteAllowed('public/packs/it/b1.json', 'b1', { bootstrapLang: 'fr' }),
    ).toThrow(/refuses to overwrite/i)
    expect(() =>
      assertPackWriteAllowed('public/packs/en/a1.json', 'a1', { bootstrapLang: 'fr' }),
    ).toThrow(/refuses to overwrite/i)
    expect(() => assertPackWriteAllowed('public/packs/fr/a1.json', 'a1')).toThrow(
      /refuses to overwrite/i,
    )
    expect(() => assertPackWriteAllowed('public/packs/it/a1.json', 'a1')).toThrow(
      /refuses to overwrite/i,
    )
  })
})
