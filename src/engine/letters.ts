import { graphemeKey, normalizeNfc } from './graphemes'

const ASCII_VOWELS = new Set(['A', 'E', 'I', 'O', 'U'])

/**
 * True if the grapheme carries a diacritic / is a special letter (ß, ñ, …).
 * Plain ASCII A–Z are never diacritics (ADR 0005, 0024).
 */
export function hasDiacritic(ch: string): boolean {
  const g = normalizeNfc(ch)
  if (g.length === 0) return false
  // NFD: base + combining marks
  const nfd = g.normalize('NFD')
  if ([...nfd].some((c) => /^\p{M}$/u.test(c))) return true
  // Special letters without combining marks (ß, ð, þ, ø, æ, œ, ł, …)
  // or precomposed singles that fold away from A–Z
  const upper = graphemeKey(g)
  if (upper.length === 1) {
    const code = upper.codePointAt(0)!
    if (code >= 0x41 && code <= 0x5a) return false
  }
  // Non-ASCII letter-like grapheme
  return /[^\u0000-\u007f]/u.test(g)
}

/** Base ASCII vowel only (A/E/I/O/U). Accented vowels are NOT base vowels (ADR 0024). */
export function isBaseAsciiVowel(ch: string): boolean {
  const g = normalizeNfc(ch)
  if (hasDiacritic(g)) return false
  return ASCII_VOWELS.has(graphemeKey(g))
}
