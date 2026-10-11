import { afterEach, describe, expect, test } from 'bun:test'
import path from 'node:path'
import { pickDailyLemma } from '../engine/daily'
import { precacheSelectedLanguage } from './cache'
import { loadPack } from './load'
import { isPackLang } from './schema'

const ROOT = path.join(import.meta.dir, '../../public/packs')

describe('IT daily round (ADR 0006)', () => {
  const origFetch = globalThis.fetch

  afterEach(() => {
    globalThis.fetch = origFetch
  })

  test('select Italiano, precache, then the round reads the pack', async () => {
    expect(isPackLang('it')).toBe(true)
    const mem = new Map<string, string>()
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      writable: true,
      value: {
        getItem: (k: string) => mem.get(k) ?? null,
        setItem: (k: string, v: string) => {
          mem.set(k, v)
        },
        removeItem: (k: string) => {
          mem.delete(k)
        },
        clear: () => {
          mem.clear()
        },
      },
    })
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = String(input)
      const m = url.match(/\/packs\/it\/(a1|a2|b1|b2|c1|c2)\.json$/)
      if (!m) return new Response('Not Found', { status: 404 })
      const text = await Bun.file(path.join(ROOT, 'it', `${m[1]}.json`)).text()
      return new Response(text, {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    }) as typeof fetch

    const ready = await precacheSelectedLanguage('it', 'a1')
    expect(ready).toBe(true)
    const pack = await loadPack('it', 'a1')
    expect(pack.lang).toBe('it')
    expect(pack.lemmas.length).toBeGreaterThan(10)
    const lemma = pickDailyLemma(pack.lemmas, '2026-10-11', 'it', 'a1')
    expect(pack.lemmas.some((L) => L.word === lemma.word)).toBe(true)
    expect(mem.get('hiato:pack:it:a1')).toBeTruthy()
  })
})
