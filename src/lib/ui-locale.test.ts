import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import {
  UI_LOCALE_STORAGE_KEY,
  deviceUiLocale,
  getUiLocale,
  getUiLocaleSetting,
  setUiLocale,
  subscribeUiLocale,
} from './ui-locale'

const g = globalThis as Record<string, unknown>
const savedGlobals = {
  window: g.window,
  localStorage: g.localStorage,
  navigator: g.navigator,
}

function restoreGlobals() {
  for (const [key, value] of Object.entries(savedGlobals)) {
    if (value === undefined) {
      delete g[key]
    } else {
      g[key] = value
    }
  }
}

let mem: Map<string, string>

function installLocalStorageMock() {
  mem = new Map<string, string>()
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
}

type StorageListener = (e: { key: string | null }) => void
// File-scoped: ui-locale hooks window.storage once, so the listener set must
// survive the per-test window mock reinstall.
const storageListeners: Set<StorageListener> = new Set()

function installWindowMock() {
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    writable: true,
    value: {
      addEventListener: (type: string, fn: StorageListener) => {
        if (type === 'storage') storageListeners.add(fn)
      },
      removeEventListener: (type: string, fn: StorageListener) => {
        if (type === 'storage') storageListeners.delete(fn)
      },
    },
  })
}

function installNavigatorMock(languages: string[] | undefined, language?: string) {
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    writable: true,
    value: { languages, language },
  })
}

function fireStorage(key: string | null) {
  for (const fn of [...storageListeners]) fn({ key })
}

beforeEach(() => {
  installLocalStorageMock()
  installWindowMock()
  installNavigatorMock(['en-US'], 'en-US')
})

afterEach(() => {
  restoreGlobals()
})

describe('ui-locale storage validation (ADR 0063 / #379)', () => {
  test('missing key means System, resolved from the device locale', () => {
    expect(getUiLocaleSetting()).toBe('system')
    expect(getUiLocale()).toBe('en')
  })

  test('corrupt or wrong-shaped values fall back to System', () => {
    for (const raw of ['not json', '"pt"', '{"v":2,"locale":"pt"}', '{"v":1}', '{"v":1,"locale":"xx"}', '{"v":1,"locale":42}', 'null']) {
      mem.set(UI_LOCALE_STORAGE_KEY, raw)
      expect(getUiLocaleSetting(), raw).toBe('system')
      expect(getUiLocale(), raw).toBe('en')
    }
  })

  test('a valid override wins over the device locale', () => {
    mem.set(UI_LOCALE_STORAGE_KEY, JSON.stringify({ v: 1, locale: 'de' }))
    expect(getUiLocaleSetting()).toBe('de')
    expect(getUiLocale()).toBe('de')
  })

  test('null locale is System', () => {
    mem.set(UI_LOCALE_STORAGE_KEY, JSON.stringify({ v: 1, locale: null }))
    expect(getUiLocaleSetting()).toBe('system')
  })
})

describe('device locale resolution', () => {
  test('prefix-matches the first supported navigator.languages entry (pt-BR -> pt)', () => {
    installNavigatorMock(['pt-BR', 'en-US'], 'pt-BR')
    expect(deviceUiLocale()).toBe('pt')
    expect(getUiLocale()).toBe('pt')
  })

  test('skips unsupported entries (xx, then fr)', () => {
    installNavigatorMock(['xx-YY', 'fr-CA'], 'xx-YY')
    expect(deviceUiLocale()).toBe('fr')
  })

  test('unsupported everything falls back to en; missing navigator too', () => {
    installNavigatorMock(['ja-JP'], 'ja-JP')
    expect(deviceUiLocale()).toBe('en')
    installNavigatorMock(undefined, undefined)
    expect(deviceUiLocale()).toBe('en')
  })

  test('falls back to navigator.language when languages is empty', () => {
    installNavigatorMock([], 'es-ES')
    expect(deviceUiLocale()).toBe('es')
  })
})

describe('setUiLocale', () => {
  test('writes the versioned key and notifies subscribers', () => {
    let calls = 0
    const unsub = subscribeUiLocale(() => {
      calls += 1
    })
    setUiLocale('pt')
    expect(mem.get(UI_LOCALE_STORAGE_KEY)).toBe(JSON.stringify({ v: 1, locale: 'pt' }))
    expect(getUiLocale()).toBe('pt')
    expect(getUiLocaleSetting()).toBe('pt')
    expect(calls).toBe(1)
    unsub()
    setUiLocale('de')
    expect(calls).toBe(1)
  })

  test('system reset stores null and returns to device resolution', () => {
    setUiLocale('it')
    expect(getUiLocale()).toBe('it')
    installNavigatorMock(['de-DE'], 'de-DE')
    setUiLocale('system')
    expect(mem.get(UI_LOCALE_STORAGE_KEY)).toBe(JSON.stringify({ v: 1, locale: null }))
    expect(getUiLocaleSetting()).toBe('system')
    expect(getUiLocale()).toBe('de')
  })

  test('a storage event from another tab re-reads storage', () => {
    let calls = 0
    const unsub = subscribeUiLocale(() => {
      calls += 1
    })
    mem.set(UI_LOCALE_STORAGE_KEY, JSON.stringify({ v: 1, locale: 'fr' }))
    fireStorage(UI_LOCALE_STORAGE_KEY)
    expect(calls).toBe(1)
    expect(getUiLocale()).toBe('fr')
    // unrelated keys are ignored
    fireStorage('hiato.prefs')
    expect(calls).toBe(1)
    unsub()
  })

  test('never reads or writes hiato.prefs (pack language / CEFR stay untouched)', () => {
    mem.set('hiato.prefs', JSON.stringify({ lang: 'en', cefr: 'a1' }))
    setUiLocale('es')
    setUiLocale('system')
    expect(mem.get('hiato.prefs')).toBe(JSON.stringify({ lang: 'en', cefr: 'a1' }))
    expect([...mem.keys()].filter((k) => k === 'hiato.prefs')).toHaveLength(1)
    expect(mem.get(UI_LOCALE_STORAGE_KEY)).toBe(JSON.stringify({ v: 1, locale: null }))
  })

  test('a failed write (private mode / quota) keeps this tab in memory, like sound.ts', () => {
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      writable: true,
      value: {
        getItem: () => null,
        setItem: () => {
          throw new Error('QuotaExceededError')
        },
        removeItem: () => {},
        clear: () => {},
      },
    })
    setUiLocale('pt')
    expect(getUiLocaleSetting()).toBe('pt')
    expect(getUiLocale()).toBe('pt')
    setUiLocale('system')
    expect(getUiLocaleSetting()).toBe('system')
    expect(getUiLocale()).toBe('en')
    // storage recovers: the next write persists again and clears the fallback
    installLocalStorageMock()
    setUiLocale('de')
    expect(mem.get(UI_LOCALE_STORAGE_KEY)).toBe(JSON.stringify({ v: 1, locale: 'de' }))
    expect(getUiLocale()).toBe('de')
    expect(getUiLocaleSetting()).toBe('de')
  })
})
