import { describe, expect, test } from 'bun:test'
import { agreeingPos, parseJsonObject, toPackPos } from './apply-lemma-pos'

describe('apply-lemma-pos --fill-exempt helpers (ADR 0055 amended, #339)', () => {
  test('toPackPos accepts PackPos codes and UPOS tags, rejects the rest', () => {
    expect(toPackPos('noun')).toBe('noun')
    expect(toPackPos(' VERB ')).toBe('verb')
    expect(toPackPos('ADJ')).toBe('adjective')
    expect(toPackPos('Adv')).toBe('adverb')
    expect(toPackPos('PRON')).toBeNull()
    expect(toPackPos('pronoun')).toBeNull()
    expect(toPackPos(42)).toBeNull()
    expect(toPackPos('')).toBeNull()
  })

  test('parseJsonObject extracts one JSON object from prose, null otherwise', () => {
    expect(parseJsonObject('{"CASA": "noun"}')).toEqual({ CASA: 'noun' })
    expect(parseJsonObject('Sure! {"CASA": "NOUN", "PATO": "NOUN"} — done')).toEqual({
      CASA: 'NOUN',
      PATO: 'NOUN',
    })
    expect(parseJsonObject('no json here')).toBeNull()
    expect(parseJsonObject('[1,2]')).toBeNull()
    expect(parseJsonObject('{broken')).toBeNull()
  })

  test('agreeingPos keeps only tag+verify agreements, keyed by nfcUpper word', () => {
    const proposed = new Map([
      ['CASA', 'noun' as const],
      ['PATO', 'noun' as const],
      ['VOAR', 'verb' as const],
    ])
    const verified = { CASA: 'NOUN', PATO: 'verb', OTHER: 'noun' }
    expect([...agreeingPos(proposed, verified).entries()]).toEqual([['CASA', 'noun']])
    expect(agreeingPos(proposed, null).size).toBe(0)
  })
})
