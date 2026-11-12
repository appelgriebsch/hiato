import { TOTAL_LIVES } from '../engine'
import type { PackCefr, PackLang } from '../packs/schema'

/**
 * Round history ring buffer (ADR 0045, amended in #240/#221).
 * Guest-local localStorage, same pattern as streaks / daily-record.
 *
 * Shape: { v: 1, slots: { 'lang|cefr': Entry[] } }, at most
 * HISTORY_LIMIT entries per slot, oldest evicted. Daily and Practice
 * rounds only — Pocket rounds are never recorded (a retry would count a
 * word twice). History never touches streaks, freezes, the Pocket ladder
 * or analytics.
 */

export const HISTORY_KEY = 'hiato.history'
export const HISTORY_LIMIT = 50
export const PREFILL_RECORDED_KEY = 'hiato.prefillRecorded'

export type HistoryMode = 'daily' | 'practice'

export type HistoryEntry = {
  dateKey: string
  won: boolean
  livesLeft: number
  mode: HistoryMode
}

export type SlotStats = {
  played: number
  wins: number
  /** Integer percent, Math.round(wins / played * 100). */
  winRate: number
  /** Mean livesLeft over wins, or null when there are no wins (never NaN). */
  avgLivesLeftOnWins: number | null
  /** Win counts by lives left 6..1 plus the lost row. */
  rows: Record<'6' | '5' | '4' | '3' | '2' | '1' | 'lost', number>
}

type HistoryFile = { v: 1; slots: Record<string, HistoryEntry[]> }

export function historySlot(lang: PackLang, cefr: PackCefr): string {
  return `${lang}|${cefr}`
}

function isDateKey(v: unknown): v is string {
  return typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)
}

function parseEntry(raw: unknown): HistoryEntry | null {
  if (!raw || typeof raw !== 'object') return null
  const o = raw as Record<string, unknown>
  if (!isDateKey(o.dateKey)) return null
  if (typeof o.won !== 'boolean') return null
  if (
    typeof o.livesLeft !== 'number' ||
    !Number.isInteger(o.livesLeft) ||
    o.livesLeft < 0 ||
    o.livesLeft > TOTAL_LIVES
  ) {
    return null
  }
  if (o.mode !== 'daily' && o.mode !== 'practice') return null
  return { dateKey: o.dateKey, won: o.won, livesLeft: o.livesLeft, mode: o.mode }
}

/** Junk or a wrong version parses to an empty file. */
function parseFile(raw: unknown): HistoryFile {
  const empty: HistoryFile = { v: 1, slots: {} }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return empty
  const o = raw as Record<string, unknown>
  if (o.v !== 1 || !o.slots || typeof o.slots !== 'object' || Array.isArray(o.slots)) {
    return empty
  }
  const out: HistoryFile = { v: 1, slots: {} }
  for (const [slot, list] of Object.entries(o.slots as Record<string, unknown>)) {
    if (!Array.isArray(list)) continue
    const entries: HistoryEntry[] = []
    for (const item of list) {
      const entry = parseEntry(item)
      if (entry) entries.push(entry)
    }
    // Cap on read too, so a hand-edited oversized slot still aggregates bounded.
    out.slots[slot] = entries.slice(-HISTORY_LIMIT)
  }
  return out
}

function readFile(): HistoryFile {
  try {
    const raw = localStorage.getItem(HISTORY_KEY)
    if (!raw) return { v: 1, slots: {} }
    return parseFile(JSON.parse(raw))
  } catch {
    return { v: 1, slots: {} }
  }
}

function writeFile(file: HistoryFile): void {
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(file))
  } catch {
    // quota / private mode — in-memory callers still have the returned entries
  }
}

export function listHistory(slot: string): HistoryEntry[] {
  return readFile().slots[slot] ?? []
}

export function hasHistory(slot: string): boolean {
  return listHistory(slot).length > 0
}

/** True when this slot already has a Daily entry for `dateKey` (dedupe). */
export function hasDailyFor(slot: string, dateKey: string): boolean {
  return listHistory(slot).some((e) => e.mode === 'daily' && e.dateKey === dateKey)
}

/**
 * Append one round result to the slot, evicting the oldest past
 * HISTORY_LIMIT. Returns the slot entries after the write.
 */
export function recordResult(slot: string, entry: HistoryEntry): HistoryEntry[] {
  const file = readFile()
  const next = [...(file.slots[slot] ?? []), entry].slice(-HISTORY_LIMIT)
  file.slots[slot] = next
  writeFile(file)
  return next
}

export function recordRoundFor(
  slot: string,
  mode: string,
  entry: Omit<HistoryEntry, 'mode'>,
): boolean {
  if (mode !== 'daily' && mode !== 'practice') return false
  if (mode === 'daily' && hasDailyFor(slot, entry.dateKey)) return false
  recordResult(slot, { ...entry, mode })
  return true
}

function prefillMarkerKey(slot: string, seed: number, dateKey: string): string {
  return `${PREFILL_RECORDED_KEY}|${slot}|${seed}|${dateKey}`
}

export function hasPrefillRecorded(slot: string, seed: number, dateKey: string): boolean {
  try {
    return sessionStorage.getItem(prefillMarkerKey(slot, seed, dateKey)) === '1'
  } catch {
    return false
  }
}

export function markPrefillRecorded(slot: string, seed: number, dateKey: string): boolean {
  try {
    sessionStorage.setItem(prefillMarkerKey(slot, seed, dateKey), '1')
    return true
  } catch {
    return false
  }
}

/** Aggregates over the slot's ring buffer, computed on read. */
export function statsFor(slot: string): SlotStats {
  const entries = listHistory(slot)
  const played = entries.length
  const wins = entries.filter((e) => e.won).length
  const winRate = played === 0 ? 0 : Math.round((wins / played) * 100)
  const winLives = entries.filter((e) => e.won).map((e) => e.livesLeft)
  const avgLivesLeftOnWins =
    winLives.length === 0
      ? null
      : winLives.reduce((sum, n) => sum + n, 0) / winLives.length
  const rows: SlotStats['rows'] = { '6': 0, '5': 0, '4': 0, '3': 0, '2': 0, '1': 0, lost: 0 }
  for (const entry of entries) {
    if (!entry.won) {
      rows.lost += 1
    } else if (entry.livesLeft >= 1) {
      rows[String(entry.livesLeft) as '6' | '5' | '4' | '3' | '2' | '1'] += 1
    }
  }
  return { played, wins, winRate, avgLivesLeftOnWins, rows }
}
