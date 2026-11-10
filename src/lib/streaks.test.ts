import { spawnSync } from 'node:child_process'
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

const EMPTY: StreakState = { count: 0, freezes: 0, lastWinDate: null }

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
      freezes: 0,
      lastWinDate: '2026-09-19',
    })
  })

  test('consecutive local dates increment for the same lang+CEFR', () => {
    let s = nextStreakOnWin(EMPTY, '2026-09-19')
    s = nextStreakOnWin(s, '2026-09-20')
    s = nextStreakOnWin(s, '2026-09-21')
    expect(s).toEqual({ count: 3, freezes: 0, lastWinDate: '2026-09-21' })
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
    expect(wed).toEqual({ count: 1, freezes: 0, lastWinDate: '2026-09-21' })
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
    const wonMon: StreakState = { count: 4, freezes: 0, lastWinDate: '2026-09-19' }
    expect(visibleStreak(wonMon, '2026-09-19')).toBe(4)
    expect(visibleStreak(wonMon, '2026-09-20')).toBe(4)
    expect(applyMidnightBreak(wonMon, '2026-09-20')).toEqual(wonMon)
  })

  test('midnight after a missed day clears the visible streak', () => {
    const wonMon: StreakState = { count: 4, freezes: 0, lastWinDate: '2026-09-19' }
    // Tuesday unused → Wednesday 00:00 local
    expect(visibleStreak(wonMon, '2026-09-21')).toBe(0)
    expect(applyMidnightBreak(wonMon, '2026-09-21')).toEqual({
      count: 0,
      freezes: 0,
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
    expect(stored['de|a2']?.freezes).toBe(0)
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

describe('streak freeze (ADR 0046)', () => {
  let mem: Map<string, string>

  beforeEach(() => {
    mem = installLocalStorageMock()
  })

  afterEach(() => {
    mem.clear()
  })

  function winDays(from: string, days: number): StreakState {
    let state: StreakState = EMPTY
    let key = from
    for (let i = 0; i < days; i++) {
      state = nextStreakOnWin(state, key)
      key = nextLocalDateKey(key)
    }
    return state
  }

  test('a win that lands on 7 or 14 grants one freeze', () => {
    const at7 = winDays('2026-09-01', 7)
    expect(at7.count).toBe(7)
    expect(at7.freezes).toBe(1)
    const at14 = winDays('2026-09-01', 14)
    expect(at14.count).toBe(14)
    expect(at14.freezes).toBe(2)
  })

  test('the 21st win does not raise freezes past 2', () => {
    expect(winDays('2026-09-01', 21).freezes).toBe(2)
  })

  test('same-day re-record does not grant a second freeze', () => {
    const at7 = winDays('2026-09-01', 7)
    expect(nextStreakOnWin(at7, at7.lastWinDate!).freezes).toBe(1)
    recordDailyWin('en', 'a1', '2026-09-01')
    let key = '2026-09-02'
    for (let n = 2; n <= 7; n++) {
      recordDailyWin('en', 'a1', key)
      key = nextLocalDateKey(key)
    }
    const once = getStreak('en', 'a1', '2026-09-07')
    expect(once).toEqual({ count: 7, freezes: 1, lastWinDate: '2026-09-07' })
    expect(recordDailyWin('en', 'a1', '2026-09-07')).toEqual(once)
  })

  test('one missed local day consumes a freeze and keeps the count', () => {
    const won: StreakState = { count: 7, freezes: 1, lastWinDate: '2026-09-07' }
    const today = '2026-09-09'
    const next = applyMidnightBreak(won, today)
    expect(next).toEqual({
      count: 7,
      freezes: 0,
      lastWinDate: previousLocalDateKey(today),
    })
    expect(visibleStreak(next, today)).toBe(7)
    expect(visibleStreak(won, today)).toBe(0)
  })

  test('two missed days break the streak even with a freeze', () => {
    const won: StreakState = { count: 7, freezes: 2, lastWinDate: '2026-09-07' }
    // Opening on the 10th skips both the 8th and the 9th — one freeze cannot cover that.
    const broken = applyMidnightBreak(won, '2026-09-10')
    expect(broken).toEqual({
      count: 0,
      freezes: 2,
      lastWinDate: '2026-09-07',
    })
    expect(visibleStreak(broken, '2026-09-10')).toBe(0)
    // A persisted one-day bridge still dies on the next miss, freeze already spent.
    const bridged = applyMidnightBreak(won, '2026-09-09')
    expect(applyMidnightBreak(bridged, '2026-09-11')).toEqual({
      count: 0,
      freezes: 1,
      lastWinDate: '2026-09-08',
    })
  })

  test('opening the app each day with 2 freezes covers two missed days', () => {
    // Current behaviour: each open rewrites lastWinDate to yesterday, so the
    // next open is again one missed day. Skip a day and both misses arrive
    // together, which still breaks (test above).
    mem.set(
      STREAKS_KEY,
      JSON.stringify({
        'en|a1': { count: 7, freezes: 2, lastWinDate: '2026-09-07' },
      }),
    )
    expect(ensureStreakPersisted('en', 'a1', '2026-09-08')).toEqual({
      count: 7,
      freezes: 2,
      lastWinDate: '2026-09-07',
    })
    expect(ensureStreakPersisted('en', 'a1', '2026-09-09')).toEqual({
      count: 7,
      freezes: 1,
      lastWinDate: '2026-09-08',
    })
    expect(ensureStreakPersisted('en', 'a1', '2026-09-10')).toEqual({
      count: 7,
      freezes: 0,
      lastWinDate: '2026-09-09',
    })
    expect(getStreakCount('en', 'a1', '2026-09-10')).toBe(7)
    expect(getStreakCount('en', 'a1', '2026-09-11')).toBe(0)
  })

  test('a win on the return day spends one freeze and does not grant another', () => {
    mem.set(
      STREAKS_KEY,
      JSON.stringify({
        'en|a1': { count: 7, freezes: 1, lastWinDate: '2026-09-07' },
      }),
    )
    const next = recordDailyWin('en', 'a1', '2026-09-09')
    expect(next).toEqual({ count: 8, freezes: 0, lastWinDate: '2026-09-09' })
    expect(recordDailyWin('en', 'a1', '2026-09-09')).toEqual(next)
  })

  test('no freezes keeps the old midnight clear', () => {
    const won: StreakState = { count: 4, freezes: 0, lastWinDate: '2026-09-19' }
    expect(applyMidnightBreak(won, '2026-09-21')).toEqual({
      count: 0,
      freezes: 0,
      lastWinDate: '2026-09-19',
    })
  })

  test('ensureStreakPersisted writes a freeze consume so the next day can still break', () => {
    mem.set(
      STREAKS_KEY,
      JSON.stringify({
        'en|a1': { count: 7, freezes: 1, lastWinDate: '2026-09-07' },
      }),
    )
    const bridged = ensureStreakPersisted('en', 'a1', '2026-09-09')
    expect(bridged).toEqual({
      count: 7,
      freezes: 0,
      lastWinDate: '2026-09-08',
    })
    expect(getStreakCount('en', 'a1', '2026-09-09')).toBe(7)
    const stored = JSON.parse(mem.get(STREAKS_KEY) ?? '{}') as {
      'en|a1': StreakState
    }
    expect(stored['en|a1']).toEqual(bridged)
    // The bridge day was the grace day. The next local day is a new miss.
    expect(getStreakCount('en', 'a1', '2026-09-10')).toBe(0)
  })

  test('legacy stored state without freezes parses as 0', () => {
    mem.set(
      STREAKS_KEY,
      JSON.stringify({ 'en|a1': { count: 4, lastWinDate: '2026-09-19' } }),
    )
    expect(getStreak('en', 'a1', '2026-09-19')).toEqual({
      count: 4,
      freezes: 0,
      lastWinDate: '2026-09-19',
    })
  })

  test('invalid freezes values clamp or fall back to 0', () => {
    for (const freezes of [1.9, 3, -4, Number.NaN, '2', null, undefined]) {
      mem.set(
        STREAKS_KEY,
        JSON.stringify({
          'en|a1': { count: 4, freezes, lastWinDate: '2026-09-19' },
        }),
      )
      const state = getStreak('en', 'a1', '2026-09-19')
      expect(state.count).toBe(4)
      expect(state.freezes).toBeGreaterThanOrEqual(0)
      expect(state.freezes).toBeLessThanOrEqual(2)
      expect(Number.isInteger(state.freezes)).toBe(true)
      if (freezes === 1.9) expect(state.freezes).toBe(1)
      if (freezes === 3) expect(state.freezes).toBe(2)
      if (freezes === -4 || freezes === '2' || freezes == null || Number.isNaN(freezes)) {
        expect(state.freezes).toBe(0)
      }
    }
  })

  test('a freeze covers one missed local day across a DST switch', () => {
    const script = `
      const { applyMidnightBreak, nextStreakOnWin, visibleStreak } = await import('./src/lib/streaks.ts')
      const { nextLocalDateKey, previousLocalDateKey } = await import('./src/engine/daily.ts')
      const fall = new Date(2026, 9, 24, 0, 30)
      if (fall.getTimezoneOffset() !== -120) {
        throw new Error('expected Europe/Berlin CEST, offset ' + fall.getTimezoneOffset())
      }
      const spring = new Date(2026, 2, 28, 0, 30)
      if (spring.getTimezoneOffset() !== -60) {
        throw new Error('expected Europe/Berlin CET, offset ' + spring.getTimezoneOffset())
      }
      const dayMs = 86_400_000
      for (const [wonOn, missed] of [['2026-10-24', '2026-10-26'], ['2026-03-28', '2026-03-30']]) {
        const state = { count: 7, freezes: 1, lastWinDate: wonOn }
        const next = applyMidnightBreak(state, missed)
        const yesterday = previousLocalDateKey(missed)
        if (next.lastWinDate !== yesterday) throw new Error('lastWin ' + next.lastWinDate)
        if (yesterday !== nextLocalDateKey(wonOn)) throw new Error('bridge ' + yesterday)
        if (next.count !== 7 || next.freezes !== 0) throw new Error('consume ' + JSON.stringify(next))
        if (visibleStreak(next, missed) !== 7) throw new Error('visible after freeze')
        const twoMisses = nextLocalDateKey(missed)
        const skipped = applyMidnightBreak(state, twoMisses)
        if (skipped.count !== 0 || skipped.freezes !== 1) throw new Error('two-day gap spent a freeze')
        const raw = Date.parse(missed + 'T00:00:00') - Date.parse(wonOn + 'T00:00:00')
        if (raw === 2 * dayMs) throw new Error(missed + ' was a flat 48h gap')
      }
      let s = { count: 6, freezes: 0, lastWinDate: '2026-10-24' }
      s = nextStreakOnWin(s, '2026-10-25')
      if (s.count !== 7 || s.freezes !== 1 || s.lastWinDate !== '2026-10-25') {
        throw new Error('earn across fall back ' + JSON.stringify(s))
      }
    `
    const result = spawnSync('bun', ['-e', script], {
      cwd: new URL('../..', import.meta.url).pathname,
      env: { ...process.env, TZ: 'Europe/Berlin' },
      encoding: 'utf8',
    })
    expect(result.status, `${result.stderr ?? ''}${result.stdout ?? ''}`).toBe(0)
  })
})
