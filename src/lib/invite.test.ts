import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  mock,
  test,
} from 'bun:test'
import * as realCache from '../packs/cache'
import type { PackCefr, PackLang } from '../packs/schema'
import { getPrefs } from './prefs'
import { buildShareCardPayload, type ShareCardPayload } from './share-card'

/**
 * The mock is registered in beforeAll (not at top level) so the static import
 * above still binds the real module. bun shares one module registry across test
 * files, so an unset stub delegates to the real precache instead of leaking.
 */
let precacheStub: boolean | null = null
const precacheCalls: [unknown, unknown][] = []
// Captured before mock.module swaps the namespace binding in place.
const realPrecacheSelectedLanguage = realCache.precacheSelectedLanguage

let invite: typeof import('./invite')

beforeAll(async () => {
  mock.module('@/packs/cache', () => ({
    ...realCache,
    precacheSelectedLanguage: async (lang: PackLang, cefr?: PackCefr) => {
      precacheCalls.push([lang, cefr])
      if (precacheStub !== null) return precacheStub
      return realPrecacheSelectedLanguage(lang, cefr)
    },
  }))
  invite = await import('./invite')
})

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

function dailyPayload(): ShareCardPayload {
  return buildShareCardPayload({
    lang: 'en',
    cefr: 'b1',
    streak: 3,
    dateKey: '2026-11-13',
    word: 'BANANA',
    won: true,
    mode: 'daily',
  })
}

function practicePayload(): ShareCardPayload {
  return buildShareCardPayload({
    lang: 'pt',
    cefr: 'a2',
    streak: 0,
    dateKey: '2026-11-13',
    word: 'AÇAO',
    won: false,
    mode: 'practice',
  })
}

describe('dailyInviteTarget (#226, ADR 0036 amendment)', () => {
  test('daily payload → invite target is the payload lang×cefr', () => {
    expect(invite.dailyInviteTarget(dailyPayload())).toEqual({
      lang: 'en',
      cefr: 'b1',
    })
  })

  test('practice payload → null (a Practice share is not today’s Daily, ADR 0018)', () => {
    expect(invite.dailyInviteTarget(practicePayload())).toBeNull()
  })
})

describe('acceptDailyInvite — consent is the tap', () => {
  let mem: Map<string, string>

  beforeEach(() => {
    mem = installLocalStorageMock()
    precacheStub = null
    precacheCalls.length = 0
  })

  afterEach(() => {
    mem.clear()
    precacheStub = null
  })

  test('precache failure → false and prefs untouched', async () => {
    precacheStub = false
    const target = invite.dailyInviteTarget(dailyPayload())!
    expect(await invite.acceptDailyInvite(target)).toBe(false)
    expect(precacheCalls).toEqual([['en', 'b1']])
    expect(getPrefs()).toBeNull()
    expect(mem.has('hiato.prefs')).toBe(false)
  })

  test('precache success → true and prefs equal the invite', async () => {
    precacheStub = true
    const target = invite.dailyInviteTarget(dailyPayload())!
    expect(await invite.acceptDailyInvite(target)).toBe(true)
    expect(precacheCalls).toEqual([['en', 'b1']])
    expect(getPrefs()).toEqual({ lang: 'en', cefr: 'b1' })
  })

  test('unmounted after precache → false and prefs untouched', async () => {
    precacheStub = true
    const target = invite.dailyInviteTarget(dailyPayload())!
    expect(await invite.acceptDailyInvite(target, () => false)).toBe(false)
    expect(precacheCalls).toEqual([['en', 'b1']])
    expect(getPrefs()).toBeNull()
    expect(mem.has('hiato.prefs')).toBe(false)
  })
})
