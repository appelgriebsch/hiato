import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import {
  LEARNED_KEY,
  LEARNED_READ_CAP,
  learnedCount,
  listLearned,
  recordLearned,
} from './learned'
import { historySlot } from './history'

function installLocalStorageMock() {
  const mem = new Map<string, string>()
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    writable: true,
    value: {
      getItem: (k: string) => mem.get(k) ?? null,
      setItem: (k: string, v: string) => {
        mem.set(k, v)
      },
      removeItem: (k: string) => {
        mem.delete(k)
      },
      clear: () => {
        mem.clear()
      },
    },
  })
  return mem
}

const SLOT = historySlot('pt', 'a2')

describe('learned words (ADR 0054)', () => {
  let mem: Map<string, string>

  beforeEach(() => {
    mem = installLocalStorageMock()
  })

  afterEach(() => {
    mem.clear()
  })

  test('empty storage parses to no words', () => {
    expect(listLearned(SLOT)).toEqual([])
    expect(learnedCount(SLOT)).toBe(0)
  })

  test('junk JSON and wrong shape parse to empty', () => {
    mem.set(LEARNED_KEY, 'not json{')
    expect(learnedCount(SLOT)).toBe(0)
    mem.set(LEARNED_KEY, JSON.stringify({ v: 2, slots: { [SLOT]: ['MANGO'] } }))
    expect(learnedCount(SLOT)).toBe(0)
    mem.set(LEARNED_KEY, JSON.stringify(['MANGO']))
    expect(learnedCount(SLOT)).toBe(0)
    mem.set(
      LEARNED_KEY,
      JSON.stringify({
        v: 1,
        slots: {
          [SLOT]: ['MANGO', 42, '', 'x'.repeat(101), 'MANGO', 'MAÇÃ', { word: 'x' }, null],
        },
      }),
    )
    expect(listLearned(SLOT)).toEqual(['MANGO', 'MAÇÃ'])
  })

  test('recordLearned dedupes by lemma identity (case and NFC)', () => {
    recordLearned(SLOT, 'Mango')
    recordLearned(SLOT, 'MANGO')
    recordLearned(SLOT, 'mango')
    recordLearned(SLOT, 'café')
    recordLearned(SLOT, 'cafe\u0301')
    expect(learnedCount(SLOT)).toBe(2)
    expect(listLearned(SLOT)).toEqual(['MANGO', 'CAFÉ'])
  })

  test('recordLearned is per slot and returns the slot after the write', () => {
    const next = recordLearned(SLOT, 'Mango')
    expect(next).toEqual(['MANGO'])
    expect(learnedCount(SLOT)).toBe(1)
    expect(learnedCount(historySlot('en', 'a1'))).toBe(0)
    // Already learned: no write, same list back.
    expect(recordLearned(SLOT, 'MANGO')).toEqual(['MANGO'])
    expect(learnedCount(SLOT)).toBe(1)
  })

  test('an empty word records nothing', () => {
    expect(recordLearned(SLOT, '')).toEqual([])
    expect(learnedCount(SLOT)).toBe(0)
    expect(mem.has(LEARNED_KEY)).toBe(false)
  })

  test('read caps a hand-edited oversized slot', () => {
    const words = Array.from({ length: LEARNED_READ_CAP + 100 }, (_, i) => `W${i}`)
    mem.set(LEARNED_KEY, JSON.stringify({ v: 1, slots: { [SLOT]: words } }))
    expect(learnedCount(SLOT)).toBe(LEARNED_READ_CAP)
    expect(listLearned(SLOT)[0]).toBe('W0')
  })

  test('a failing write does not crash and returns the current list', () => {
    recordLearned(SLOT, 'Mango')
    const realSet = localStorage.setItem.bind(localStorage)
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      writable: true,
      value: {
        getItem: (k: string) => mem.get(k) ?? null,
        setItem: () => {
          throw new Error('quota')
        },
        removeItem: (k: string) => {
          mem.delete(k)
        },
        clear: () => {
          mem.clear()
        },
      },
    })
    expect(recordLearned(SLOT, 'Pera')).toEqual(['MANGO', 'PERA'])
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      writable: true,
      value: {
        getItem: (k: string) => mem.get(k) ?? null,
        setItem: realSet,
        removeItem: (k: string) => {
          mem.delete(k)
        },
        clear: () => {
          mem.clear()
        },
      },
    })
    // The failed write did not persist.
    expect(learnedCount(SLOT)).toBe(1)
  })
})
