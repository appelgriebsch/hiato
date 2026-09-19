import { describe, expect, test } from 'bun:test'
import { spoilerContains } from './spoilers'

describe('spoilerContains (ADR 0023)', () => {
  test('detects lemma as whole word in gloss', () => {
    expect(spoilerContains('A sweet APPLE from the tree.', 'APPLE')).toBe(true)
    expect(spoilerContains('apple pie recipe', 'APPLE')).toBe(true)
  })

  test('allows lemma as substring of a longer word', () => {
    expect(spoilerContains('pineapple juice', 'APPLE')).toBe(false)
    expect(spoilerContains('household chores', 'HOUSE')).toBe(false)
  })

  test('empty needle is never a spoiler', () => {
    expect(spoilerContains('anything', '')).toBe(false)
    expect(spoilerContains('anything', '   ')).toBe(false)
  })

  test('NFC-normalized accented lemmas', () => {
    const decomposed = 'cafe\u0301' // e + combining acute
    expect(spoilerContains('Visit the café tomorrow', decomposed)).toBe(true)
    expect(spoilerContains('cafeteria nearby', 'café')).toBe(false)
  })
})
