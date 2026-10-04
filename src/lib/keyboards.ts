import type { PackLang } from '@/packs/schema'

/** Rows of keys for the on-screen pad. Accents are distinct keys (ADR 0005). */
export const KEYBOARDS: Record<PackLang, string[][]> = {
  en: [
    ['Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P'],
    ['A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L'],
    ['Z', 'X', 'C', 'V', 'B', 'N', 'M'],
  ],
  pt: [
    ['Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P'],
    ['A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L', 'Ç'],
    ['Z', 'X', 'C', 'V', 'B', 'N', 'M'],
    ['Á', 'À', 'Ã', 'É', 'Ê', 'Í', 'Ó', 'Ô', 'Õ', 'Ú'],
  ],
  de: [
    ['Q', 'W', 'E', 'R', 'T', 'Z', 'U', 'I', 'O', 'P', 'Ü'],
    ['A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L', 'Ö', 'Ä'],
    ['Y', 'X', 'C', 'V', 'B', 'N', 'M', 'ß'],
  ],
  es: [
    ['Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P'],
    ['A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L', 'Ñ'],
    ['Z', 'X', 'C', 'V', 'B', 'N', 'M'],
    ['Á', 'É', 'Í', 'Ó', 'Ú', 'Ü'],
  ],
}

/** False for ß — CSS `uppercase` paints SS in Chrome; click still sends ß (ADR 0005). */
export function keyUsesUppercaseFace(key: string): boolean {
  return key !== 'ß'
}
