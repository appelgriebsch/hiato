import { describe, expect, test } from 'bun:test'
import { toSlashIpa } from './lemma-extras'

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
