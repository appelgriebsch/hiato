import { describe, expect, test } from 'bun:test'
import {
  canPlayPocketEntry,
  dailyGateFor,
  findPocketEntryById,
  parsePocketEntryId,
  playableDueEntries,
  pocketOutcomeOnFinish,
} from './pocket-play'
import type { PocketEntry } from './pocket'
import { addLocalDays } from './pocket'

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
      stage: 0,
      dueAt: 1,
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

  test('lemma identity — ASCII case folded via lemmaIdentity', () => {
    // Accents are NOT folded (Café ≠ cafe); case is.
    expect(
      canPlayPocketEntry('Daily', {
        dateKey,
        dailyWord: 'daily',
        dailyCompleted: { won: false, word: 'DAILY' },
      }),
    ).toBe(true)
  })

  test('won daily same identity → false', () => {
    expect(
      canPlayPocketEntry('daily', {
        dateKey,
        dailyWord: 'daily',
        dailyCompleted: { won: true, word: 'Daily' },
      }),
    ).toBe(false)
  })

  test('stale rec.word ≠ entry identity → false even when dailyWord matches', () => {
    expect(
      canPlayPocketEntry('daily', {
        dateKey,
        dailyWord: 'daily',
        dailyCompleted: { won: false, word: 'other' },
      }),
    ).toBe(false)
  })
})

describe('pocketOutcomeOnFinish (ADR 0044)', () => {
  const now = new Date(2026, 10, 9, 12, 0, 0).getTime()

  test('a win removes the entry, early or due', () => {
    expect(pocketOutcomeOnFinish(true, false, 0, now)).toEqual({ type: 'remove' })
    expect(pocketOutcomeOnFinish(true, true, 2, now)).toEqual({ type: 'remove' })
  })

  test('an early loss keeps stage and dueAt', () => {
    expect(pocketOutcomeOnFinish(false, false, 1, now)).toEqual({ type: 'keep' })
  })

  test('a due loss advances 0→1→2 and sets +1/+3/+7 days, capped at 2', () => {
    expect(pocketOutcomeOnFinish(false, true, 0, now)).toEqual({
      type: 'advance',
      stage: 1,
      dueAt: addLocalDays(now, 1),
    })
    expect(pocketOutcomeOnFinish(false, true, 1, now)).toEqual({
      type: 'advance',
      stage: 2,
      dueAt: addLocalDays(now, 3),
    })
    expect(pocketOutcomeOnFinish(false, true, 2, now)).toEqual({
      type: 'advance',
      stage: 2,
      dueAt: addLocalDays(now, 7),
    })
  })
})

describe('playableDueEntries (ADR 0044)', () => {
  const today = '2026-11-09'
  const entries: PocketEntry[] = [
    {
      id: 'en|a1|later',
      lang: 'en',
      cefr: 'a1',
      word: 'later',
      addedAt: 1,
      stage: 0,
      dueAt: new Date(2026, 10, 12, 12).getTime(),
    },
    {
      id: 'en|a1|daily',
      lang: 'en',
      cefr: 'a1',
      word: 'daily',
      addedAt: 2,
      stage: 0,
      dueAt: new Date(2026, 10, 1, 12).getTime(),
    },
    {
      id: 'en|a1|old',
      lang: 'en',
      cefr: 'a1',
      word: 'old',
      addedAt: 3,
      stage: 1,
      dueAt: new Date(2026, 10, 8, 12).getTime(),
    },
  ]

  test('skips a due daily that is not lost yet and keeps sheet order', () => {
    const gate = dailyGateFor(today, 'daily', null)
    expect(playableDueEntries(entries, today, gate).map((entry) => entry.word)).toEqual([
      'old',
    ])
  })

  test('a lost daily stays in the offer', () => {
    const gate = dailyGateFor(today, 'daily', {
      dateKey: today,
      completed: true,
      won: false,
      word: 'daily',
    })
    expect(playableDueEntries(entries, today, gate).map((entry) => entry.word)).toEqual([
      'daily',
      'old',
    ])
  })
})

describe('pocket play streak boundary (ADR 0043 / #219)', () => {
  test('pocket-play never calls recordDailyWin', async () => {
    const src = await Bun.file(new URL('./pocket-play.ts', import.meta.url)).text()
    expect(src).not.toMatch(/recordDailyWin\s*\(/)
  })
})
