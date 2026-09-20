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

  test('EN B2 stays with the citation/CC0 band; C1–C2 are SA not CC0', () => {
    const a1b2 = bandBlob('en', 'A1–B2')
    expect(a1b2.toUpperCase()).toContain('CC0')
    expect(a1b2).toMatch(/Tono Lab|CEFR-J/)
    expect(a1b2.toUpperCase()).not.toMatch(/CC-BY-SA/)

    const c1c2 = bandBlob('en', 'C1–C2')
    expect(c1c2.toUpperCase()).toContain('CC-BY-SA')
    expect(c1c2.toUpperCase()).not.toContain('CC0')
  })

  test('DE/ES B2–C2 are SA frequency bands, not Goethe/Cervantes', () => {
    for (const lang of ['de', 'es'] as const) {
      const low = bandBlob(lang, 'A1–B1')
      expect(low.toUpperCase()).toContain('CC0')

      const high = bandBlob(lang, 'B2–C2')
      expect(high.toUpperCase()).toContain('CC-BY-SA')
      expect(high.toLowerCase()).toMatch(/frequency/)
      expect(high.toLowerCase()).toMatch(/not (goethe|instituto cervantes)/)
    }
  })

  test('PT is SA at every band; C-levels are frequency not CAPLE', () => {
    const pt = PACK_LICENSES.find((p) => p.lang === 'pt')
    expect(pt?.bands).toHaveLength(1)
    const blob = bandBlob('pt', 'A1–C2')
    expect(blob.toUpperCase()).toContain('CC-BY-SA')
    expect(blob.toLowerCase()).toMatch(/frequency/)
    expect(blob).toMatch(/not CAPLE/)
  })
})
