import { describe, expect, test } from 'bun:test'
import nspell from 'nspell'
import { italianSpell } from './it-spell'

describe('italian spell lookup', () => {
  test('suffix and elision prefix match nspell rules without expanding the affix', () => {
    const aff = [
      'SET UTF-8',
      'SFX A Y 2',
      'SFX A are o are',
      'SFX A are i [^icg]are',
      'PFX T Y 1',
      "PFX T 0 l' [aeiou]",
      'SFX B Y 1',
      'SFX B o i o',
      '',
    ].join('\n')
    const dic = ['5', 'amare/A', 'casa', 'amore/T', 'gatto/B', 'porto/TB'].join('\n')
    const ours = italianSpell(aff, dic)
    const ref = nspell(aff, dic)
    const probes = [
      'amare',
      'amo',
      'ami',
      'casa',
      'amore',
      "l'amore",
      'gatto',
      'gatti',
      'porto',
      'porti',
      "l'porto",
      "l'porti",
      'xyzzy',
      'amato',
    ]
    for (const word of probes) {
      expect(ours.correct(word)).toBe(ref.correct(word))
    }
    expect(ours.correct('amo')).toBe(true)
    expect(ours.correct("l'amore")).toBe(true)
    expect(ours.correct('xyzzy')).toBe(false)
  })

  test('dictionary-it accepts citation lemmas and rejects junk', async () => {
    const dict = (await import('dictionary-it')).default
    const t0 = Date.now()
    const spell = italianSpell(dict.aff, dict.dic)
    const built = Date.now() - t0
    expect(built).toBeLessThan(3000)
    expect(spell.correct('casa')).toBe(true)
    expect(spell.correct('andare')).toBe(true)
    expect(spell.correct('perché')).toBe(true)
    expect(spell.correct('xyzzy')).toBe(false)
    const probes = ['casa', 'andare', 'amare', 'amo', 'collo', 'computer', 'xyzzy', 'qwertyuiop']
    const t1 = Date.now()
    for (let i = 0; i < 200; i++) {
      for (const word of probes) spell.correct(word)
    }
    expect(Date.now() - t1).toBeLessThan(3000)
  })

  test('stems, suffixes, and l-elisions match nspell on a dictionary-it slice', async () => {
    const dict = (await import('dictionary-it')).default
    const text = Buffer.from(dict.dic).toString('utf8')
    const lines = text.split('\n')
    const subset = lines.slice(0, 250).join('\n')
    const ours = italianSpell(dict.aff, subset)
    const ref = nspell(Buffer.from(dict.aff), subset)
    const probes = new Set<string>(['xyzzy', 'casa', 'andare'])
    for (const line of lines.slice(1, 250)) {
      const slash = line.indexOf('/')
      const word = (slash < 0 ? line : line.slice(0, slash)).trim()
      if (!word || word.startsWith('/') || word.startsWith('#')) continue
      probes.add(word)
      if (word.endsWith('are')) probes.add(word.slice(0, -3) + 'o')
      if (word.endsWith('o')) probes.add(word.slice(0, -1) + 'i')
      if (/^[aeiouàèéìòù]/i.test(word)) probes.add(`l'${word}`)
    }
    for (const word of probes) {
      expect(ours.correct(word)).toBe(ref.correct(word))
    }
  })
})
