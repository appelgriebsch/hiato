import { describe, expect, test } from 'bun:test'
import { selectItBands } from './fr-pack'

function row(lemma: string, rank: number, pos = 'NOUN') {
  return { lemma, pos, rank }
}

describe('selectItBands', () => {
  test('keeps infinitives, drops fused forms and off-pad accents, no cross-band borrow', () => {
    const plan = selectItBands(
      [
        row('andare', 1, 'VERB'),
        row('andato', 2, 'VERB'),
        row('casa', 3),
        row('del', 4),
        row('perché', 5),
        row('sí', 6),
        row('più', 7),
        row('mare', 8),
        row('libro', 9),
        row('tradurre', 10, 'VERB'),
      ],
      {
        inflectedVerbs: new Set(['ANDATO']),
        accept: () => true,
        target: 3,
        surplus: 0,
        rankCeiling: { a1: 4, a2: 8, b1: 20 },
        indexBands: { b2: [6, 8], c1: [8, 9], c2: [9, 12] },
      },
    )
    const all = Object.values(plan.bands).flat()
    expect(all).toContain('ANDARE')
    expect(all).not.toContain('ANDATO')
    expect(all).toContain('MARE')
    expect(all).toContain('TRADURRE')
    expect(all).not.toContain('DEL')
    expect(all).not.toContain('SÍ')
    expect(all).toContain('PERCHÉ')
    expect(all).toContain('PIÙ')
    expect(plan.bands.a2).not.toContain('ANDARE')
    expect(plan.bands.b2).not.toContain('ANDARE')
  })
})
