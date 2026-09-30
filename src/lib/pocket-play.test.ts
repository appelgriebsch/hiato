import { describe, expect, test } from 'bun:test'
import {
  canPlayPocketEntry,
  findPocketEntryById,
  parsePocketEntryId,
  pocketOutcomeOnFinish,
} from './pocket-play'
import type { PocketEntry } from './pocket'

describe('parsePocketEntryId (#84)', () => {
  test('trims and rejects empty', () => {
    expect(parsePocketEntryId(null)).toBe(null)
    expect(parsePocketEntryId('')).toBe(null)
    expect(parsePocketEntryId('   ')).toBe(null)
    expect(parsePocketEntryId('en|a1|hello')).toBe('en|a1|hello')
    expect(parsePocketEntryId('  en|a1|hello  ')).toBe('en|a1|hello')
  })
})

describe('findPocketEntryById (#84)', () => {
  const entries: PocketEntry[] = [
    {
      id: 'en|a1|cat',
      lang: 'en',
      cefr: 'a1',
      word: 'cat',
      gloss: 'feline',
      addedAt: 1,
    },
  ]

  test('finds by id', () => {
    expect(findPocketEntryById(entries, 'en|a1|cat')?.word).toBe('cat')
  })

  test('missing id → undefined', () => {
    expect(findPocketEntryById(entries, 'en|a1|dog')).toBeUndefined()
  })
})

describe('canPlayPocketEntry (ADR 0018 / #84)', () => {
  const dateKey = '2026-09-30'

  test('non-daily pocket word always allowed', () => {
    expect(
      canPlayPocketEntry('other', {
        dateKey,
        dailyWord: 'daily',
        dailyCompleted: null,
      }),
    ).toBe(true)
    expect(
      canPlayPocketEntry('other', {
        dateKey,
        dailyWord: 'daily',
        dailyCompleted: { won: true, word: 'daily' },
      }),
    ).toBe(true)
  })

  test('today daily in pocket — blocked until daily lose completed', () => {
    expect(
      canPlayPocketEntry('daily', {
        dateKey,
        dailyWord: 'daily',
        dailyCompleted: null,
      }),
    ).toBe(false)
    expect(
      canPlayPocketEntry('daily', {
        dateKey,
        dailyWord: 'daily',
        dailyCompleted: { won: true, word: 'daily' },
      }),
    ).toBe(false)
  })

  test('same-day retry of lost daily allowed', () => {
    expect(
      canPlayPocketEntry('daily', {
        dateKey,
        dailyWord: 'daily',
        dailyCompleted: { won: false, word: 'daily' },
      }),
    ).toBe(true)
  })

  test('lemma identity — case/accent folded via lemmaIdentity', () => {
    // pickDaily and pocket both store display forms; identity must match
    expect(
      canPlayPocketEntry('Café', {
        dateKey,
        dailyWord: 'cafe',
        dailyCompleted: { won: false, word: 'Café' },
      }),
    ).toBe(true)
  })
})

describe('pocketOutcomeOnFinish (#84)', () => {
  test('win removes; lose keeps', () => {
    expect(pocketOutcomeOnFinish(true)).toBe('remove')
    expect(pocketOutcomeOnFinish(false)).toBe('keep')
  })
})
