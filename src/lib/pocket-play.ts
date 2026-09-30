import { lemmaIdentity } from '../engine'
import type { PocketEntry } from './pocket'

/**
 * Pocket play helpers (ADR 0034 / #84).
 * Hangman retry via `?mode=pocket&id=…` — streak-immune; never recordDailyWin.
 */

export type DailyGateSnapshot = {
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

/** Pocket win removes the entry; fail keeps it. */
export function pocketOutcomeOnFinish(won: boolean): 'remove' | 'keep' {
  return won ? 'remove' : 'keep'
}
