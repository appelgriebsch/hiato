import { describe, expect, test } from 'bun:test'
import path from 'node:path'
import { PACK_CEFRS, PACK_LANGS } from './schema'

const ROOT = path.join(import.meta.dir, '../../public/packs')

describe('v0 pack files', () => {
  test('EN/PT/DE/ES × A1/A2/B1 all exist', async () => {
    for (const lang of PACK_LANGS) {
      for (const cefr of PACK_CEFRS) {
        const file = path.join(ROOT, lang, `${cefr}.json`)
        const raw = JSON.parse(await Bun.file(file).text()) as {
          lang: string
          cefr: string
          license: string
          attribution: string[]
          lemmas: unknown[]
        }
        expect(raw.lang).toBe(lang)
        expect(raw.cefr).toBe(cefr)
        expect(raw.lemmas.length).toBeGreaterThan(10)
        expect(raw.license.length).toBeGreaterThan(0)
        expect(raw.attribution.length).toBeGreaterThan(0)
      }
    }
  })

  test('PT packs declare CC-BY-SA (ADR 0009)', async () => {
    for (const cefr of PACK_CEFRS) {
      const raw = JSON.parse(
        await Bun.file(path.join(ROOT, 'pt', `${cefr}.json`)).text(),
      ) as { license: string }
      expect(raw.license.toUpperCase()).toContain('CC-BY-SA')
    }
  })
})
