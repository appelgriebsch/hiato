import { describe, expect, test } from 'bun:test'
import { POCKET_CAP } from './pocket'
import {
  needsReplaceOldestConfirm,
  pocketConfirmLabel,
  shouldShowPocketSave,
} from './pocket-save'

describe('shouldShowPocketSave (ADR 0034 / #83)', () => {
  test('daily lose only', () => {
    expect(shouldShowPocketSave('daily', false)).toBe(true)
  })

  test('no Save on daily win (incl. hint-used wins)', () => {
    expect(shouldShowPocketSave('daily', true)).toBe(false)
  })

  test('no Save on practice lose or win', () => {
    expect(shouldShowPocketSave('practice', false)).toBe(false)
    expect(shouldShowPocketSave('practice', true)).toBe(false)
  })

  test('no Save on unknown / pocket modes', () => {
    expect(shouldShowPocketSave('pocket', false)).toBe(false)
    expect(shouldShowPocketSave('endless', false)).toBe(false)
  })
})

describe('needsReplaceOldestConfirm (ADR 0034 / #83)', () => {
  test('below cap → no confirm', () => {
    expect(needsReplaceOldestConfirm(0, false)).toBe(false)
    expect(needsReplaceOldestConfirm(POCKET_CAP - 1, false)).toBe(false)
  })

  test('at/above cap + new word → confirm', () => {
    expect(needsReplaceOldestConfirm(POCKET_CAP, false)).toBe(true)
    expect(needsReplaceOldestConfirm(POCKET_CAP + 1, false)).toBe(true)
  })

  test('duplicate in full slot → no confirm (idempotent keep-first)', () => {
    expect(needsReplaceOldestConfirm(POCKET_CAP, true)).toBe(false)
    expect(needsReplaceOldestConfirm(0, true)).toBe(false)
  })

  test('respects custom cap', () => {
    expect(needsReplaceOldestConfirm(3, false, 3)).toBe(true)
    expect(needsReplaceOldestConfirm(2, false, 3)).toBe(false)
  })
})

describe('pocketConfirmLabel (Avery Critical)', () => {
  test('uses a non-empty gloss', () => {
    expect(pocketConfirmLabel({ gloss: 'oldest meaning' })).toBe('oldest meaning')
  })

  test('never falls back to the lemma', () => {
    expect(pocketConfirmLabel({})).toBe('your oldest pocket entry')
    expect(pocketConfirmLabel({ gloss: '' })).toBe('your oldest pocket entry')
    expect(pocketConfirmLabel({ gloss: '   ' })).toBe('your oldest pocket entry')
  })
})
