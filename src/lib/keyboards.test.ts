import { describe, expect, test } from 'bun:test'
import { PACK_LANGS } from '../packs/schema'
import {
  ACCENT_STRIP_LABEL,
  KEYBOARDS,
  LETTER_PADS,
  keyUsesUppercaseFace,
  padColumns,
} from './keyboards'

describe('per-language letter pads (ADR 0005)', () => {
  test('every pack language has a pad', () => {
    for (const lang of PACK_LANGS) {
      expect(KEYBOARDS[lang].length).toBeGreaterThanOrEqual(3)
      expect(KEYBOARDS[lang].flat().length).toBeGreaterThan(20)
    }
  })

  test('DE includes ß, ä, ö, ü as distinct keys', () => {
    const keys = KEYBOARDS.de.flat()
    expect(keys).toContain('ß')
    expect(keys).toContain('Ä')
    expect(keys).toContain('Ö')
    expect(keys).toContain('Ü')
  })


  test('DE ß key face label is ß not SS (German row, not Spanish Ü)', () => {
    const deRow = KEYBOARDS.de.find((row) => row.includes('ß'))
    expect(deRow).toBeDefined()
    const face = deRow!.find((k) => k === 'ß')!
    // Rendered label source is the key itself — must stay ß.
    expect(face).toBe('ß')
    expect(face).not.toBe('SS')
    expect(face.toUpperCase()).toBe('SS') // documents Chrome CSS uppercase trap
    expect(keyUsesUppercaseFace(face)).toBe(false)
    for (const k of ['Ä', 'Ö', 'Ü'] as const) {
      expect(KEYBOARDS.de.flat()).toContain(k)
      expect(keyUsesUppercaseFace(k)).toBe(true)
    }
    // Probe is the German row — Spanish Ü must not satisfy a ß grep.
    expect(KEYBOARDS.es.flat()).toContain('Ü')
    expect(KEYBOARDS.es.flat()).not.toContain('ß')
    expect(KEYBOARDS.es.flat().some((k) => !keyUsesUppercaseFace(k))).toBe(false)
  })

  test('PT includes ç and accented vowels', () => {
    const keys = KEYBOARDS.pt.flat()
    expect(keys).toContain('Ç')
    expect(keys).toContain('Ã')
    expect(keys).toContain('Õ')
  })

  test('ES includes ñ and accented vowels', () => {
    const keys = KEYBOARDS.es.flat()
    expect(keys).toContain('Ñ')
    expect(keys).toContain('Á')
    expect(keys).toContain('Ü')
  })
})

describe('letter pad layout metadata (#138)', () => {
  test('KEYBOARDS = letter rows + accent strip (flat set unchanged)', () => {
    for (const lang of PACK_LANGS) {
      const pad = LETTER_PADS[lang]
      const expected = pad.accentStrip
        ? [...pad.rows, pad.accentStrip]
        : pad.rows
      expect(KEYBOARDS[lang]).toEqual(expected)
      expect(pad.rows.length).toBe(3)
    }
  })

  test('source rows keep QWERTY/QWERTZ integrity (one visual row each)', () => {
    expect(LETTER_PADS.en.rows[0]!.join('')).toBe('QWERTYUIOP')
    expect(LETTER_PADS.en.rows[1]!.join('')).toBe('ASDFGHJKL')
    expect(LETTER_PADS.en.rows[2]!.join('')).toBe('ZXCVBNM')
    expect(LETTER_PADS.de.rows[0]!.join('')).toBe('QWERTZUIOPÜ')
    expect(LETTER_PADS.de.rows[1]!.join('')).toBe('ASDFGHJKLÖÄ')
    expect(LETTER_PADS.de.rows[2]!.join('')).toBe('YXCVBNMß')
    expect(LETTER_PADS.pt.rows[1]!.at(-1)).toBe('Ç')
    expect(LETTER_PADS.es.rows[1]!.at(-1)).toBe('Ñ')
  })

  test('DE option A: Ü/Ö/Ä/ß on letter rows, no accent strip', () => {
    expect(LETTER_PADS.de.accentStrip).toBeNull()
    const letters = LETTER_PADS.de.rows.flat()
    for (const k of ['Ü', 'Ö', 'Ä', 'ß']) expect(letters).toContain(k)
    expect(keyUsesUppercaseFace('ß')).toBe(false)
  })

  test('PT/ES have a labeled accent strip of distinct keys (ADR 0005); EN none', () => {
    expect(ACCENT_STRIP_LABEL).toBe('Accents')
    expect(LETTER_PADS.en.accentStrip).toBeNull()
    expect(LETTER_PADS.pt.accentStrip).toEqual([
      'Á', 'À', 'Ã', 'É', 'Ê', 'Í', 'Ó', 'Ô', 'Õ', 'Ú',
    ])
    expect(LETTER_PADS.es.accentStrip).toEqual(['Á', 'É', 'Í', 'Ó', 'Ú', 'Ü'])
    for (const lang of ['pt', 'es'] as const) {
      const pad = LETTER_PADS[lang]
      // Accent keys live only in the strip, never mixed into letter rows.
      for (const k of pad.accentStrip!) expect(pad.rows.flat()).not.toContain(k)
      expect(new Set(pad.accentStrip).size).toBe(pad.accentStrip!.length)
    }
  })

  test('padColumns is the widest row (shared pitch for short rows)', () => {
    expect(padColumns(LETTER_PADS.en)).toBe(10)
    expect(padColumns(LETTER_PADS.pt)).toBe(10)
    expect(padColumns(LETTER_PADS.es)).toBe(10)
    expect(padColumns(LETTER_PADS.de)).toBe(11)
  })

})
