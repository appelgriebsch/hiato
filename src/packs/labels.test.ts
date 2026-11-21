import { describe, expect, test } from 'bun:test'
import { POS_LABELS, posLabel } from './labels'
import { PACK_LANGS, PACK_POS, type PackLang } from './schema'

describe('POS_LABELS (ADR 0055 / #318)', () => {
  test('covers every pack language × POS code with a non-empty label', () => {
    expect(Object.keys(POS_LABELS).sort()).toEqual([...PACK_LANGS].sort())
    for (const lang of PACK_LANGS) {
      expect(Object.keys(POS_LABELS[lang]).sort()).toEqual([...PACK_POS].sort())
      for (const pos of PACK_POS) {
        const label = POS_LABELS[lang][pos]
        expect(typeof label).toBe('string')
        expect(label.trim().length).toBeGreaterThan(0)
      }
    }
  })

  test('labels are localized in the pack language (issue #318 examples)', () => {
    expect(POS_LABELS.en).toEqual({
      noun: 'noun',
      verb: 'verb',
      adjective: 'adjective',
      adverb: 'adverb',
    })
    expect(POS_LABELS.pt).toEqual({
      noun: 'substantivo',
      verb: 'verbo',
      adjective: 'adjetivo',
      adverb: 'adv\u00e9rbio',
    })
    expect(POS_LABELS.de.noun).toBe('Substantiv')
    expect(POS_LABELS.es.noun).toBe('sustantivo')
    expect(POS_LABELS.fr.verb).toBe('verbe')
    expect(POS_LABELS.it.adjective).toBe('aggettivo')
  })

  test('posLabel resolves per language and falls back to EN on a missing key', () => {
    expect(posLabel('en', 'noun')).toBe('noun')
    expect(posLabel('pt', 'adverb')).toBe('adv\u00e9rbio')
    expect(posLabel('de', 'verb')).toBe('Verb')
    expect(posLabel('xx' as PackLang, 'noun')).toBe('noun')
  })
})
