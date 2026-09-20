import { describe, expect, test } from 'bun:test'
import { packLangFromUrl, shouldPurgePackUrl } from './cache'
import { PACK_SW_CACHE } from './schema'

describe('selected-language pack URLs (ADR 0006)', () => {
  test('packLangFromUrl reads lang from path', () => {
    expect(packLangFromUrl('/packs/en/a1.json')).toBe('en')
    expect(packLangFromUrl('/packs/pt/b1.json')).toBe('pt')
    expect(packLangFromUrl('/packs/en/b2.json')).toBe('en')
    expect(packLangFromUrl('/packs/pt/c2.json')).toBe('pt')
    expect(packLangFromUrl('https://hiato.pages.dev/packs/de/a2.json')).toBe(
      'de',
    )
    expect(packLangFromUrl('/icons/icon-192.png')).toBeNull()
  })

  test('shouldPurgePackUrl keeps selected lang, drops others', () => {
    expect(shouldPurgePackUrl('/packs/en/a1.json', 'en')).toBe(false)
    expect(shouldPurgePackUrl('/packs/en/b1.json', 'en')).toBe(false)
    expect(shouldPurgePackUrl('/packs/en/b2.json', 'en')).toBe(false)
    expect(shouldPurgePackUrl('/packs/pt/c2.json', 'pt')).toBe(false)
    expect(shouldPurgePackUrl('/packs/de/a1.json', 'en')).toBe(true)
    expect(shouldPurgePackUrl('/packs/pt/c2.json', 'en')).toBe(true)
    expect(shouldPurgePackUrl('/packs/es/a2.json', 'pt')).toBe(true)
    expect(shouldPurgePackUrl('/sw.js', 'en')).toBe(false)
  })

  test('SW cache name is hiato-packs', () => {
    expect(PACK_SW_CACHE).toBe('hiato-packs')
  })
})
