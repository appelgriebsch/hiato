import { lemmaIdentity } from '../engine'
import {
  isDue,
  POCKET_DAY_MS,
  sortForSheet,
  type PocketEntry,
  type PocketStage,
} from './pocket'

/**
 * Pocket play helpers (ADR 0034 / #84).
 * Hangman retry via `?mode=pocket&id=…` — streak-immune; never recordDailyWin.
 */

export type DailyGateSnapshot = {
  /** Caller-owned local day; not read by canPlayPocketEntry (identity + completion only). */
  dateKey: string
  /** Today's daily lemma for the active lang×CEFR. */
  dailyWord: string
  /**
   * Completed daily for today, if any.
   * Lost daily → same-day pocket retry of that lemma is allowed (ADR 0018 nuance).
   */
  dailyCompleted: { won: boolean; word: string } | null
}

/**
 * ADR 0018 / 0034 gate for starting a pocket round.
 * - Entry that is not today's daily → allowed
 * - Entry that is today's daily → only when today's daily was completed as a lose
 */
export function canPlayPocketEntry(
  entryWord: string,
  gate: DailyGateSnapshot,
): boolean {
  if (lemmaIdentity(entryWord) !== lemmaIdentity(gate.dailyWord)) {
    return true
  }
  const rec = gate.dailyCompleted
  if (!rec || rec.won) return false
  return lemmaIdentity(rec.word) === lemmaIdentity(entryWord)
}

export function findPocketEntryById(
  entries: ReadonlyArray<PocketEntry>,
  id: string,
): PocketEntry | undefined {
  return entries.find((e) => e.id === id)
}

/** Empty / missing `id` query → no playable entry. */
export function parsePocketEntryId(raw: string | null): string | null {
  if (raw == null) return null
  const id = raw.trim()
  return id.length > 0 ? id : null
}

export type PocketFinish =
  | { type: 'remove' }
  | { type: 'keep' }
  | { type: 'advance'; stage: PocketStage; dueAt: number }

/**
 * Win removes the entry, early or due.
 * A loss advances only when the entry was due at play start.
 * The interval is that starting stage: 0 → +1 day, 1 → +3, 2 → +7 (stage caps at 2).
 */
export function pocketOutcomeOnFinish(
  won: boolean,
  wasDueAtStart = false,
  stage: PocketStage = 0,
  now = 0,
): PocketFinish {
  if (won) return { type: 'remove' }
  if (!wasDueAtStart) return { type: 'keep' }
  const days = stage === 1 ? 3 : stage === 2 ? 7 : 1
  const next: PocketStage = stage < 2 ? ((stage + 1) as PocketStage) : 2
  return { type: 'advance', stage: next, dueAt: now + days * POCKET_DAY_MS }
}

/** Due entries that ADR 0018 still allows, in sheet order. */
export function playableDueEntries(
  entries: readonly PocketEntry[],
  today: string,
  gate: DailyGateSnapshot,
): PocketEntry[] {
  return sortForSheet(entries, today).filter(
    (entry) => isDue(entry, today) && canPlayPocketEntry(entry.word, gate),
  )
}

export function dailyGateFor(
  today: string,
  dailyWord: string,
  rec: { dateKey: string; completed: boolean; won: boolean; word: string } | null,
): DailyGateSnapshot {
  return {
    dateKey: today,
    dailyWord,
    dailyCompleted:
      rec && rec.dateKey === today && rec.completed
        ? { won: rec.won, word: rec.word }
        : null,
  }
}
