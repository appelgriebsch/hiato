import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, test } from 'bun:test'
import { isDeniedLemma, nfcUpper } from './lemma-denylist'
import {
  listedNameRejected,
  loadNameAllowlist,
  loadNameList,
  nameAllowed,
  onNameList,
  parseNameAllowlist,
} from './lemma-names'

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
    expect(nameAllowed('de', 'MARK', allow)).toBe(true)
    expect(nameAllowed('fr', 'KEVIN', allow)).toBe(false)
    expect(nameAllowed('fr', 'MARY', allow)).toBe(false)
    expect(listedNameRejected('fr', 'KEVIN', names, allow)).toBe(true)
    expect(listedNameRejected('fr', 'MARIE', names, allow)).toBe(true)
    expect(listedNameRejected('de', 'MARK', names, allow)).toBe(false)
    expect(text.includes('not a proper-name headword')).toBe(false)
    expect(nameAllowed('en', 'WILL', allow)).toBe(false)
    expect(nameAllowed('en', 'MARK', allow)).toBe(false)
    for (const e of entries) expect(onNameList(e.word, names)).toBe(true)
  })

  test('RYAN and JOEY live on the name list, not the NSFW denylist', () => {
    expect(onNameList('RYAN', names)).toBe(true)
    expect(onNameList('JOEY', names)).toBe(true)
    expect(isDeniedLemma('RYAN')).toBe(false)
    expect(isDeniedLemma('JOEY')).toBe(false)
  })

  test('#369 R1: slots 400+ lines carry a person-written reason, not a gloss copy', () => {
    // The fr and it lines are rewritten by their own language issues (#360, #361).
    const delegated = new Set(['fr', 'it'])
    const text = readFileSync(path.join(import.meta.dir, 'data', 'lemma-names-allow.txt'), 'utf8')
    const packsRoot = path.join(import.meta.dir, '..', 'public', 'packs')
    const packsByLang = new Map<string, { word: string; gloss?: string }[][]>()
    for (const lang of readdirSync(packsRoot)) {
      const packs: { word: string; gloss?: string }[][] = []
      for (const name of readdirSync(path.join(packsRoot, lang))) {
        if (!name.endsWith('.json')) continue
        const pack = JSON.parse(readFileSync(path.join(packsRoot, lang, name), 'utf8')) as {
          lemmas: { word: string; gloss?: string }[]
        }
        packs.push(pack.lemmas)
      }
      packsByLang.set(lang, packs)
    }
    const squash = (s: string) => s.replace(/\s+/g, ' ').trim()
    let checked = 0
    for (const e of parseNameAllowlist(text)) {
      if (delegated.has(e.lang)) continue
      const m = /slot (\d+)/.exec(e.reason)
      if (!m) continue
      const slot = Number(m[1])
      if (slot < 400) continue
      for (const lemmas of packsByLang.get(e.lang) ?? []) {
        const at = lemmas[slot]
        if (!at || nfcUpper(at.word) !== e.word) continue
        const gloss = squash(at.gloss ?? '')
        if (gloss) {
          checked += 1
          if (squash(e.reason).includes(gloss)) {
            throw new Error(
              `${e.lang} ${e.word}: slots 400+ reason must be person-written, not the gloss of slot ${slot}`,
            )
          }
        }
      }
    }
    expect(checked).toBeGreaterThan(0)
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
