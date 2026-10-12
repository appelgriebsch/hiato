import { afterEach, expect, test } from 'bun:test'
import path from 'node:path'
import { precacheSelectedLanguage } from './cache'

const ROOT = path.join(import.meta.dir, '../../public/packs')
const origFetch = globalThis.fetch

afterEach(() => {
  globalThis.fetch = origFetch
  delete (globalThis as { caches?: unknown }).caches
})

test('picker caches packs: a CEFR change does not re-fetch the language (#190)', async () => {
  const mem = new Map<string, string>()
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    writable: true,
    value: {
      getItem: (k: string) => mem.get(k) ?? null,
      setItem: (k: string, v: string) => void mem.set(k, v),
      removeItem: (k: string) => void mem.delete(k),
    },
  })
  let fetches = 0
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    fetches++
    const m = String(input).match(/\/packs\/es\/(a1|a2|b1|b2|c1|c2)\.json$/)
    if (!m) return new Response('Not Found', { status: 404 })
    return new Response(await Bun.file(path.join(ROOT, 'es', `${m[1]}.json`)).text())
  }) as typeof fetch
  let adds = 0
  const cache = { add: async () => void adds++, keys: async () => [], delete: async () => true }
  Object.defineProperty(globalThis, 'caches', {
    configurable: true,
    value: { open: async () => cache },
  })

  expect(await precacheSelectedLanguage('es', 'a1')).toBe(true)
  expect([fetches, adds]).toEqual([6, 6])
  expect(await precacheSelectedLanguage('es', 'b2')).toBe(true)
  expect(await precacheSelectedLanguage('es', 'c1')).toBe(true)
  expect([fetches, adds]).toEqual([6, 6])
})
