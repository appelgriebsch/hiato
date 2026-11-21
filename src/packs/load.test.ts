import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import {
  isPackCachedLocally,
  loadPack,
  localPackCacheKey,
  purgeLocalPacksExcept,
} from './load'

function installLocalStorageMock() {
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
  return mem
}

describe('purgeLocalPacksExcept (ADR 0006)', () => {
  let mem: Map<string, string>

  beforeEach(() => {
    mem = installLocalStorageMock()
  })

  afterEach(() => {
    mem.clear()
  })

  test('drops other-language pack keys, keeps selected', () => {
    localStorage.setItem(localPackCacheKey('en', 'a1'), '{"keep":true}')
    localStorage.setItem(localPackCacheKey('en', 'b1'), '{"keep":true}')
    localStorage.setItem(localPackCacheKey('en', 'c2'), '{"keep":true}')
    localStorage.setItem(localPackCacheKey('de', 'a1'), '{"drop":true}')
    localStorage.setItem(localPackCacheKey('pt', 'a2'), '{"drop":true}')
    localStorage.setItem(localPackCacheKey('pt', 'c2'), '{"drop":true}')

    purgeLocalPacksExcept('en')

    expect(localStorage.getItem(localPackCacheKey('en', 'a1'))).not.toBeNull()
    expect(localStorage.getItem(localPackCacheKey('en', 'b1'))).not.toBeNull()
    expect(localStorage.getItem(localPackCacheKey('en', 'c2'))).not.toBeNull()
    expect(localStorage.getItem(localPackCacheKey('de', 'a1'))).toBeNull()
    expect(localStorage.getItem(localPackCacheKey('pt', 'a2'))).toBeNull()
    expect(localStorage.getItem(localPackCacheKey('pt', 'c2'))).toBeNull()
  })
})

describe('isPackCachedLocally (#103)', () => {
  let mem: Map<string, string>

  beforeEach(() => {
    mem = installLocalStorageMock()
  })

  afterEach(() => {
    mem.clear()
  })

  test('false when missing or corrupt; true for a valid pack JSON', () => {
    expect(isPackCachedLocally('en', 'a1')).toBe(false)
    localStorage.setItem(localPackCacheKey('en', 'a1'), '{not-json')
    expect(isPackCachedLocally('en', 'a1')).toBe(false)
    // Poison key discarded on corrupt JSON (#103 Avery W8)
    expect(localStorage.getItem(localPackCacheKey('en', 'a1'))).toBeNull()
    const pack = {
      version: 1,
      lang: 'en',
      cefr: 'a1',
      license: 'CC0',
      attribution: [],
      lemmas: [{ word: 'CAT', gloss: 'a small pet' }],
    }
    localStorage.setItem(localPackCacheKey('en', 'a1'), JSON.stringify(pack))
    expect(isPackCachedLocally('en', 'a1')).toBe(true)
  })
})

describe('loadPack stale-cache handling (ADR 0055 rollout / #319)', () => {
  let mem: Map<string, string>
  let origFetch: typeof fetch

  beforeEach(() => {
    mem = installLocalStorageMock()
    origFetch = globalThis.fetch
  })

  afterEach(() => {
    mem.clear()
    globalThis.fetch = origFetch
    // navigator.onLine does not exist on Bun's navigator — remove the mock.
    delete (globalThis.navigator as { onLine?: boolean }).onLine
  })

  /** Pre-ADR 0055 pack: no pos/ipa/family on the lemma. */
  const stalePack = (lang: 'de' | 'es') => ({
    version: 1,
    lang,
    cefr: 'a1' as const,
    license: 'CC-BY-SA-4.0',
    attribution: [],
    lemmas: [{ word: 'ALT', gloss: 'old gloss' }],
  })

  test('online with a stale cached version fetches the fresh pack and replaces the cache (W4)', async () => {
    localStorage.setItem(localPackCacheKey('de', 'a1'), JSON.stringify(stalePack('de')))
    const fresh = {
      ...stalePack('de'),
      version: 2,
      lemmas: [
        { word: 'ALT', gloss: 'old gloss', pos: 'adjective', ipa: '/alt/', family: ['alter'] },
      ],
    }
    globalThis.fetch = (async () =>
      new Response(JSON.stringify(fresh), { status: 200 })) as typeof fetch

    const pack = await loadPack('de', 'a1')

    expect(pack.version).toBe(2)
    expect(pack.lemmas[0]?.pos).toBe('adjective')
    const stored = JSON.parse(localStorage.getItem(localPackCacheKey('de', 'a1'))!)
    expect(stored.version).toBe(2)
    expect(stored.lemmas[0].ipa).toBe('/alt/')
  })

  test('offline falls back to the stale cached pack, which still parses without the extras', async () => {
    localStorage.setItem(localPackCacheKey('es', 'a1'), JSON.stringify(stalePack('es')))
    Object.defineProperty(globalThis.navigator, 'onLine', {
      configurable: true,
      value: false,
    })
    globalThis.fetch = (async () => {
      throw new Error('offline')
    }) as typeof fetch

    const pack = await loadPack('es', 'a1')

    expect(pack.version).toBe(1)
    // Graceful degradation: optional ADR 0055 fields are simply absent.
    expect(pack.lemmas[0]?.pos).toBeUndefined()
    expect(pack.lemmas[0]?.ipa).toBeUndefined()
    expect(pack.lemmas[0]?.family).toBeUndefined()
  })
})
