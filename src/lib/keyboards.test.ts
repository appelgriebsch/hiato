import { describe, expect, test } from 'bun:test'
import { PACK_LANGS } from '../packs/schema'
import { KEYBOARDS } from './keyboards'

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
