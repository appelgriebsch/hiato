/**
 * ADR 0023 anti-spoiler: gloss / synonyms must not contain the lemma
 * as a whole Unicode word (case-insensitive, NFC).
 */

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** True if haystack contains lemma as a whole Unicode word (ADR 0023). */
export function spoilerContains(haystack: string, lemma: string): boolean {
  const h = haystack.normalize('NFC')
  const needle = lemma.normalize('NFC').trim()
  if (!needle) return false
  const re = new RegExp(
    `(?<![\\p{L}\\p{N}])${escapeRegExp(needle)}(?![\\p{L}\\p{N}])`,
    'iu',
  )
  return re.test(h)
}
