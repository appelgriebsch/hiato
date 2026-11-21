import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { mistralFallback, toSlashIpa } from './lemma-extras'
import { installFixtureSpellersFromDir, resetDicts } from './lang-membership'
import { nfcUpper } from './lemma-denylist'

describe('lemma-extras toSlashIpa (wiktextract broad [..] -> narrow /../, ADR 0055)', () => {
  test('rewrites brackets to slashes', () => {
    expect(toSlashIpa('[ha\u028as]')).toBe('/ha\u028as/')
  })

  test('keeps the slash form unchanged', () => {
    expect(toSlashIpa('/\u02c8\u00e6k\u0283\u0259n/')).toBe('/\u02c8\u00e6k\u0283\u0259n/')
  })

  test('normalizes NFC and trims whitespace', () => {
    expect(toSlashIpa(' [kafe\u0301] ')).toBe('/kaf\u00e9/')
  })

  test('leaves other forms untouched', () => {
    expect(toSlashIpa('ha\u028as')).toBe('ha\u028as')
  })
})

const originalFetch = globalThis.fetch

function stubMistralReply(content: string): void {
  globalThis.fetch = (async () =>
    new Response(JSON.stringify({ choices: [{ message: { content } }] }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })) as typeof fetch
}

describe('lemma-extras mistralFallback', () => {
  beforeAll(() => installFixtureSpellersFromDir())
  afterAll(() => {
    resetDicts()
    globalThis.fetch = originalFetch
  })

  test('keys fills by nfcUpper(word) and matches model keys case-insensitively', async () => {
    stubMistralReply(
      JSON.stringify({
        house: { ipa: '/ha\u028as/', family: ['world', 'hello'] },
        HOTEL: { ipa: '/h\u0259\u028a\u02c8t\u025bl/' },
      }),
    )
    const filled = await mistralFallback('test-key', 'en', [
      { word: 'house', wantIpa: true, wantFamily: true },
      { word: 'hotel', wantIpa: true, wantFamily: false },
    ])
    const house = filled.get(nfcUpper('house'))
    expect(house?.ipa).toBe('/ha\u028as/')
    expect(house?.family).toEqual(['world', 'hello'])
    expect(filled.get(nfcUpper('hotel'))?.ipa).toBe('/h\u0259\u028a\u02c8t\u025bl/')
  })

  test('drops ipa that fails the slash-form gate even when wrapped', async () => {
    stubMistralReply(JSON.stringify({ house: { ipa: 'not ipa at all!' } }))
    const filled = await mistralFallback('test-key', 'en', [
      { word: 'house', wantIpa: true, wantFamily: false },
    ])
    expect(filled.get(nfcUpper('house'))?.ipa).toBeUndefined()
  })

  test('wraps a bare (slash-less) ipa transcription before the gate', async () => {
    stubMistralReply(JSON.stringify({ house: { ipa: 'ha\u028as' } }))
    const filled = await mistralFallback('test-key', 'en', [
      { word: 'house', wantIpa: true, wantFamily: false },
    ])
    expect(filled.get(nfcUpper('house'))?.ipa).toBe('/ha\u028as/')
  })

  test('parses a top-level array of {word, ipa, family} objects', async () => {
    stubMistralReply(
      JSON.stringify([
        { word: 'house', ipa: '/ha\u028as/', family: ['world', 'hello'] },
        { word: 'hotel', ipa: '/h\u0259\u028a\u02c8t\u025bl/' },
      ]),
    )
    const filled = await mistralFallback('test-key', 'en', [
      { word: 'house', wantIpa: true, wantFamily: true },
      { word: 'hotel', wantIpa: true, wantFamily: false },
    ])
    expect(filled.get(nfcUpper('house'))?.ipa).toBe('/ha\u028as/')
    expect(filled.get(nfcUpper('house'))?.family).toEqual(['world', 'hello'])
    expect(filled.get(nfcUpper('hotel'))?.ipa).toBe('/h\u0259\u028a\u02c8t\u025bl/')
  })

  test('parses a {"words": [...]} wrapper, markdown fences, prose, and a string family', async () => {
    stubMistralReply(
      '```json\nHere you go:\n' +
        JSON.stringify({ words: [{ word: 'house', ipa: '/ha\u028as/', family: 'hello' }] }) +
        '\n```',
    )
    const filled = await mistralFallback('test-key', 'en', [
      { word: 'house', wantIpa: true, wantFamily: true },
    ])
    expect(filled.get(nfcUpper('house'))?.ipa).toBe('/ha\u028as/')
    expect(filled.get(nfcUpper('house'))?.family).toEqual(['hello'])
  })

  test('unparseable reply yields no fills and does not throw', async () => {
    stubMistralReply('Sorry, I cannot help with that.')
    const filled = await mistralFallback('test-key', 'en', [
      { word: 'house', wantIpa: true, wantFamily: true },
    ])
    expect(filled.size).toBe(0)
  })
})
