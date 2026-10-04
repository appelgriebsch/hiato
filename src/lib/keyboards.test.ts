import { describe, expect, test } from 'bun:test'
import { PACK_LANGS } from '../packs/schema'
import { KEYBOARDS, keyUsesUppercaseFace } from './keyboards'

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
