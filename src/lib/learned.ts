import { lemmaIdentity } from '../engine'

/**
 * Words-learned set (ADR 0054, #309).
 * Guest-local localStorage, same pattern as history / streaks / daily-record.
 *
 * Shape: { v: 1, slots: { 'lang|cefr': string[] } } — lemmaIdentity strings,
 * deduped. Bounded by pack size (400 lemmas per slot) in practice;
 * LEARNED_READ_CAP only bounds a hand-edited oversized slot on read.
 * Written on Daily and Pocket wins only; never touches streaks, freezes,
 * the Pocket ladder, history, or analytics.
 */

export const LEARNED_KEY = 'hiato.learned'
export const LEARNED_READ_CAP = 4096
const WORD_MAX_LEN = 100

type LearnedFile = { v: 1; slots: Record<string, string[]> }

/** Junk or a wrong version parses to an empty file. */
function parseFile(raw: unknown): LearnedFile {
  const empty: LearnedFile = { v: 1, slots: {} }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return empty
  const o = raw as Record<string, unknown>
  if (o.v !== 1 || !o.slots || typeof o.slots !== 'object' || Array.isArray(o.slots)) {
    return empty
  }
  const out: LearnedFile = { v: 1, slots: {} }
  for (const [slot, list] of Object.entries(o.slots as Record<string, unknown>)) {
    if (!Array.isArray(list)) continue
    const seen = new Set<string>()
    const words: string[] = []
    for (const item of list) {
      if (typeof item !== 'string' || item.length === 0 || item.length > WORD_MAX_LEN) continue
      if (seen.has(item)) continue
      seen.add(item)
      words.push(item)
    }
    out.slots[slot] = words.slice(0, LEARNED_READ_CAP)
  }
  return out
}

function readFile(): LearnedFile {
  try {
    const raw = localStorage.getItem(LEARNED_KEY)
    if (!raw) return { v: 1, slots: {} }
    return parseFile(JSON.parse(raw))
  } catch {
    return { v: 1, slots: {} }
  }
}

function writeFile(file: LearnedFile): void {
  try {
    localStorage.setItem(LEARNED_KEY, JSON.stringify(file))
  } catch {
    // quota / private mode — in-memory callers still have the returned list
  }
}

/** Learned word identities for one slot. */
export function listLearned(slot: string): string[] {
  return readFile().slots[slot] ?? []
}

export function learnedCount(slot: string): number {
  return listLearned(slot).length
}

/**
 * Mark one word learned. No-op when the identity is already present.
 * Returns the slot's identities after the write.
 */
export function recordLearned(slot: string, word: string): string[] {
  const identity = lemmaIdentity(word)
  if (identity.length === 0) return listLearned(slot)
  const file = readFile()
  const current = file.slots[slot] ?? []
  if (current.includes(identity)) return current
  const next = [...current, identity].slice(-LEARNED_READ_CAP)
  file.slots[slot] = next
  writeFile(file)
  return next
}
