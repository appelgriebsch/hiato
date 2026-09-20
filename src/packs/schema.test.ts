import { describe, expect, test } from 'bun:test'
import {
  PACK_ASSET_PATH_RE,
  PACK_CEFR_LEVELS,
  PACK_CEFRS,
  isPackCefr,
} from './schema'

describe('isPackCefr (ADR 0027)', () => {
  test('accepts A1–C2 codes', () => {
    for (const cefr of PACK_CEFR_LEVELS) {
      expect(isPackCefr(cefr)).toBe(true)
    }
    expect(isPackCefr('b2')).toBe(true)
    expect(isPackCefr('c1')).toBe(true)
    expect(isPackCefr('c2')).toBe(true)
  })

  test('rejects unknown codes', () => {
    expect(isPackCefr('c3')).toBe(false)
    expect(isPackCefr('B1')).toBe(false)
    expect(isPackCefr('')).toBe(false)
    expect(isPackCefr(null)).toBe(false)
  })

  test('PACK_CEFRS is the shipped A1–C2 picker list', () => {
    expect(PACK_CEFRS).toEqual(['a1', 'a2', 'b1', 'b2', 'c1', 'c2'])
    expect(PACK_CEFR_LEVELS).toEqual(['a1', 'a2', 'b1', 'b2', 'c1', 'c2'])
  })

  test('PACK_ASSET_PATH_RE matches six CEFR files, not garbage', () => {
    expect(PACK_ASSET_PATH_RE.test('/packs/en/a1.json')).toBe(true)
    expect(PACK_ASSET_PATH_RE.test('/packs/en/b2.json')).toBe(true)
    expect(PACK_ASSET_PATH_RE.test('/packs/pt/c2.json')).toBe(true)
    expect(PACK_ASSET_PATH_RE.test('/packs/en/c3.json')).toBe(false)
    expect(PACK_ASSET_PATH_RE.test('/packs/en/missing.json')).toBe(false)
    expect(PACK_ASSET_PATH_RE.test('/index.html')).toBe(false)
  })
})

describe('pack hosting', () => {
  test('_redirects 404s /packs/* before the SPA fallback', async () => {
    const text = await Bun.file(
      new URL('../../public/_redirects', import.meta.url),
    ).text()
    const lines = text
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith('#'))
    const packsIdx = lines.findIndex((l) => l.startsWith('/packs/*'))
    const spaIdx = lines.findIndex((l) => l.startsWith('/*'))
    expect(packsIdx).toBeGreaterThanOrEqual(0)
    expect(spaIdx).toBeGreaterThan(packsIdx)
    expect(lines[packsIdx]).toMatch(/404/)
    expect(lines[spaIdx]).toMatch(/\/index\.html\s+200/)
  })

  test('pack Pages Function 404s HTML fallback and passes JSON', async () => {
    const { onRequest } = await import('../../functions/packs/[[path]].ts')
    const json = await onRequest({
      next: async () =>
        new Response('{"lang":"en"}', {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
    })
    expect(json.status).toBe(200)
    expect(await json.text()).toBe('{"lang":"en"}')

    const html = await onRequest({
      next: async () =>
        new Response('<html>spa</html>', {
          status: 200,
          headers: { 'content-type': 'text/html; charset=utf-8' },
        }),
    })
    expect(html.status).toBe(404)
    expect(html.headers.get('cache-control')).toBe('no-store')
  })

  test('Workbox runtime cache uses PACK_ASSET_PATH_RE and maxEntries 24', async () => {
    const src = await Bun.file(
      new URL('../../vite.config.ts', import.meta.url),
    ).text()
    expect(src).toContain(
      '/\\/packs\\/(en|de|es|pt)\\/(a1|a2|b1|b2|c1|c2)\\.json$/',
    )
    expect(src).toContain('maxEntries: 24')
    expect(src).toContain(
      "globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2,webmanifest,txt}']",
    )
  })
})
