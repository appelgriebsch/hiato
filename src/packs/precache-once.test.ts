import { afterEach, beforeEach, expect, test } from 'bun:test'
import path from 'node:path'
import { precacheSelectedLanguage, resetPrecachedLang } from './cache'

const ROOT = path.join(import.meta.dir, '../../public/packs')
const origFetch = globalThis.fetch
const origLocal = Object.getOwnPropertyDescriptor(globalThis, 'localStorage')
let fetches = 0
let adds = 0
let failNextAdd = false

beforeEach(() => {
  resetPrecachedLang()
  fetches = adds = 0
  failNextAdd = false
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
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    fetches++
    const m = String(input).match(/\/packs\/es\/(a1|a2|b1|b2|c1|c2)\.json$/)
    if (!m) return new Response('Not Found', { status: 404 })
    return new Response(await Bun.file(path.join(ROOT, 'es', `${m[1]}.json`)).text())
  }) as typeof fetch
  const cache = {
    add: async () => {
      adds++
      if (failNextAdd) {
        failNextAdd = false
        throw new Error('offline')
      }
    },
    keys: async () => [],
    delete: async () => true,
  }
  Object.defineProperty(globalThis, 'caches', {
    configurable: true,
    value: { open: async () => cache },
  })
})

afterEach(() => {
  globalThis.fetch = origFetch
  delete (globalThis as { caches?: unknown }).caches
  if (origLocal) Object.defineProperty(globalThis, 'localStorage', origLocal)
  else delete (globalThis as { localStorage?: unknown }).localStorage
  resetPrecachedLang()
})

test('picker caches packs: a CEFR change does not re-fetch the language (#190)', async () => {
  expect(await precacheSelectedLanguage('es', 'a1')).toBe(true)
  const first = [fetches, adds]
  expect(adds).toBe(6)
  expect(await precacheSelectedLanguage('es', 'b2')).toBe(true)
  expect(await precacheSelectedLanguage('es', 'c1')).toBe(true)
  expect([fetches, adds]).toEqual(first)
})

test('a failed cache.add is retried on the next call (#199 W1)', async () => {
  failNextAdd = true
  expect(await precacheSelectedLanguage('es', 'a1')).toBe(true)
  expect(adds).toBe(6)
  expect(await precacheSelectedLanguage('es', 'b2')).toBe(true)
  expect(adds).toBe(12)
  expect(await precacheSelectedLanguage('es', 'c1')).toBe(true)
  expect(adds).toBe(12)
})
