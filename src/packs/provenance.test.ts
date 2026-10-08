import { describe, expect, test } from 'bun:test'
import { PACK_LICENSES } from './licenses'
import {
  cefrInBandLevels,
  packInfoLabel,
  provenanceBand,
  provenanceCaption,
  provenanceFragments,
  shortLicenseFromBand,
} from './provenance'
import { PACK_CEFRS, PACK_LANGS, type PackCefr, type PackLang } from './schema'

describe('provenanceCaption (#80 / #100 / #101)', () => {
  test('every lang×CEFR yields source · license · method', () => {
    for (const lang of PACK_LANGS) {
      for (const cefr of PACK_CEFRS) {
        const caption = provenanceCaption(lang, cefr)
        const parts = caption.split(' · ')
        expect(parts).toHaveLength(3)
        expect(parts[0]!.length).toBeGreaterThan(0)
        expect(parts[1]).toMatch(/^(CC-BY-SA|CEFR-J terms)$/)
        expect(parts[2]!.length).toBeGreaterThan(0)
        expect(provenanceBand(lang, cefr)).toBeDefined()
      }
    }
  })

  test('license short form matches PACK_LICENSES band (ADR 0029)', () => {
    for (const lang of PACK_LANGS) {
      for (const cefr of PACK_CEFRS) {
        const band = provenanceBand(lang, cefr)!
        const { license } = provenanceFragments(lang, cefr)
        expect(license).toBe(shortLicenseFromBand(band))
        if (/CC-BY-SA/i.test(band.license)) expect(license).toBe('CC-BY-SA')
        else expect(license).toBe('CEFR-J terms')
        expect(license).not.toBe('CC0')
      }
    }
  })

  test('EN A1–B2 is one CEFR-J band; C1–C2 is the Octanove SA add-on', () => {
    for (const cefr of ['a1', 'a2', 'b1', 'b2'] as const) {
      const band = provenanceFragments('en', cefr, 'en')
      expect(band.source).toBe('CEFR-J')
      expect(band.license).toBe('CEFR-J terms')
      expect(band.method).toBe('tagged syllabus')
    }

    const c1 = provenanceFragments('en', 'c1', 'en')
    expect(c1.source).toBe('Octanove')
    expect(c1.license).toBe('CC-BY-SA')
    expect(c1.method).toBe('tagged add-on')
  })

  test('DE/ES are wordhoard frequency-rank SA at every level (#169)', () => {
    for (const lang of ['de', 'es'] as const) {
      const low = provenanceFragments(lang, 'b1', 'en')
      expect(low.source).toBe('wordhoard')
      expect(low.license).toBe('CC-BY-SA')
      expect(low.method).toBe('frequency-rank')

      const high = provenanceFragments(lang, 'b2', 'en')
      expect(high.source).toBe('wordhoard')
      expect(high.license).toBe('CC-BY-SA')
      expect(high.method).toBe('frequency-rank')
    }
  })

  test('PT is frequency-rank SA at every CEFR (not CAPLE)', () => {
    for (const cefr of PACK_CEFRS) {
      const f = provenanceFragments('pt', cefr, 'en')
      expect(f.source).toBe('FrequencyWords')
      expect(f.license).toBe('CC-BY-SA')
      expect(f.method).toBe('frequency-rank')
    }
    const ptBand = PACK_LICENSES.find((p) => p.lang === 'pt')!.bands[0]!
    expect(ptBand.notes.join('\n')).toMatch(/not CAPLE/)
  })

  test('caption UI strings exist for EN/PT/DE/ES; no translated legalese blobs', () => {
    const sample: Array<[PackLang, PackCefr]> = [
      ['en', 'b2'],
      ['pt', 'c1'],
      ['de', 'b2'],
      ['es', 'a1'],
    ]
    for (const [lang, cefr] of sample) {
      for (const ui of PACK_LANGS) {
        const f = provenanceFragments(lang, cefr, ui)
        expect(f.source.length).toBeGreaterThan(0)
        expect(f.method.length).toBeGreaterThan(0)
        // Short fragments only — not full About notes / SPDX prose
        expect(f.source.length).toBeLessThan(40)
        expect(f.method.length).toBeLessThan(40)
        expect(f.source).not.toMatch(/Share-alike applies|verbatim dump|publicdomain/i)
        expect(packInfoLabel(ui).length).toBeGreaterThan(0)
      }
    }
  })

  test('cefrInBandLevels matches PACK_LICENSES level ranges', () => {
    expect(cefrInBandLevels('b2', 'A1–B2')).toBe(true)
    expect(cefrInBandLevels('c1', 'A1–B2')).toBe(false)
    expect(cefrInBandLevels('b2', 'B2–C2')).toBe(true)
    expect(cefrInBandLevels('a1', 'B2–C2')).toBe(false)
    expect(cefrInBandLevels('c2', 'A1–C2')).toBe(true)
    // ASCII hyphen accepted (same as en-dash)
    expect(cefrInBandLevels('b2', 'A1-B2')).toBe(true)
    expect(cefrInBandLevels('c1', 'A1-B2')).toBe(false)
    expect(cefrInBandLevels('b2', 'B2-C2')).toBe(true)
  })

  test('shortLicenseFromBand throws on unknown license (no CC0 default)', () => {
    expect(() =>
      shortLicenseFromBand({
        levels: 'A1–B2',
        license: 'MIT',
        notes: [],
      }),
    ).toThrow(/Unknown license/)
  })

  test('default uiLang is the pack language', () => {
    expect(provenanceCaption('pt', 'a1')).toBe(provenanceCaption('pt', 'a1', 'pt'))
    expect(provenanceCaption('de', 'b2')).toContain('Frequenzband')
    expect(provenanceCaption('es', 'b2')).toContain('por frecuencia')
  })
})
