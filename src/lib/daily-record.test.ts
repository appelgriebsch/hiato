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

  test('round-trips the EndCard example sentence (#246)', () => {
    setDailyRecord({
      dateKey: '2026-09-19',
      lang: 'en',
      cefr: 'a1',
      word: 'HOUSE',
      gloss: 'a building to live in',
      example: 'We live in a small house.',
      won: true,
      completed: true,
    })
    expect(getDailyRecord('en', 'a1')?.example).toBe('We live in a small house.')
  })

  test('drops a missing or empty example', () => {
    setDailyRecord({
      dateKey: '2026-09-19',
      lang: 'en',
      cefr: 'a1',
      word: 'HOUSE',
      example: '',
      won: true,
      completed: true,
    })
    expect(getDailyRecord('en', 'a1')?.example).toBeUndefined()
  })

  test('round-trips the ADR 0055 extras (pos/ipa/family) for the replay EndCard', () => {
    setDailyRecord({
      dateKey: '2026-09-19',
      lang: 'pt',
      cefr: 'a2',
      word: 'CARTÃO',
      gloss: 'peça retangular de plástico',
      pos: 'noun',
      ipa: '/kaʁˈtɐ̃w̃/',
      family: ['cartões', 'carteiro'],
      won: true,
      completed: true,
    })
    expect(getDailyRecord('pt', 'a2')).toMatchObject({
      pos: 'noun',
      ipa: '/kaʁˈtɐ̃w̃/',
      family: ['cartões', 'carteiro'],
    })
  })

  test('stale record without the extras still parses (no migration)', () => {
    mem.set(
      DAILY_KEY,
      JSON.stringify({
        'en|a1': {
          dateKey: '2026-09-19',
          lang: 'en',
          cefr: 'a1',
          word: 'APPLE',
          won: true,
          completed: true,
        },
      }),
    )
    const rec = getDailyRecord('en', 'a1')
    expect(rec?.word).toBe('APPLE')
    expect(rec?.pos).toBeUndefined()
    expect(rec?.ipa).toBeUndefined()
    expect(rec?.family).toBeUndefined()
  })

  test('tolerant parsing drops an invalid pos, empty ipa, and caps family at 3', () => {
    mem.set(
      DAILY_KEY,
      JSON.stringify({
        'de|a2': {
          dateKey: '2026-09-19',
          lang: 'de',
          cefr: 'a2',
          word: 'HAUS',
          pos: 'pronoun',
          ipa: '   ',
          family: ['Häuser', 'haus', 'Hausbau', 'extra'],
          won: false,
          completed: true,
        },
      }),
    )
    const rec = getDailyRecord('de', 'a2')
    expect(rec?.word).toBe('HAUS')
    expect(rec?.pos).toBeUndefined()
    expect(rec?.ipa).toBeUndefined()
    expect(rec?.family).toEqual(['Häuser', 'haus', 'Hausbau'])
  })
})
