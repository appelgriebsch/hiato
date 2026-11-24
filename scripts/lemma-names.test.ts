import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, test } from 'bun:test'
import { isDeniedLemma } from './lemma-denylist'
import { loadNameAllowlist, loadNameList, nameAllowed, onNameList, parseNameAllowlist } from './lemma-names'

describe('person-name list', () => {
  const names = loadNameList()

  test('non-empty hangman-length NFC uppercase entries', () => {
    expect(names.size).toBeGreaterThan(1000)
    for (const w of names) {
      expect(w).toBe(w.normalize('NFC'))
      expect(w.length).toBeGreaterThanOrEqual(3)
      expect(w.length).toBeLessThanOrEqual(10)
    }
  })

  test('exact match is case-insensitive via nfcUpper', () => {
    expect(onNameList('JOHN', names)).toBe(true)
    expect(onNameList('john', names)).toBe(true)
    expect(onNameList('Maria', names)).toBe(true)
  })

  test('exact match only — no substring (ANNA does not match SUPERANNA)', () => {
    expect(onNameList('ANNA', names)).toBe(true)
    expect(onNameList('SUPERANNA', names)).toBe(false)
    expect(onNameList('ANNAPOLIS', names)).toBe(false)
    expect(onNameList('CLASSROOM', names)).toBe(false)
    expect(onNameList('GRASS', names)).toBe(false)
    expect(onNameList('WATER', names)).toBe(false)
  })

  test('#366 allowlist keeps a common-word homograph and not a proper name', () => {
    const text = readFileSync(path.join(import.meta.dir, 'data', 'lemma-names-allow.txt'), 'utf8')
    const entries = parseNameAllowlist(text)
    const allow = loadNameAllowlist()
    expect(entries.length).toBe(allow.size)
    expect(nameAllowed('en', 'WILL', allow)).toBe(true)
    expect(nameAllowed('fr', 'KEVIN', allow)).toBe(false)
    expect(nameAllowed('fr', 'MARY', allow)).toBe(false)
    for (const e of entries) expect(onNameList(e.word, names)).toBe(true)
  })

  test('RYAN and JOEY live on the name list, not the NSFW denylist', () => {
    expect(onNameList('RYAN', names)).toBe(true)
    expect(onNameList('JOEY', names)).toBe(true)
    expect(isDeniedLemma('RYAN')).toBe(false)
    expect(isDeniedLemma('JOEY')).toBe(false)
  })
})

test('#170: inflected forms are exact denylist entries; look-alikes stay playable', () => {
  for (const w of [
    'NAZIS',
    'BOMBING',
    'GEWALTSAM',
    'PUTADA',
    'MORRERÁ',
    'NUAS',
    'MATOU',
    'MATEI',
    'MORREU',
    'MORREMOS',
    'MORRI',
    'MORTOS',
    'AFOGOU',
    'AFOGAMENTO',
    'HOMICIDA',
    'MUERA',
    'MUERTO',
    'ASESINAR',
  ]) {
    expect(isDeniedLemma(w)).toBe(true)
  }
  for (const w of ['HELLSTEN', 'BALADA', 'MORDER', 'NAZISMO']) {
    expect(isDeniedLemma(w)).toBe(false)
  }
})
