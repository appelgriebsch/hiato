import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import {
  applyMidnightBreak,
  ensureStreakPersisted,
  getStreak,
  getStreakCount,
  nextStreakOnWin,
  recordDailyWin,
  STREAKS_KEY,
  visibleStreak,
  type StreakState,
} from './streaks'
import { nextLocalDateKey, previousLocalDateKey } from '../engine'

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

const EMPTY: StreakState = { count: 0, lastWinDate: null }

describe('streak increment / break / midnight (ADR 0003/0004)', () => {
  let mem: Map<string, string>

  beforeEach(() => {
    mem = installLocalStorageMock()
  })

  afterEach(() => {
    mem.clear()
  })

  test('first daily win starts a streak at 1', () => {
    expect(nextStreakOnWin(EMPTY, '2026-09-19')).toEqual({
      count: 1,
      lastWinDate: '2026-09-19',
    })
  })

  test('consecutive local dates increment for the same lang+CEFR', () => {
    let s = nextStreakOnWin(EMPTY, '2026-09-19')
    s = nextStreakOnWin(s, '2026-09-20')
    s = nextStreakOnWin(s, '2026-09-21')
    expect(s).toEqual({ count: 3, lastWinDate: '2026-09-21' })
  })

  test('same lang+CEFR+local date is idempotent', () => {
    const once = nextStreakOnWin(EMPTY, '2026-09-19')
    const twice = nextStreakOnWin(once, '2026-09-19')
    expect(twice).toEqual(once)
    expect(twice.count).toBe(1)
  })

  test('a skipped local day restarts at 1', () => {
    const monday = nextStreakOnWin(EMPTY, '2026-09-19')
    const wed = nextStreakOnWin(monday, '2026-09-21')
    expect(wed).toEqual({ count: 1, lastWinDate: '2026-09-21' })
  })

  test('month and year boundaries still count as consecutive', () => {
    let s = nextStreakOnWin(EMPTY, '2026-01-31')
    s = nextStreakOnWin(s, '2026-02-01')
    expect(s.count).toBe(2)
    s = nextStreakOnWin(EMPTY, '2026-12-31')
    s = nextStreakOnWin(s, '2027-01-01')
    expect(s.count).toBe(2)
  })

  test('visible streak holds through the next local day (grace)', () => {
    const wonMon: StreakState = { count: 4, lastWinDate: '2026-09-19' }
    expect(visibleStreak(wonMon, '2026-09-19')).toBe(4)
    expect(visibleStreak(wonMon, '2026-09-20')).toBe(4)
    expect(applyMidnightBreak(wonMon, '2026-09-20')).toEqual(wonMon)
  })

  test('midnight after a missed day clears the visible streak', () => {
    const wonMon: StreakState = { count: 4, lastWinDate: '2026-09-19' }
    // Tuesday unused → Wednesday 00:00 local
    expect(visibleStreak(wonMon, '2026-09-21')).toBe(0)
    expect(applyMidnightBreak(wonMon, '2026-09-21')).toEqual({
      count: 0,
      lastWinDate: '2026-09-19',
    })
  })

  test('previous/next local date keys are calendar-local', () => {
    expect(previousLocalDateKey('2026-09-19')).toBe('2026-09-18')
    expect(nextLocalDateKey('2026-09-19')).toBe('2026-09-20')
    expect(previousLocalDateKey('2026-03-01')).toBe('2026-02-28')
    expect(nextLocalDateKey('2026-12-31')).toBe('2027-01-01')
  })

  test('recordDailyWin persists per lang+CEFR', () => {
    const en = recordDailyWin('en', 'a1', '2026-09-19')
    expect(en.count).toBe(1)
    const enAgain = recordDailyWin('en', 'a1', '2026-09-19')
    expect(enAgain.count).toBe(1)
    const pt = recordDailyWin('pt', 'a1', '2026-09-19')
    expect(pt.count).toBe(1)
    expect(getStreakCount('en', 'a1', '2026-09-19')).toBe(1)
    expect(getStreakCount('pt', 'a1', '2026-09-19')).toBe(1)
    expect(getStreakCount('en', 'b1', '2026-09-19')).toBe(0)
  })

  test('getStreakCount applies a midnight break in memory without writing', () => {
    recordDailyWin('de', 'a2', '2026-09-19')
    expect(getStreakCount('de', 'a2', '2026-09-20')).toBe(1)
    expect(getStreakCount('de', 'a2', '2026-09-21')).toBe(0)
    const stored = JSON.parse(mem.get(STREAKS_KEY) ?? '{}') as {
      'de|a2': StreakState
    }
    expect(stored['de|a2']?.count).toBe(1)
    expect(stored['de|a2']?.lastWinDate).toBe('2026-09-19')
  })

  test('ensureStreakPersisted writes a midnight break', () => {
    recordDailyWin('de', 'a2', '2026-09-19')
    expect(getStreakCount('de', 'a2', '2026-09-21')).toBe(0)
    const before = JSON.parse(mem.get(STREAKS_KEY) ?? '{}') as {
      'de|a2': StreakState
    }
    expect(before['de|a2']?.count).toBe(1)
    ensureStreakPersisted('de', 'a2', '2026-09-21')
    const stored = JSON.parse(mem.get(STREAKS_KEY) ?? '{}') as {
      'de|a2': StreakState
    }
    expect(stored['de|a2']?.count).toBe(0)
    expect(stored['de|a2']?.lastWinDate).toBe('2026-09-19')
  })

  test('win after a broken streak starts at 1', () => {
    recordDailyWin('es', 'b1', '2026-09-19')
    ensureStreakPersisted('es', 'b1', '2026-09-21')
    const next = recordDailyWin('es', 'b1', '2026-09-21')
    expect(next.count).toBe(1)
    expect(next.lastWinDate).toBe('2026-09-21')
  })

  test('corrupt storage falls back to empty', () => {
    mem.set(STREAKS_KEY, '{not json')
    expect(getStreak('en', 'a1', '2026-09-19')).toEqual(EMPTY)
    mem.set(STREAKS_KEY, JSON.stringify({ 'en|a1': { count: 'nope' } }))
    expect(getStreak('en', 'a1', '2026-09-19')).toEqual(EMPTY)
  })
})
