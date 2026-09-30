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
