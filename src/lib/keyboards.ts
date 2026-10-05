import type { PackLang } from '@/packs/schema'

/**
 * One language's on-screen pad (#138).
 *
 * `rows` are the source QWERTY/QWERTZ letter rows — each renders as ONE
 * visual row (no wrap, no mid-row orphans). `accentStrip` is an optional
 * labeled, contained strip of accented keys below the letter rows. Accents
 * stay distinct keys, never behind a symbols mode (ADR 0005).
 */
export type LetterPad = {
  rows: string[][]
  accentStrip: string[] | null
}

/** Visible label on the PT/ES accent strip, so it never reads as a 4th letter row. */
export const ACCENT_STRIP_LABEL = 'Accents'

export const LETTER_PADS: Record<PackLang, LetterPad> = {
  en: {
    rows: [
      ['Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P'],
      ['A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L'],
      ['Z', 'X', 'C', 'V', 'B', 'N', 'M'],
    ],
    accentStrip: null,
  },
  pt: {
    rows: [
      ['Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P'],
      ['A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L', 'Ç'],
      ['Z', 'X', 'C', 'V', 'B', 'N', 'M'],
    ],
    accentStrip: ['Á', 'À', 'Ã', 'É', 'Ê', 'Í', 'Ó', 'Ô', 'Õ', 'Ú'],
  },
  // DE option A: Ü / Ö / Ä stay on the QWERTZ letter rows — no accent strip.
  de: {
    rows: [
      ['Q', 'W', 'E', 'R', 'T', 'Z', 'U', 'I', 'O', 'P', 'Ü'],
      ['A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L', 'Ö', 'Ä'],
      ['Y', 'X', 'C', 'V', 'B', 'N', 'M', 'ß'],
    ],
    accentStrip: null,
  },
  es: {
    rows: [
      ['Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P'],
      ['A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L', 'Ñ'],
      ['Z', 'X', 'C', 'V', 'B', 'N', 'M'],
    ],
    accentStrip: ['Á', 'É', 'Í', 'Ó', 'Ú', 'Ü'],
  },
}

/** Every pad row (letter rows, then the accent strip when present). */
export const KEYBOARDS: Record<PackLang, string[][]> = Object.fromEntries(
  Object.entries(LETTER_PADS).map(([lang, pad]) => [
    lang,
    pad.accentStrip ? [...pad.rows, pad.accentStrip] : pad.rows,
  ]),
) as Record<PackLang, string[][]>

/**
 * Widest row in a pad. Every row shares this column pitch, so a short row
 * (e.g. Z…M) centers instead of stretching its keys wider than row 1.
 */
export function padColumns(pad: LetterPad): number {
  return Math.max(...[...pad.rows, pad.accentStrip ?? []].map((r) => r.length))
}

/** False for ß — CSS `uppercase` paints SS in Chrome; click still sends ß (ADR 0005). */
export function keyUsesUppercaseFace(key: string): boolean {
  return key !== 'ß'
}
