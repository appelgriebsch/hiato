import { describe, expect, test } from 'bun:test'
import { foldKey } from './pack-select'
import { selectFrBands } from './fr-pack'

function row(lemma: string, rank: number, pos = 'NOUN') {
  return { lemma, pos, rank }
}

describe('selectFrBands', () => {
  test('keeps the more frequent È/É spelling and does not fold MÛR/MUR', () => {
    const plan = selectFrBands(
      [
        row('événement', 1),
        row('évènement', 2),
        row('mûr', 3),
        row('mur', 4),
        row('chat', 5),
        row('chien', 6),
        row('joue', 7, 'VERB'),
        row('fermé', 8, 'ADJ'),
        row('jusqu', 9),
        row('maison', 10),
      ],
      {
        inflectedVerbs: new Set(['JOUE']),
        accept: () => true,
        target: 3,
        surplus: 0,
        rankCeiling: { a1: 4, a2: 8, b1: 20 },
        indexBands: { b2: [6, 8], c1: [8, 9], c2: [9, 10] },
      },
    )
    expect(plan.bands.a1).toContain('ÉVÉNEMENT')
    expect(plan.bands.a1).not.toContain('ÉVÈNEMENT')
    expect(plan.bands.a1).toContain('MÛR')
    const all = Object.values(plan.bands).flat()
    expect(all.filter((w) => foldKey('fr', w) === foldKey('fr', 'MÛR'))).toEqual(['MÛR'])
    expect(all).toContain('MUR')
    expect(all).not.toContain('JOUE')
    expect(all).toContain('FERMÉ')
    expect(all).not.toContain('JUSQU')
    const seen = new Set<string>()
    for (const [band, words] of Object.entries(plan.bands)) {
      for (const w of words) {
        const key = `${band}:${foldKey('fr', w)}`
        expect(seen.has(foldKey('fr', w))).toBe(false)
        seen.add(foldKey('fr', w))
        expect(key.length).toBeGreaterThan(0)
      }
    }
  })

  test('raises a short band ceiling without borrowing back', () => {
    const rows = [
      row('chat', 1),
      row('chien', 2),
      row('maison', 3),
      row('livre', 4),
      row('table', 5),
    ]
    const plan = selectFrBands(rows, {
      inflectedVerbs: new Set(),
      accept: () => true,
      target: 3,
      surplus: 0,
      rankCeiling: { a1: 1, a2: 4, b1: 5 },
      indexBands: { b2: [4, 5], c1: [5, 5], c2: [5, 5] },
    })
    expect(plan.bands.a1).toEqual(['CHAT', 'CHIEN', 'MAISON'])
    expect(plan.ceilings.a1).toBe(3)
    expect(plan.bands.a2[0]).toBe('LIVRE')
    expect(plan.bands.a2).not.toContain('MAISON')
    expect(plan.bands.a2).not.toContain('CHAT')
    expect(plan.bands.b2).not.toContain('CHAT')
  })
})
