import { describe, expect, test } from 'bun:test'
import { isDeniedLemma } from './lemma-denylist'
import { loadNameList, onNameList } from './lemma-names'

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

  test('RYAN and JOEY live on the name list, not the NSFW denylist', () => {
    expect(onNameList('RYAN', names)).toBe(true)
    expect(onNameList('JOEY', names)).toBe(true)
    expect(isDeniedLemma('RYAN')).toBe(false)
    expect(isDeniedLemma('JOEY')).toBe(false)
  })
})

test('#170: inflected forms are exact denylist entries; look-alikes stay playable', () => {
  for (const w of ['NAZIS', 'BOMBING', 'GEWALTSAM', 'PUTADA', 'MORRERÁ', 'NUAS']) {
    expect(isDeniedLemma(w)).toBe(true)
  }
  for (const w of ['HELLSTEN', 'BALADA', 'MORDER', 'NAZISMO']) {
    expect(isDeniedLemma(w)).toBe(false)
  }
})
