import { describe, expect, test } from 'bun:test'
import { POCKET_CAP } from './pocket'
import {
  decideConfirmReCheck,
  needsReplaceOldestConfirm,
  pocketListLabel,
  pocketNoteCopy,
  pocketNoteFromState,
  pocketRetryHref,
  shouldShowPractice,
} from './pocket-save'

describe('shouldShowPractice (ADR 0043 / #219)', () => {
  test('daily lose only', () => {
    expect(shouldShowPractice('daily', false)).toBe(true)
  })

  test('no action on daily win (incl. hint-used wins)', () => {
    expect(shouldShowPractice('daily', true)).toBe(false)
  })

  test('no action on practice lose or win', () => {
    expect(shouldShowPractice('practice', false)).toBe(false)
    expect(shouldShowPractice('practice', true)).toBe(false)
  })

  test('no action on pocket / endless', () => {
    expect(shouldShowPractice('pocket', false)).toBe(false)
    expect(shouldShowPractice('endless', false)).toBe(false)
  })
})

describe('pocketNoteFromState (ADR 0043)', () => {
  test('saved and already only', () => {
    expect(pocketNoteFromState({ pocketNote: 'saved' })).toBe('saved')
    expect(pocketNoteFromState({ pocketNote: 'already' })).toBe('already')
    expect(pocketNoteFromState({ pocketNote: 'saved', extra: 1 })).toBe('saved')
  })

  test('ignores missing, foreign, and junk state', () => {
    expect(pocketNoteFromState(null)).toBe(null)
    expect(pocketNoteFromState(undefined)).toBe(null)
    expect(pocketNoteFromState('saved')).toBe(null)
    expect(pocketNoteFromState({ pocketNote: 'nope' })).toBe(null)
    expect(pocketNoteFromState({})).toBe(null)
  })
})

describe('pocketNoteCopy (ADR 0043)', () => {
  test('status lines', () => {
    expect(pocketNoteCopy('already')).toBe('Already saved')
    expect(pocketNoteCopy('saved')).toBe('Saved to pocket')
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

describe('pocketListLabel (#85)', () => {
  test('uses a non-empty gloss', () => {
    expect(pocketListLabel({ gloss: 'a house' })).toBe('a house')
  })

  test('blank or whitespace gloss hides the spelling', () => {
    expect(pocketListLabel({})).toBe('Meaning not saved')
    expect(pocketListLabel({ gloss: '' })).toBe('Meaning not saved')
    expect(pocketListLabel({ gloss: '   ' })).toBe('Meaning not saved')
  })
})

describe('pocketRetryHref (#85)', () => {
  test('encodes the id once and keeps the seed', () => {
    const id = 'es|a1|café'
    const href = pocketRetryHref(id, 1700000000000)
    expect(href).toBe(
      `/play?mode=pocket&id=${encodeURIComponent(id)}&seed=1700000000000`,
    )
    expect(href).not.toContain('%257C')
    const url = new URL(href, 'http://local')
    expect(url.searchParams.get('id')).toBe(id)
    expect(url.searchParams.get('seed')).toBe('1700000000000')
    expect(url.searchParams.get('mode')).toBe('pocket')
  })
})

describe('decideConfirmReCheck (Avery W3 / multi-tab TOCTOU)', () => {
  const full = (ids: string[]) => ids.map((id) => ({ id }))
  const snap = 'old-1'
  const word = 'new-word'

  test('already present → duplicate (no replace lie)', () => {
    expect(
      decideConfirmReCheck(
        snap,
        full(['old-1', 'a', 'b', 'c', word]),
        word,
      ),
    ).toBe('duplicate')
  })

  test('slot no longer full → commit without replace', () => {
    expect(
      decideConfirmReCheck(snap, full(['old-1', 'a', 'b']), word),
    ).toBe('commit')
    expect(decideConfirmReCheck(snap, [], word)).toBe('commit')
  })

  test('oldest id changed vs snapshot → refresh', () => {
    expect(
      decideConfirmReCheck(
        snap,
        full(['other-oldest', 'a', 'b', 'c', 'd']),
        word,
      ),
    ).toBe('refresh')
  })

  test('oldest id still matches + full → commit', () => {
    expect(
      decideConfirmReCheck(
        snap,
        full(['old-1', 'a', 'b', 'c', 'd']),
        word,
      ),
    ).toBe('commit')
  })

  test('duplicate wins over oldest mismatch', () => {
    expect(
      decideConfirmReCheck(
        snap,
        full(['other', 'a', 'b', 'c', word]),
        word,
      ),
    ).toBe('duplicate')
  })

  test('respects custom cap', () => {
    expect(decideConfirmReCheck(snap, full(['old-1', 'a']), word, 3)).toBe(
      'commit',
    )
    expect(
      decideConfirmReCheck(snap, full(['other', 'a', 'b']), word, 3),
    ).toBe('refresh')
  })
})
