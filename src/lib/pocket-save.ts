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
