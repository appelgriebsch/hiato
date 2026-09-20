import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { localPackCacheKey, purgeLocalPacksExcept } from './load'

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
    localStorage.setItem(localPackCacheKey('de', 'a1'), '{"drop":true}')
    localStorage.setItem(localPackCacheKey('pt', 'a2'), '{"drop":true}')

    purgeLocalPacksExcept('en')

    expect(localStorage.getItem(localPackCacheKey('en', 'a1'))).not.toBeNull()
    expect(localStorage.getItem(localPackCacheKey('en', 'b1'))).not.toBeNull()
    expect(localStorage.getItem(localPackCacheKey('de', 'a1'))).toBeNull()
    expect(localStorage.getItem(localPackCacheKey('pt', 'a2'))).toBeNull()
  })
})
