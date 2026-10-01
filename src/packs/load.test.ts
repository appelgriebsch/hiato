import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import {
  isPackCachedLocally,
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
