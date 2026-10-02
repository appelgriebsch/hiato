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
  test('_redirects is SPA-only; pack 404s are the Pages Function', async () => {
    const text = await Bun.file(
      new URL('../../public/_redirects', import.meta.url),
    ).text()
    const lines = text
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith('#'))
    expect(lines.some((l) => l.startsWith('/packs/*'))).toBe(false)
    expect(lines.find((l) => l.startsWith('/*'))).toMatch(/\/index\.html\s+200/)
    expect(text).toContain('functions/packs/[[path]].ts')
  })

  test('_routes.json invokes Functions only for /api/* and /packs/*', async () => {
    const routes = JSON.parse(
      await Bun.file(
        new URL('../../public/_routes.json', import.meta.url),
      ).text(),
    ) as { version: number; include: string[]; exclude: string[] }
    expect(routes.version).toBe(1)
    expect(routes.include).toEqual(['/api/*', '/packs/*'])
    expect(routes.include).not.toContain('/*')
    expect(routes.exclude).toEqual([])
  })

  test('Workbox pack cache refuses non-JSON 200s', async () => {
    const vite = await Bun.file(
      new URL('../../vite.config.ts', import.meta.url),
    ).text()
    expect(vite).toContain('cacheWillUpdate')
    expect(vite).toContain('application/json')
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

  test('pack Pages Function passes 304 and JSON with charset', async () => {
    const { onRequest } = await import('../../functions/packs/[[path]].ts')
    const notModified = await onRequest({
      next: async () => new Response(null, { status: 304 }),
    })
    expect(notModified.status).toBe(304)

    const json = await onRequest({
      next: async () =>
        new Response('{}', {
          status: 200,
          headers: { 'content-type': 'application/json; charset=utf-8' },
        }),
    })
    expect(json.status).toBe(200)

    const plain = await onRequest({
      next: async () =>
        new Response('nope', {
          status: 200,
          headers: { 'content-type': 'text/plain' },
        }),
    })
    expect(plain.status).toBe(404)
    expect(plain.headers.get('cache-control')).toBe('no-store')
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
