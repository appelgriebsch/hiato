import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import {
  DAILY_KEY,
  getDailyRecord,
  isDailyComplete,
  setDailyRecord,
} from './daily-record'

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

describe('daily record (per lang+CEFR)', () => {
  let mem: Map<string, string>

  beforeEach(() => {
    mem = installLocalStorageMock()
  })

  afterEach(() => {
    mem.clear()
  })

  test('round-trips a completed daily', () => {
    setDailyRecord({
      dateKey: '2026-09-19',
      lang: 'en',
      cefr: 'a1',
      word: 'APPLE',
      gloss: 'fruit',
      won: true,
      completed: true,
    })
    expect(getDailyRecord('en', 'a1')).toMatchObject({
      word: 'APPLE',
      won: true,
      completed: true,
    })
    expect(isDailyComplete('en', 'a1', '2026-09-19')).toBe(true)
    expect(isDailyComplete('en', 'a1', '2026-09-20')).toBe(false)
    expect(isDailyComplete('pt', 'a1', '2026-09-19')).toBe(false)
  })

  test('lang+CEFR slots are independent', () => {
    setDailyRecord({
      dateKey: '2026-09-19',
      lang: 'en',
      cefr: 'a1',
      word: 'APPLE',
      won: true,
      completed: true,
    })
    setDailyRecord({
      dateKey: '2026-09-19',
      lang: 'pt',
      cefr: 'a1',
      word: 'CASA',
      won: false,
      completed: true,
    })
    expect(getDailyRecord('en', 'a1')?.word).toBe('APPLE')
    expect(getDailyRecord('pt', 'a1')?.won).toBe(false)
    expect(mem.get(DAILY_KEY)).toContain('APPLE')
  })

  test('keeps up to three synonym strings', () => {
    setDailyRecord({
      dateKey: '2026-09-19',
      lang: 'de',
      cefr: 'a2',
      word: 'HAUS',
      gloss: 'a building',
      synonyms: ['home', '', 'house', 'dwelling', 'extra'],
      won: false,
      completed: true,
    })
    expect(getDailyRecord('de', 'a2')?.synonyms).toEqual([
      'home',
      'house',
      'dwelling',
    ])
  })
})
