import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import {
  hasDailyFor,
  hasHistory,
  hasPrefillRecorded,
  HISTORY_KEY,
  HISTORY_LIMIT,
  historySlot,
  listHistory,
  markPrefillRecorded,
  PREFILL_RECORDED_KEY,
  recordResult,
  recordRoundFor,
  statsFor,
  type HistoryEntry,
} from './history'

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

function entry(partial: Partial<HistoryEntry> = {}): HistoryEntry {
  return { dateKey: '2026-11-11', won: true, livesLeft: 6, mode: 'daily', ...partial }
}

describe('history ring buffer (ADR 0045)', () => {
  let mem: Map<string, string>

  beforeEach(() => {
    mem = installLocalStorageMock()
  })

  afterEach(() => {
    mem.clear()
  })

  test('empty storage parses to no history and zeroed stats', () => {
    expect(hasHistory(SLOT)).toBe(false)
    expect(listHistory(SLOT)).toEqual([])
    expect(statsFor(SLOT)).toEqual({
      played: 0,
      wins: 0,
      winRate: 0,
      avgLivesLeftOnWins: null,
      rows: { '6': 0, '5': 0, '4': 0, '3': 0, '2': 0, '1': 0, lost: 0 },
    })
  })

  test('junk JSON and wrong shape parse to empty', () => {
    mem.set(HISTORY_KEY, 'not json{')
    expect(hasHistory(SLOT)).toBe(false)
    mem.set(HISTORY_KEY, JSON.stringify({ v: 2, slots: { [SLOT]: [entry()] } }))
    expect(hasHistory(SLOT)).toBe(false)
    mem.set(HISTORY_KEY, JSON.stringify([entry()]))
    expect(hasHistory(SLOT)).toBe(false)
    mem.set(
      HISTORY_KEY,
      JSON.stringify({
        v: 1,
        slots: {
          [SLOT]: [
            { dateKey: 'yesterday', won: true, livesLeft: 6, mode: 'daily' },
            { dateKey: '2026-11-11', won: 'yes', livesLeft: 6, mode: 'daily' },
            { dateKey: '2026-11-11', won: true, livesLeft: 9, mode: 'daily' },
            { dateKey: '2026-11-11', won: false, livesLeft: 0, mode: 'pocket' },
            'junk',
            entry(),
          ],
        },
      }),
    )
    // Only the valid daily entry survives validation.
    expect(listHistory(SLOT)).toHaveLength(1)
  })

  test('recordResult appends per slot and evicts the oldest past 50', () => {
    for (let i = 0; i < HISTORY_LIMIT + 10; i++) {
      recordResult(SLOT, entry({ dateKey: `2026-01-${String((i % 28) + 1).padStart(2, '0')}`, livesLeft: (i % 6) + 1 }))
    }
    const all = listHistory(SLOT)
    expect(all).toHaveLength(HISTORY_LIMIT)
    // Oldest 10 evicted: first kept entry is i=10.
    expect(all[0]!.livesLeft).toBe((10 % 6) + 1)
    expect(all[HISTORY_LIMIT - 1]!.livesLeft).toBe(((HISTORY_LIMIT + 9) % 6) + 1)
    // Other slots are untouched.
    expect(hasHistory(historySlot('en', 'a1'))).toBe(false)
  })

  test('hasDailyFor dedupes a daily per dateKey but not practice', () => {
    recordResult(SLOT, entry({ mode: 'daily', dateKey: '2026-11-11' }))
    expect(hasDailyFor(SLOT, '2026-11-11')).toBe(true)
    expect(hasDailyFor(SLOT, '2026-11-12')).toBe(false)
    recordResult(SLOT, entry({ mode: 'practice', dateKey: '2026-11-11' }))
    expect(listHistory(SLOT)).toHaveLength(2)
    expect(hasDailyFor(SLOT, '2026-11-11')).toBe(true)
  })

  test('prefill win records as a win with 6 lives left', () => {
    recordResult(SLOT, entry({ won: true, livesLeft: 6, mode: 'daily' }))
    const stats = statsFor(SLOT)
    expect(stats.wins).toBe(1)
    expect(stats.winRate).toBe(100)
    expect(stats.avgLivesLeftOnWins).toBe(6)
    expect(stats.rows['6']).toBe(1)
    expect(stats.rows.lost).toBe(0)
  })

  test('practice reveal records as a loss and counts in the Lost row', () => {
    recordResult(SLOT, entry({ won: false, livesLeft: 4, mode: 'practice' }))
    const stats = statsFor(SLOT)
    expect(stats.played).toBe(1)
    expect(stats.wins).toBe(0)
    expect(stats.winRate).toBe(0)
    expect(stats.avgLivesLeftOnWins).toBeNull()
    expect(stats.rows.lost).toBe(1)
    expect(stats.rows['4']).toBe(0)
  })

  test('aggregate math: win rate rounding, average, grid rows', () => {
    // 16 wins / 24 played -> 67% (Math.round), avg lives on wins 4.125 -> shown rounded by caller
    for (let i = 0; i < 16; i++) {
      recordResult(SLOT, entry({ won: true, livesLeft: 4, mode: 'practice', dateKey: `2026-10-${String((i % 28) + 1).padStart(2, '0')}` }))
    }
    recordResult(SLOT, entry({ won: true, livesLeft: 5, mode: 'daily' }))
    for (let i = 0; i < 7; i++) {
      recordResult(SLOT, entry({ won: false, livesLeft: 0, mode: 'daily', dateKey: `2026-09-${String((i % 28) + 1).padStart(2, '0')}` }))
    }
    const stats = statsFor(SLOT)
    expect(stats.played).toBe(24)
    expect(stats.wins).toBe(17)
    expect(stats.winRate).toBe(71) // 17/24 = 70.83 -> 71
    expect(stats.avgLivesLeftOnWins).toBeCloseTo((16 * 4 + 5) / 17)
    expect(stats.rows['4']).toBe(16)
    expect(stats.rows['5']).toBe(1)
    expect(stats.rows.lost).toBe(7)
  })

  test('0 wins yields null average, never NaN, and 0% win rate', () => {
    recordResult(SLOT, entry({ won: false, livesLeft: 0, mode: 'daily' }))
    recordResult(SLOT, entry({ won: false, livesLeft: 2, mode: 'practice' }))
    const stats = statsFor(SLOT)
    expect(stats.winRate).toBe(0)
    expect(stats.avgLivesLeftOnWins).toBeNull()
    expect(Number.isNaN(stats.avgLivesLeftOnWins ?? 0)).toBe(false)
    expect(stats.rows.lost).toBe(2)
  })

  test('single win edge: 100%, n.0 average, one row, Lost 0', () => {
    recordResult(SLOT, entry({ won: true, livesLeft: 3, mode: 'practice' }))
    const stats = statsFor(SLOT)
    expect(stats.winRate).toBe(100)
    expect(stats.avgLivesLeftOnWins).toBe(3)
    expect(stats.rows['3']).toBe(1)
    expect(stats.rows.lost).toBe(0)
  })
})

describe('recordRoundFor mode guard', () => {
  let mem: Map<string, string>

  beforeEach(() => {
    mem = installLocalStorageMock()
  })

  afterEach(() => {
    mem.clear()
  })

  test('a Pocket round writes nothing', () => {
    const wrote = recordRoundFor(SLOT, 'pocket', {
      dateKey: '2026-11-11',
      won: true,
      livesLeft: 6,
    })
    expect(wrote).toBe(false)
    expect(listHistory(SLOT)).toEqual([])
    expect(hasHistory(SLOT)).toBe(false)
  })

  test('Daily and Practice each write one entry', () => {
    const daily = recordRoundFor(SLOT, 'daily', {
      dateKey: '2026-11-11',
      won: true,
      livesLeft: 6,
    })
    const practice = recordRoundFor(SLOT, 'practice', {
      dateKey: '2026-11-11',
      won: false,
      livesLeft: 0,
    })
    expect(daily).toBe(true)
    expect(practice).toBe(true)
    const all = listHistory(SLOT)
    expect(all).toHaveLength(2)
    expect(all[0]).toEqual({ dateKey: '2026-11-11', won: true, livesLeft: 6, mode: 'daily' })
    expect(all[1]).toEqual({ dateKey: '2026-11-11', won: false, livesLeft: 0, mode: 'practice' })
  })

  test('a second Daily for the same dateKey is not double-counted', () => {
    expect(
      recordRoundFor(SLOT, 'daily', { dateKey: '2026-11-11', won: true, livesLeft: 6 }),
    ).toBe(true)
    expect(
      recordRoundFor(SLOT, 'daily', { dateKey: '2026-11-11', won: false, livesLeft: 0 }),
    ).toBe(false)
    expect(
      recordRoundFor(SLOT, 'daily', { dateKey: '2026-11-12', won: true, livesLeft: 5 }),
    ).toBe(true)
    expect(listHistory(SLOT)).toHaveLength(2)
  })
})

describe('prefill reload marker', () => {
  let mem: Map<string, string>
  let sessionMem: Map<string, string>

  function installSessionStorageMock() {
    const store = new Map<string, string>()
    Object.defineProperty(globalThis, 'sessionStorage', {
      configurable: true,
      writable: true,
      value: {
        getItem: (k: string) => store.get(k) ?? null,
        setItem: (k: string, v: string) => {
          store.set(k, v)
        },
        removeItem: (k: string) => {
          store.delete(k)
        },
        clear: () => {
          store.clear()
        },
      },
    })
    return store
  }

  beforeEach(() => {
    mem = installLocalStorageMock()
    sessionMem = installSessionStorageMock()
  })

  afterEach(() => {
    mem.clear()
    sessionMem.clear()
  })

  test('unmarked prefill records; a marked one (same-tab reload) does not', () => {
    expect(hasPrefillRecorded(SLOT, 15, '2026-11-11')).toBe(false)
    expect(markPrefillRecorded(SLOT, 15, '2026-11-11')).toBe(true)
    expect(hasPrefillRecorded(SLOT, 15, '2026-11-11')).toBe(true)
  })

  test('a different seed, dateKey or slot is a new marker', () => {
    markPrefillRecorded(SLOT, 15, '2026-11-11')
    expect(hasPrefillRecorded(SLOT, 16, '2026-11-11')).toBe(false)
    expect(hasPrefillRecorded(SLOT, 15, '2026-11-12')).toBe(false)
    expect(hasPrefillRecorded(historySlot('fr', 'a1'), 15, '2026-11-11')).toBe(false)
  })

  test('marker keys are namespaced under the prefill key', () => {
    markPrefillRecorded(SLOT, 15, '2026-11-11')
    const keys = [...sessionMem.keys()]
    expect(keys).toHaveLength(1)
    expect(keys[0]!.startsWith(`${PREFILL_RECORDED_KEY}|`)).toBe(true)
  })

  test('without sessionStorage the marker degrades to not-recorded', () => {
    delete (globalThis as Record<string, unknown>).sessionStorage
    expect(hasPrefillRecorded(SLOT, 15, '2026-11-11')).toBe(false)
    expect(markPrefillRecorded(SLOT, 15, '2026-11-11')).toBe(false)
  })
})
