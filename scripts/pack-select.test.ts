import { describe, expect, test } from 'bun:test'
import {
  CEFR_LEVEL_PARITY,
  EXISTING_CEFRS,
  NEW_CEFRS,
  PT_BANDS,
  assignExclusiveBands,
  assertPackWriteAllowed,
  foldKey,
  hangmanOk,
  loadFoldKeysFromPackLemmas,
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

  test('PT windows sit after current B1 slice and do not leak the 50k tail into C2', () => {
    expect(PT_BANDS.b2).toEqual([4000, 7000])
    expect(PT_BANDS.c1).toEqual([7000, 11000])
    expect(PT_BANDS.c2).toEqual([11000, 16000])
    expect(PT_BANDS.c2[1]).toBeLessThan(50000)
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
  })

  test('DE ß/SS fold collides STRAßE with STRASSE', () => {
    expect(foldKey('de', 'STRAßE')).toBe(foldKey('de', 'STRASSE'))
    expect(foldKey('de', 'straße')).toBe('STRASSE')
    expect(foldKey('en', 'STRAßE')).not.toBe(foldKey('en', 'STRASSE'))
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
})
