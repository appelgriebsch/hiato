import type { PackCefr } from '@/packs/schema'
import { graphemeKey, graphemes, normalizeNfc } from './graphemes'
import { hasDiacritic, isBaseAsciiVowel } from './letters'

/** ADR 0016 */
export const TOTAL_LIVES = 6

export type CellState = {
  /** Revealed grapheme, or null while hidden. */
  char: string | null
  /** Prefill vowel help (A1/A2 ASCII only) or diacritic hint. */
  helped: boolean
  revealed: boolean
}

export type GuessResult = {
  cells: CellState[]
  hit: boolean
}

/**
 * A1/A2 prefill ONLY plain A/E/I/O/U (ADR 0024).
 * Accented vowels stay hidden so ADR 0015 can unlock.
 */
export function buildInitialCells(word: string, cefr: PackCefr): CellState[] {
  const prefillVowels = cefr === 'a1' || cefr === 'a2'
  const gs = graphemes(word)
  return gs.map((ch) => {
    const helped = prefillVowels && isBaseAsciiVowel(ch)
    return {
      char: helped ? ch : null,
      helped,
      revealed: helped,
    }
  })
}

export function applyGuess(
  cells: CellState[],
  word: string,
  letter: string,
): GuessResult {
  const gs = graphemes(word)
  const target = graphemeKey(letter)
  let hit = false
  const next = cells.map((c, i) => {
    const g = gs[i]!
    if (graphemeKey(g) === target && !c.revealed) {
      hit = true
      return { ...c, char: g, revealed: true }
    }
    return c
  })
  return { cells: next, hit }
}

/** Reveal every cell matching the first unrevealed diacritic grapheme (ADR 0015). */
export function revealOneDiacritic(
  cells: CellState[],
  word: string,
): CellState[] {
  const gs = graphemes(word)
  const idx = gs.findIndex((ch, i) => hasDiacritic(ch) && !cells[i]!.revealed)
  if (idx < 0) return cells
  const target = gs[idx]!
  const targetKey = graphemeKey(target)
  return cells.map((c, i) =>
    graphemeKey(gs[i]!) === targetKey && !c.revealed
      ? { ...c, char: gs[i]!, revealed: true, helped: true }
      : c,
  )
}

export function hasUnrevealedDiacritic(
  cells: CellState[],
  word: string,
): boolean {
  const gs = graphemes(word)
  return gs.some((ch, i) => hasDiacritic(ch) && !cells[i]!.revealed)
}

/** ASCII/base letter after stripping combining marks (É → E, Ç → C; ß stays ß). */
function asciiBaseKey(ch: string): string {
  return graphemeKey(normalizeNfc(ch).normalize('NFD').replace(/\p{M}+/gu, ''))
}

/**
 * Whether a *miss* should increment the ADR 0015 hint counter.
 * When a hidden diacritic remains and the guess is a miss, count:
 * - the ASCII base of a hidden diacritic (N vs Ñ, E vs É), or
 * - a diacritic grapheme itself (Á/Ó while Ñ remains — common on ES pads).
 * Unrelated plain ASCII (X, Z) does not count. Exact matches are hits, not misses.
 */
export function isDiacriticHintMiss(
  cells: CellState[],
  word: string,
  letter: string,
): boolean {
  const gs = graphemes(word)
  const hidden = gs.filter((ch, i) => hasDiacritic(ch) && !cells[i]!.revealed)
  if (hidden.length === 0) return false
  const target = graphemeKey(letter)
  // Hits (including the exact hidden diacritic) are not misses.
  if (gs.some((ch, i) => graphemeKey(ch) === target && !cells[i]!.revealed)) {
    return false
  }
  if (hasDiacritic(letter)) return true
  const base = asciiBaseKey(letter)
  return hidden.some((ch) => asciiBaseKey(ch) === base)
}

/** ADR 0015: hint button after 2 diacritic-cell misses, player-triggered. */
export function isDiacriticHintReady(
  cells: CellState[],
  word: string,
  diacriticMisses: number,
  opts: { hintUsed?: boolean; finished?: boolean } = {},
): boolean {
  if (opts.hintUsed || opts.finished) return false
  return diacriticMisses >= 2 && hasUnrevealedDiacritic(cells, word)
}

/** Reveal every grapheme (practice give-up / Reveal word). */
export function revealAllCells(word: string): CellState[] {
  return graphemes(word).map((ch) => ({
    char: ch,
    helped: false,
    revealed: true,
  }))
}

export function isWon(cells: CellState[]): boolean {
  return cells.length > 0 && cells.every((c) => c.revealed)
}

export function correctKeysFromCells(cells: CellState[]): Set<string> {
  const s = new Set<string>()
  for (const c of cells) {
    if (c.revealed && c.char) s.add(graphemeKey(c.char))
  }
  return s
}

/** Word length label for UI. */
export function letterCountLabel(n: number): string {
  return `${n} letter${n === 1 ? '' : 's'}`
}

export function normalizeWord(word: string): string {
  return normalizeNfc(word)
}
