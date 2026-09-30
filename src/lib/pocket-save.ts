import { POCKET_CAP } from './pocket'

/**
 * EndCard Save eligibility (ADR 0034 / #83).
 * Opt-in Save is daily-lose only — never practice/endless, never any win.
 */
export function shouldShowPocketSave(mode: string, won: boolean): boolean {
  return mode === 'daily' && !won
}

/**
 * Gate replace-oldest confirm when Save is pressed.
 * Full slot + new word → confirm first. Duplicates are keep-first no-ops
 * and must not prompt (addToPocket is idempotent).
 */
export function needsReplaceOldestConfirm(
  slotCount: number,
  wordAlreadyInPocket: boolean,
  cap: number = POCKET_CAP,
): boolean {
  return !wordAlreadyInPocket && slotCount >= cap
}

/**
 * Safe, non-lemma label for the entry shown in the replace-oldest confirm.
 * Stored pocket entries may not have a gloss, and their word must not be
 * exposed as confirmation copy without an explicit lemma decision.
 */
export function pocketConfirmLabel(oldest: { gloss?: string }): string {
  return typeof oldest.gloss === 'string' && oldest.gloss.trim().length > 0
    ? oldest.gloss
    : 'your oldest pocket entry'
}

export type ConfirmReCheckDecision = 'commit' | 'duplicate' | 'refresh'

/**
 * Re-check pocket slot on Confirm before commit (Avery W3 / multi-tab TOCTOU).
 * Snapshot was taken when entering confirm; freshSlot is a live re-read.
 * Oldest is slot[0] (oldest-first from listPocketStored).
 */
export function decideConfirmReCheck(
  snapshotOldestId: string,
  freshSlot: ReadonlyArray<{ id: string }>,
  currentWordId: string,
  cap: number = POCKET_CAP,
): ConfirmReCheckDecision {
  if (freshSlot.some((e) => e.id === currentWordId)) return 'duplicate'
  if (freshSlot.length < cap) return 'commit'
  const oldestId = freshSlot[0]?.id
  if (oldestId !== snapshotOldestId) return 'refresh'
  return 'commit'
}
