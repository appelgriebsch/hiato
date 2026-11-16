import type { PackCefr, PackLang } from '@/packs/schema'
import { graphemeKey, graphemes, normalizeNfc } from './graphemes'
import { hasDiacritic } from './letters'
import { asciiBaseKey, type CellState } from './game'

/**
 * ADR 0053: on an accent miss (same predicate as ADR 0015), the hidden
 * diacritic the miss points at — the hidden diacritic whose base matches the
 * pressed key, else the first unrevealed diacritic when the pressed key is
 * itself a diacritic. Null when the press is not an accent miss.
 */
export function accentMissTarget(
  cells: CellState[],
  word: string,
  letter: string,
): string | null {
  const gs = graphemes(word)
  const hidden = gs.filter((ch, i) => hasDiacritic(ch) && !cells[i]!.revealed)
  if (hidden.length === 0) return null
  const target = graphemeKey(letter)
  // Hits (including the exact hidden diacritic) are not misses.
  if (gs.some((ch, i) => graphemeKey(ch) === target && !cells[i]!.revealed)) {
    return null
  }
  if (hasDiacritic(letter)) return hidden[0]!
  const base = asciiBaseKey(letter)
  return hidden.find((ch) => asciiBaseKey(ch) === base) ?? null
}

/** ADR 0053: A1–A2 accent misses are forgiven (explain, keep the life); EN never. */
export function isForgivenAccentMiss(lang: PackLang, cefr: PackCefr): boolean {
  return lang !== 'en' && (cefr === 'a1' || cefr === 'a2')
}

/**
 * ADR 0053: one-line English micro-lesson per grapheme, keyed by the
 * uppercased NFC key (ß stays ß). Covers every diacritic grapheme that
 * ships in the packs (measured 2026-11-16).
 */
export const ACCENT_TEACH: Record<string, string> = {
  À: 'A with a grave accent, a more open "a" sound',
  Á: 'A with an acute accent, the stress is on this vowel',
  Â: 'A with a circumflex, the vowel sound changes',
  Ã: 'A with a tilde, a nasal vowel sound',
  Ä: 'A with an umlaut (two dots), a different vowel sound',
  Ç: 'C with a cedilla, the C sounds like "s"',
  È: 'E with a grave accent, a more open "e" sound',
  É: 'E with an acute accent, sounds like "ay"',
  Ê: 'E with a circumflex, the vowel sound changes',
  Ì: 'I with a grave accent, a more open "i" sound',
  Í: 'I with an acute accent, the stress is on this vowel',
  Î: 'I with a circumflex, the vowel sound changes',
  Ï: 'I with a diaeresis, say the vowel on its own',
  Ñ: 'N with a tilde, sounds like "ny"',
  Ò: 'O with a grave accent, a more open "o" sound',
  Ó: 'O with an acute accent, the stress is on this vowel',
  Ô: 'O with a circumflex, the vowel sound changes',
  Õ: 'O with a tilde, a nasal vowel sound',
  Ö: 'O with an umlaut (two dots), a different vowel sound',
  Ù: 'U with a grave accent, a more open "u" sound',
  Ú: 'U with an acute accent, the stress is on this vowel',
  Û: 'U with a circumflex, the vowel sound changes',
  Ü: 'U with an umlaut (two dots), a different vowel sound',
  Œ: 'the French ligature "oe", one blended vowel sound',
  ß: 'the German sharp s, sounds like "ss"',
}

const ACCENT_TEACH_FALLBACK =
  'this letter carries a special mark that changes its sound'

/** ADR 0053: the teach line shown on an accent miss, e.g. "Ñ: N with a tilde, sounds like \"ny\"". */
export function accentTeachLine(grapheme: string): string {
  const key = graphemeKey(normalizeNfc(grapheme))
  const explain = ACCENT_TEACH[key]
  return explain ? `${key}: ${explain}` : `${key}: ${ACCENT_TEACH_FALLBACK}`
}
