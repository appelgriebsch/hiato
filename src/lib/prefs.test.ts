import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { getPrefs, setPrefs } from './prefs'

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

describe('prefs (localStorage)', () => {
  let mem: Map<string, string>

  beforeEach(() => {
    mem = installLocalStorageMock()
  })

  afterEach(() => {
    mem.clear()
  })

  test('returns null when unset', () => {
    expect(getPrefs()).toBeNull()
  })

  test('round-trips lang + cefr', () => {
    setPrefs({ lang: 'pt', cefr: 'b1' })
    expect(getPrefs()).toEqual({ lang: 'pt', cefr: 'b1' })
  })

  test('rejects unknown lang/cefr', () => {
    localStorage.setItem(
      'hiato.prefs',
      JSON.stringify({ lang: 'fr', cefr: 'a1' }),
    )
    expect(getPrefs()).toBeNull()
    localStorage.setItem(
      'hiato.prefs',
      JSON.stringify({ lang: 'en', cefr: 'c2' }),
    )
    expect(getPrefs()).toBeNull()
  })

  test('rejects corrupt JSON', () => {
    localStorage.setItem('hiato.prefs', '{not json')
    expect(getPrefs()).toBeNull()
  })
})
