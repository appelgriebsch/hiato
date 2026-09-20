import { localDateKey, previousLocalDateKey } from '../engine'
import type { PackCefr, PackLang } from '../packs/schema'

/**
 * Streak persistence (ADR 0003/0004).
 * v1 uses localStorage — same as prefs / pack cache. IndexedDB is allowed
 * by the ADR but not required; one store keeps offline reads synchronous.
 *
 * Streaks are per lang+CEFR. A daily *win* for that combo on the local
 * calendar date increments; practice never calls {@link recordDailyWin}.
 * After a missed local day the count clears at the following midnight.
 */

export const STREAKS_KEY = 'hiato.streaks'

export type StreakState = {
  count: number
  lastWinDate: string | null
}

export type StreakMap = Record<string, StreakState>

export function streakSlot(lang: PackLang, cefr: PackCefr): string {
  return `${lang}|${cefr}`
}

const EMPTY: StreakState = { count: 0, lastWinDate: null }

function isDateKey(v: unknown): v is string {
  return typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)
}

function parseState(raw: unknown): StreakState | null {
  if (!raw || typeof raw !== 'object') return null
  const o = raw as Record<string, unknown>
  if (typeof o.count !== 'number' || !Number.isFinite(o.count) || o.count < 0) {
    return null
  }
  const lastWinDate =
    o.lastWinDate === null || o.lastWinDate === undefined
      ? null
      : isDateKey(o.lastWinDate)
        ? o.lastWinDate
        : null
  if (o.lastWinDate != null && lastWinDate === null) return null
  return { count: Math.floor(o.count), lastWinDate }
}

function readMap(): StreakMap {
  try {
    const raw = localStorage.getItem(STREAKS_KEY)
    if (!raw) return {}
    const parsed: unknown = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    const out: StreakMap = {}
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
      const state = parseState(v)
      if (state) out[k] = state
    }
    return out
  } catch {
    return {}
  }
}

function writeMap(map: StreakMap): void {
  try {
    localStorage.setItem(STREAKS_KEY, JSON.stringify(map))
  } catch {
    // quota / private mode — in-memory callers still have the returned state
  }
}

function readSlot(lang: PackLang, cefr: PackCefr): StreakState {
  return readMap()[streakSlot(lang, cefr)] ?? EMPTY
}

function writeSlot(lang: PackLang, cefr: PackCefr, state: StreakState): void {
  const map = readMap()
  map[streakSlot(lang, cefr)] = state
  writeMap(map)
}

/**
 * Count shown in the chip. Still live if last win was today or yesterday;
 * 0 once a full local day was missed (the midnight after the grace day).
 */
export function visibleStreak(state: StreakState, today: string): number {
  if (!state.lastWinDate || state.count <= 0) return 0
  if (state.lastWinDate === today) return state.count
  if (state.lastWinDate === previousLocalDateKey(today)) return state.count
  return 0
}

/** Zero the stored count when the local-midnight grace day has passed. */
export function applyMidnightBreak(
  state: StreakState,
  today: string,
): StreakState {
  if (visibleStreak(state, today) > 0) return state
  if (state.count === 0) return state
  return { count: 0, lastWinDate: state.lastWinDate }
}

/**
 * Pure next state after a daily win on `dateKey`.
 * Same local date is idempotent (one increment per lang+CEFR+date).
 * Consecutive yesterday → +1; any gap → restart at 1.
 */
export function nextStreakOnWin(
  state: StreakState,
  dateKey: string,
): StreakState {
  if (state.lastWinDate === dateKey) return state
  const yesterday = previousLocalDateKey(dateKey)
  return {
    count: state.lastWinDate === yesterday ? state.count + 1 : 1,
    lastWinDate: dateKey,
  }
}

/** Stored streak after applying a midnight break (persists the clear). */
export function getStreak(
  lang: PackLang,
  cefr: PackCefr,
  today: string = localDateKey(),
): StreakState {
  const stored = readSlot(lang, cefr)
  const next = applyMidnightBreak(stored, today)
  if (next.count !== stored.count) writeSlot(lang, cefr, next)
  return next
}

export function getStreakCount(
  lang: PackLang,
  cefr: PackCefr,
  today: string = localDateKey(),
): number {
  return visibleStreak(getStreak(lang, cefr, today), today)
}

/**
 * Increment on a daily win for `lang`+`cefr`+`dateKey`. No-op if that
 * daily was already counted. Practice must not call this.
 */
export function recordDailyWin(
  lang: PackLang,
  cefr: PackCefr,
  dateKey: string,
): StreakState {
  const current = getStreak(lang, cefr, dateKey)
  const next = nextStreakOnWin(current, dateKey)
  writeSlot(lang, cefr, next)
  return next
}
