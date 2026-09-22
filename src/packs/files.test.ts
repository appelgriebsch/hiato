import { describe, expect, test } from 'bun:test'
import path from 'node:path'
import { PACK_CEFRS, PACK_LANGS, type PackCefr, type PackLang } from './schema'
import { requiresCcBySa } from '../../scripts/packs-check-lib'

const ROOT = path.join(import.meta.dir, '../../public/packs')

async function loadPack(lang: PackLang, cefr: PackCefr) {
  const file = path.join(ROOT, lang, `${cefr}.json`)
  return JSON.parse(await Bun.file(file).text()) as {
    lang: string
    cefr: string
    license: string
    attribution: string[]
    lemmas: unknown[]
  }
}

function blob(raw: { license: string; attribution: string[] }): string {
  return [raw.license, ...raw.attribution].join('\n')
}

describe('v0 pack files', () => {
  test('EN/PT/DE/ES × A1–C2 is exactly 24 files', async () => {
    expect(PACK_LANGS.length * PACK_CEFRS.length).toBe(24)
    for (const lang of PACK_LANGS) {
      for (const cefr of PACK_CEFRS) {
        const raw = await loadPack(lang, cefr)
        expect(raw.lang).toBe(lang)
        expect(raw.cefr).toBe(cefr)
        expect(raw.lemmas.length).toBeGreaterThan(10)
        expect(raw.license.length).toBeGreaterThan(0)
        expect(raw.attribution.length).toBeGreaterThan(0)
      }
    }
  })

  test('PT packs declare CC-BY-SA at every shipped level (ADR 0009)', async () => {
    for (const cefr of PACK_CEFRS) {
      const raw = await loadPack('pt', cefr)
      expect(blob(raw).toUpperCase()).toContain('CC-BY-SA')
    }
  })

  test('EN C1/C2 and DE/ES B2–C2 mention CC-BY-SA; EN B2 does not need SA', async () => {
    expect(requiresCcBySa('en', 'b2')).toBe(false)
    const enB2 = await loadPack('en', 'b2')
    expect(blob(enB2).toUpperCase()).not.toMatch(/CC-BY-SA/)

    for (const cefr of ['c1', 'c2'] as const) {
      const raw = await loadPack('en', cefr)
      expect(blob(raw).toUpperCase()).toContain('CC-BY-SA')
    }
    for (const lang of ['de', 'es'] as const) {
      for (const cefr of ['b2', 'c1', 'c2'] as const) {
        const raw = await loadPack(lang, cefr)
        expect(blob(raw).toUpperCase()).toContain('CC-BY-SA')
      }
    }
  })

  test('EN/DE/ES A1–B1 still CC0', async () => {
    for (const lang of ['en', 'de', 'es'] as const) {
      for (const cefr of ['a1', 'a2', 'b1'] as const) {
        const raw = await loadPack(lang, cefr)
        expect(blob(raw).toUpperCase()).toContain('CC0')
      }
    }
  })
})
