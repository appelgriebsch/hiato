import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import {
  SOUND_STORAGE_KEY,
  getSoundOn,
  playCue,
  setSoundOn,
  subscribeSoundChange,
} from './sound'

const g = globalThis as Record<string, unknown>
const savedGlobals = {
  window: g.window,
  document: g.document,
  localStorage: g.localStorage,
  AudioContext: g.AudioContext,
  speechSynthesis: g.speechSynthesis,
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

/** Minimal window mock: bun test has no DOM, sound.ts only needs storage events. */
type StorageListener = (e: { key: string | null }) => void
let storageListeners: Set<StorageListener>

function installWindowMock() {
  storageListeners = new Set()
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
      dispatchEvent: (e: { type: string; key?: string | null }) => {
        if (e.type === 'storage') {
          for (const fn of [...storageListeners]) fn({ key: e.key ?? null })
        }
        return true
      },
    },
  })
}

/** Force the next getSoundOn() to re-read storage (what a storage event does). */
function invalidateSession() {
  window.dispatchEvent({ type: 'storage', key: SOUND_STORAGE_KEY })
}

/** Any AudioContext construction means a cue tried to play. */
let audioConstructed: number
let oscStarted: number
let originalAudioContext: unknown

function installAudioSpy() {
  audioConstructed = 0
  oscStarted = 0
  originalAudioContext = (globalThis as Record<string, unknown>).AudioContext
  const param = () => ({
    value: 0,
    setValueAtTime: () => {},
    linearRampToValueAtTime: () => {},
  })
  Object.defineProperty(globalThis, 'AudioContext', {
    configurable: true,
    writable: true,
    value: class {
      state = 'running'
      currentTime = 0
      destination = {}
      constructor() {
        audioConstructed += 1
      }
      resume() {
        return Promise.resolve()
      }
      createGain() {
        return { gain: param(), connect: () => {} }
      }
      createOscillator() {
        return {
          type: 'sine',
          frequency: param(),
          connect: () => {},
          start: () => {
            oscStarted += 1
          },
          stop: () => {},
        }
      }
    },
  })
}

function restoreAudio() {
  if (originalAudioContext === undefined) {
    delete (globalThis as Record<string, unknown>).AudioContext
  } else {
    Object.defineProperty(globalThis, 'AudioContext', {
      configurable: true,
      writable: true,
      value: originalAudioContext,
    })
  }
}

function setHidden(hidden: boolean) {
  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    writable: true,
    value: { hidden },
  })
}

describe('sound storage (hiato.sound, ADR 0052 §6)', () => {
  let mem: Map<string, string>

  beforeEach(() => {
    installWindowMock()
    mem = installLocalStorageMock()
    setSoundOn(false)
    mem.clear()
    subscribeSoundChange(() => {})
    invalidateSession()
  })

  afterEach(() => {
    mem.clear()
    setSoundOn(false)
    mem.clear()
    restoreGlobals()
  })

  test('missing storage means Off', () => {
    expect(getSoundOn()).toBe(false)
  })

  test('invalid or wrong-shaped storage means Off', () => {
    for (const bad of [
      'not json',
      '{}',
      '{"v":2,"on":true}',
      '{"v":1,"on":"yes"}',
      '{"v":1}',
      'null',
      'true',
    ]) {
      mem.set(SOUND_STORAGE_KEY, bad)
      invalidateSession()
      expect(getSoundOn()).toBe(false)
    }
  })

  test('unreadable storage (getItem throws) means Off', () => {
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      writable: true,
      value: {
        getItem: () => {
          throw new Error('denied')
        },
        setItem: () => {},
        removeItem: () => {},
        clear: () => {},
      },
    })
    invalidateSession()
    expect(getSoundOn()).toBe(false)
  })

  test('setSoundOn round-trips { v: 1, on }', () => {
    expect(getSoundOn()).toBe(false)
    setSoundOn(true)
    expect(mem.get(SOUND_STORAGE_KEY)).toBe('{"v":1,"on":true}')
    expect(getSoundOn()).toBe(true)
    setSoundOn(false)
    expect(mem.get(SOUND_STORAGE_KEY)).toBe('{"v":1,"on":false}')
    expect(getSoundOn()).toBe(false)
  })

  test('a failed write keeps the session state', () => {
    setSoundOn(true)
    const original = localStorage.setItem
    localStorage.setItem = () => {
      throw new Error('quota')
    }
    setSoundOn(false)
    expect(getSoundOn()).toBe(false)
    expect(mem.get(SOUND_STORAGE_KEY)).toBe('{"v":1,"on":true}')
    localStorage.setItem = original
  })

  test('getSoundOn reads storage, so another tab is seen with no subscriber', () => {
    setSoundOn(true)
    expect(getSoundOn()).toBe(true)
    mem.set(SOUND_STORAGE_KEY, '{"v":1,"on":false}')
    expect(getSoundOn()).toBe(false)
  })

  test('a storage event on hiato.sound updates this tab from storage', () => {
    setSoundOn(false)
    expect(getSoundOn()).toBe(false)
    mem.set(SOUND_STORAGE_KEY, '{"v":1,"on":true}')
    let calls = 0
    const unsub = subscribeSoundChange(() => {
      calls += 1
    })
    invalidateSession()
    unsub()
    expect(calls).toBe(1)
    expect(getSoundOn()).toBe(true)
  })
})

describe('playCue guards (ADR 0052 §6)', () => {
  let mem: Map<string, string>

  beforeEach(() => {
    installWindowMock()
    mem = installLocalStorageMock()
    installAudioSpy()
    setSoundOn(false)
    mem.clear()
    subscribeSoundChange(() => {})
    invalidateSession()
    setHidden(false)
    delete (globalThis as Record<string, unknown>).speechSynthesis
  })

  afterEach(() => {
    mem.clear()
    restoreAudio()
    setSoundOn(false)
    mem.clear()
    restoreGlobals()
  })

  test('does nothing when sound is off', () => {
    setSoundOn(false)
    playCue('win')
    expect(audioConstructed).toBe(0)
  })

  test('does nothing while the page is hidden', () => {
    setSoundOn(true)
    setHidden(true)
    playCue('win')
    expect(audioConstructed).toBe(0)
  })

  test('does nothing while speechSynthesis is speaking', () => {
    setSoundOn(true)
    Object.defineProperty(globalThis, 'speechSynthesis', {
      configurable: true,
      writable: true,
      value: { speaking: true },
    })
    playCue('key-correct')
    expect(audioConstructed).toBe(0)
  })

  test('builds the lazy context once when on, visible and not speaking', () => {
    setSoundOn(true)
    playCue('coin')
    expect(audioConstructed).toBe(1)
    playCue('win')
    expect(audioConstructed).toBe(1)
  })

  test('a cue stops after another tab turns sound off, with no subscriber', () => {
    setSoundOn(true)
    playCue('win')
    const started = oscStarted
    expect(started).toBeGreaterThan(0)
    mem.set(SOUND_STORAGE_KEY, '{"v":1,"on":false}')
    playCue('key-correct')
    expect(oscStarted).toBe(started)
  })
})
