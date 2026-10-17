import { describe, expect, test } from 'bun:test'
import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import {
  loadAccentAllowlist,
  packDupeErrors,
  parseAccentAllowlist,
  type AccentAllowlist,
  type DupeFile,
} from './pack-dupes'

function file(rel: string, lang: string, words: string[]): DupeFile {
  return { rel, lang, lemmas: words.map((word) => ({ word })) }
}

const empty: AccentAllowlist = {}

describe('pack dupes', () => {
  test('a same-word duplicate across a1/a2 fails', () => {
    const errors = packDupeErrors(
      [file('en/a1.json', 'en', ['BOOK']), file('en/a2.json', 'en', ['BOOK'])],
      empty,
    )
    expect(errors).toHaveLength(1)
    expect(errors[0]).toContain('BOOK')
    expect(errors[0]).toContain('en/a1.json')
    expect(errors[0]).toContain('en/a2.json')
  })

  test('an accent-only pair across packs fails, and passes when allowlisted', () => {
    const files = [file('pt/a1.json', 'pt', ['PAIS']), file('pt/a2.json', 'pt', ['PAÍS'])]
    const blocked = packDupeErrors(files, empty)
    expect(blocked).toHaveLength(1)
    expect(blocked[0]).toContain('PAIS')
    expect(blocked[0]).toContain('PAÍS')
    expect(blocked[0]).toContain('pt/a1.json')
    expect(blocked[0]).toContain('pt/a2.json')
    const allow = parseAccentAllowlist({
      pt: [{ words: ['PAIS', 'PAÍS'], reason: 'PAIS means parents; PAÍS means country.' }],
    })
    expect(packDupeErrors(files, allow)).toEqual([])
  })

  test('an unused allowlist entry fails', () => {
    const errors = packDupeErrors(
      [file('pt/a1.json', 'pt', ['CASA'])],
      parseAccentAllowlist({
        pt: [{ words: ['PAIS', 'PAÍS'], reason: 'PAIS means parents; PAÍS means country.' }],
      }),
    )
    expect(errors).toHaveLength(1)
    expect(errors[0]).toContain('unused')
    expect(errors[0]).toContain('PAIS')
    expect(errors[0]).toContain('PAÍS')
  })

  test('DE ß/SS and FR È/É follow foldKey', () => {
    const de = packDupeErrors(
      [file('de/a1.json', 'de', ['STRASSE']), file('de/a2.json', 'de', ['STRAßE'])],
      empty,
    )
    expect(de.some((e) => e.includes('fold-key') && e.includes('STRASSE') && e.includes('STRAßE'))).toBe(
      true,
    )
    expect(de.some((e) => e.includes('accent-only'))).toBe(false)

    const fr = packDupeErrors(
      [file('fr/a1.json', 'fr', ['ÉVÉNEMENT']), file('fr/a2.json', 'fr', ['ÉVÈNEMENT'])],
      empty,
    )
    expect(fr.some((e) => e.includes('fold-key') && e.includes('ÉVÉNEMENT') && e.includes('ÉVÈNEMENT'))).toBe(
      true,
    )
    expect(fr.some((e) => e.includes('accent-only'))).toBe(false)
  })

  test('an in-pack accent-only pair fails unless allowlisted', () => {
    const files = [file('it/a1.json', 'it', ['PAPA', 'PAPÀ'])]
    const blocked = packDupeErrors(files, empty)
    expect(blocked).toHaveLength(1)
    expect(blocked[0]).toContain('PAPA')
    expect(blocked[0]).toContain('PAPÀ')
    expect(blocked[0]).toContain('it/a1.json')
    const allow = parseAccentAllowlist({
      it: [{ words: ['PAPA', 'PAPÀ'], reason: 'PAPA means the pope; PAPÀ means dad.' }],
    })
    expect(packDupeErrors(files, allow)).toEqual([])
  })

  test('shipped packs have no fold-key or accent-only violations', () => {
    const root = path.join(import.meta.dir, '..', 'public', 'packs')
    const files: DupeFile[] = []
    for (const lang of readdirSync(root)) {
      const dir = path.join(root, lang)
      for (const name of readdirSync(dir)) {
        if (!name.endsWith('.json')) continue
        const pack = JSON.parse(readFileSync(path.join(dir, name), 'utf8')) as {
          lang: string
          lemmas: { word: string }[]
        }
        files.push({ rel: `${lang}/${name}`, lang: pack.lang, lemmas: pack.lemmas })
      }
    }
    expect(packDupeErrors(files, loadAccentAllowlist())).toEqual([])
  })
})
