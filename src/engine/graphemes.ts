/** NFC normalize + grapheme-cluster split (ADR 0005). */

const segmenter =
  typeof Intl !== 'undefined' && 'Segmenter' in Intl
    ? new Intl.Segmenter(undefined, { granularity: 'grapheme' })
    : null

/** Normalize to NFC (composed form). */
export function normalizeNfc(s: string): string {
  return s.normalize('NFC')
}

/**
 * Split into user-perceived grapheme clusters.
 * Prefers Intl.Segmenter; falls back to Array.from (code points) if unavailable.
 */
export function graphemes(s: string): string[] {
  const nfc = normalizeNfc(s)
  if (segmenter) {
    return [...segmenter.segment(nfc)].map((seg) => seg.segment)
  }
  return Array.from(nfc)
}

/**
 * Uppercase a single grapheme for key comparison.
 * ß stays distinct (ADR 0005 — not mapped to SS).
 */
export function graphemeKey(g: string): string {
  const nfc = normalizeNfc(g)
  if (nfc === 'ß' || nfc === 'ẞ') return 'ß'
  return nfc.toLocaleUpperCase('en-US')
}
