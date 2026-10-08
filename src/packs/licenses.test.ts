import { describe, expect, test } from 'bun:test'
import { PACK_LICENSES } from './licenses'
import { PACK_LANGS } from './schema'

function bandBlob(
  lang: (typeof PACK_LICENSES)[number]['lang'],
  levels: string,
): string {
  const info = PACK_LICENSES.find((p) => p.lang === lang)
  const band = info?.bands.find((b) => b.levels === levels)
  expect(band).toBeDefined()
  return [band!.license, ...band!.notes].join('\n')
}

describe('PACK_LICENSES About bands (ADR 0029)', () => {
  test('four language cards in picker order', () => {
    expect(PACK_LICENSES.map((p) => p.lang)).toEqual([...PACK_LANGS])
    expect(PACK_LICENSES).toHaveLength(4)
  })

  test('EN A1–B2 is CEFR-J citation, not CC0; C1–C2 are SA not CC0', () => {
    const a1b2 = bandBlob('en', 'A1–B2')
    expect(a1b2).toMatch(/CEFR-J/)
    expect(a1b2).toMatch(/Yukio Tono/)
    expect(a1b2).toMatch(/cefr-j\.org/)
    expect(a1b2.toUpperCase()).not.toContain('CC0')
    expect(a1b2.toUpperCase()).not.toMatch(/CC-BY-SA/)

    const c1c2 = bandBlob('en', 'C1–C2')
    expect(c1c2.toUpperCase()).toContain('CC-BY-SA')
    expect(c1c2.toUpperCase()).not.toContain('CC0')
  })

  test('DE/ES are SA at every band (#169); B2–C2 frequency bands, not Goethe/Cervantes', () => {
    for (const lang of ['de', 'es'] as const) {
      const low = bandBlob(lang, 'A1–B1')
      expect(low.toUpperCase()).toContain('CC-BY-SA')
      expect(low.toUpperCase()).not.toContain('CC0')
      expect(low).toContain('wordhoard')

      const high = bandBlob(lang, 'B2–C2')
      expect(high.toUpperCase()).toContain('CC-BY-SA')
      expect(high.toLowerCase()).toMatch(/frequency/)
      expect(high).toMatch(/natema/)
      expect(high).toMatch(/github\.com\/natema\/wordhoard/)
      if (lang === 'de') {
        expect(high).toMatch(/calibrated against Goethe-Institut/)
        expect(high).not.toMatch(/not Goethe lists/)
      } else {
        expect(high.toLowerCase()).toMatch(/not instituto cervantes/)
      }
      expect(low).toMatch(/natema/)
      expect(low).not.toMatch(/not Goethe lists/)
    }
  })

  test('PT is SA at every band; C-levels are frequency not CAPLE', () => {
    const pt = PACK_LICENSES.find((p) => p.lang === 'pt')
    expect(pt?.bands).toHaveLength(1)
    const blob = bandBlob('pt', 'A1–C2')
    expect(blob.toUpperCase()).toContain('CC-BY-SA')
    expect(blob).toMatch(/pt_50k/)
    expect(blob).toMatch(/Hermit Dave/)
    expect(blob).toMatch(/github\.com\/hermitdave\/FrequencyWords/)
    expect(blob).not.toMatch(/Wiktionary-derived/)
    expect(blob.toLowerCase()).toMatch(/frequency/)
    expect(blob).toMatch(/not CAPLE/)
  })

  test('FrequencyWords is never cited as MIT-only content (#169)', () => {
    for (const info of PACK_LICENSES) {
      const blob = info.attribution.join('\n')
      expect(blob).not.toMatch(/FrequencyWords[^)\n]*\(MIT\)|FrequencyWords MIT/)
      if (/FrequencyWords/.test(blob)) {
        expect(blob).toMatch(/CC-BY-SA/)
      }
    }
  })

  test('About intro cannot regress to CC0, a split EN band, or a MIT-only FrequencyWords cite', async () => {
    const src = await Bun.file(new URL('../pages/About.tsx', import.meta.url)).text()
    const intro = src.slice(src.indexOf('Word packs ship'), src.indexOf('PACK_LICENSES.map'))
    expect(intro).toContain('English A1–B2 lemmas are')
    expect(intro).toContain('CEFR-J Wordlist')
    expect(intro).toContain('calibrated against Goethe-Institut')
    expect(intro).toContain('FrequencyWords pt_50k')
    expect(intro).not.toContain('CC0')
    expect(intro).not.toContain('English A1–B1 lemmas are')
    expect(intro).not.toMatch(/FrequencyWords[^)\n]*\(MIT\)|FrequencyWords MIT/)
    expect(intro).not.toMatch(/Wiktionary/)
    expect(src).not.toContain('creativecommons.org/publicdomain/zero')
    expect(src).toContain('cefr-j.org')
  })
})
