import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { lemmaIdentity } from '../engine'
import {
  POCKET_CAP,
  POCKET_KEY,
  POCKET_VERSION,
  addPocketEntry,
  addToPocket,
  listPocket,
  listPocketStored,
  loadPocket,
  pocketEntryId,
  pocketSlot,
  removeFromPocket,
  removePocketEntry,
  type PocketEntry,
} from './pocket'
import { STREAKS_KEY } from './streaks'

function installLocalStorageMock() {
  const mem = new Map<string, string>()
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    writable: true,
    value: {
      getItem: (k: string) => mem.get(k) ?? null,
      setItem: (k: string, v: string) => {
        mem.set(k, v)
      },
      removeItem: (k: string) => {
        mem.delete(k)
      },
      clear: () => {
        mem.clear()
      },
    },
  })
  return mem
}

function entry(
  lang: PocketEntry['lang'],
  cefr: PocketEntry['cefr'],
  word: string,
  addedAt: number,
  gloss?: string,
): PocketEntry {
  const e: PocketEntry = {
    id: pocketEntryId(lang, cefr, word),
    lang,
    cefr,
    word,
    addedAt,
  }
  if (gloss) e.gloss = gloss
  return e
}

describe('pocket identity / cap / replace-oldest (ADR 0034 / #82)', () => {
  let mem: Map<string, string>

  beforeEach(() => {
    mem = installLocalStorageMock()
  })

  afterEach(() => {
    mem.clear()
  })

  test('pocketEntryId uses lang|cefr|lemmaIdentity(word)', () => {
    expect(pocketEntryId('de', 'a1', 'Hund')).toBe(
      `de|a1|${lemmaIdentity('Hund')}`,
    )
    expect(pocketEntryId('en', 'b1', 'Hello')).toBe(
      `en|b1|${lemmaIdentity('Hello')}`,
    )
    // case fold via lemmaIdentity — same identity → same id
    expect(pocketEntryId('de', 'a1', 'Hund')).toBe(
      pocketEntryId('de', 'a1', 'HUND'),
    )
    expect(pocketSlot('pt', 'a2')).toBe('pt|a2')
  })

  test('listPocket filters by lang x CEFR and sorts oldest-first', () => {
    const entries = [
      entry('en', 'a1', 'cat', 300),
      entry('de', 'a1', 'Hund', 100),
      entry('en', 'a1', 'dog', 100),
      entry('en', 'b1', 'zebra', 50),
    ]
    expect(listPocket(entries, 'en', 'a1').map((e) => e.word)).toEqual([
      'dog',
      'cat',
    ])
    expect(listPocket(entries, 'de', 'a1')).toHaveLength(1)
    expect(listPocket(entries, 'en', 'a2')).toHaveLength(0)
  })

  test('duplicate add is idempotent (keep-first, no addedAt bump)', () => {
    const first = entry('en', 'a1', 'apple', 1000, 'fruit')
    const once = addPocketEntry([], {
      lang: 'en',
      cefr: 'a1',
      word: 'apple',
      gloss: 'fruit',
      addedAt: 1000,
    })
    expect(once.added).toBe(true)
    expect(once.duplicate).toBe(false)
    expect(once.entries).toEqual([first])

    const twice = addPocketEntry(once.entries, {
      lang: 'en',
      cefr: 'a1',
      word: 'APPLE', // same lemmaIdentity
      gloss: 'other',
      addedAt: 9999,
    })
    expect(twice.added).toBe(false)
    expect(twice.duplicate).toBe(true)
    expect(twice.replaced).toBeNull()
    expect(twice.entries).toBe(once.entries)
    expect(twice.entries[0]!.addedAt).toBe(1000)
    expect(twice.entries[0]!.gloss).toBe('fruit')
  })

  test('cap is 5 per lang x CEFR; other slots are independent', () => {
    let entries: PocketEntry[] = []
    for (let i = 0; i < POCKET_CAP; i++) {
      const r = addPocketEntry(entries, {
        lang: 'en',
        cefr: 'a1',
        word: `word${i}`,
        addedAt: 1000 + i,
      })
      expect(r.added).toBe(true)
      expect(r.replaced).toBeNull()
      entries = r.entries
    }
    expect(listPocket(entries, 'en', 'a1')).toHaveLength(POCKET_CAP)

    const other = addPocketEntry(entries, {
      lang: 'en',
      cefr: 'a2',
      word: 'other',
      addedAt: 50,
    })
    expect(other.added).toBe(true)
    expect(other.replaced).toBeNull()
    expect(listPocket(other.entries, 'en', 'a1')).toHaveLength(POCKET_CAP)
    expect(listPocket(other.entries, 'en', 'a2')).toHaveLength(1)
  })

  test('replace-oldest drops smallest addedAt then appends the new entry', () => {
    let entries: PocketEntry[] = []
    const words = ['one', 'two', 'three', 'four', 'five']
    words.forEach((w, i) => {
      entries = addPocketEntry(entries, {
        lang: 'de',
        cefr: 'a1',
        word: w,
        addedAt: 100 + i * 10,
      }).entries
    })
    expect(listPocket(entries, 'de', 'a1').map((e) => e.word)).toEqual(words)

    const result = addPocketEntry(entries, {
      lang: 'de',
      cefr: 'a1',
      word: 'six',
      gloss: 'sechs',
      addedAt: 999,
    })
    expect(result.added).toBe(true)
    expect(result.duplicate).toBe(false)
    expect(result.replaced?.word).toBe('one')
    expect(result.replaced?.addedAt).toBe(100)

    const slot = listPocket(result.entries, 'de', 'a1')
    expect(slot).toHaveLength(POCKET_CAP)
    expect(slot.map((e) => e.word)).toEqual([
      'two',
      'three',
      'four',
      'five',
      'six',
    ])
    expect(slot[slot.length - 1]!.gloss).toBe('sechs')
  })

  test('removePocketEntry drops by id only', () => {
    const a = entry('en', 'a1', 'alpha', 1)
    const b = entry('en', 'a1', 'beta', 2)
    const next = removePocketEntry([a, b], a.id)
    expect(next).toEqual([b])
    expect(removePocketEntry(next, 'missing')).toEqual([b])
  })

  test('persistence writes versioned envelope under hiato.pocket', () => {
    addToPocket({
      lang: 'es',
      cefr: 'b1',
      word: 'casa',
      gloss: 'house',
      addedAt: 42,
    })
    const raw = JSON.parse(mem.get(POCKET_KEY)!) as {
      v: number
      entries: PocketEntry[]
    }
    expect(raw.v).toBe(POCKET_VERSION)
    expect(raw.entries).toHaveLength(1)
    expect(raw.entries[0]!.id).toBe(pocketEntryId('es', 'b1', 'casa'))
    expect(listPocketStored('es', 'b1')[0]!.word).toBe('casa')
    expect(loadPocket()).toHaveLength(1)

    removeFromPocket(raw.entries[0]!.id)
    expect(listPocketStored('es', 'b1')).toHaveLength(0)
  })

  test('never reads or writes hiato.streaks', () => {
    mem.set(
      STREAKS_KEY,
      JSON.stringify({ 'en|a1': { count: 9, lastWinDate: '2026-09-19' } }),
    )
    addToPocket({ lang: 'en', cefr: 'a1', word: 'tree', addedAt: 1 })
    expect(mem.get(STREAKS_KEY)).toContain('"count":9')
    expect(mem.has(POCKET_KEY)).toBe(true)
    expect(Object.keys(Object.fromEntries(mem)).sort()).toEqual(
      [POCKET_KEY, STREAKS_KEY].sort(),
    )
  })

  test('corrupt / wrong-version storage falls back to empty', () => {
    mem.set(POCKET_KEY, '{not json')
    expect(loadPocket()).toEqual([])
    mem.set(POCKET_KEY, JSON.stringify({ v: 99, entries: [{ word: 'x' }] }))
    expect(loadPocket()).toEqual([])
    mem.set(
      POCKET_KEY,
      JSON.stringify({
        v: 1,
        entries: [{ lang: 'en', cefr: 'a1', word: 'ok', addedAt: 1 }],
      }),
    )
    expect(loadPocket()).toHaveLength(1)
  })

  test('persisted duplicate add is a no-op write', () => {
    addToPocket({ lang: 'pt', cefr: 'a1', word: 'casa', addedAt: 10 })
    const before = mem.get(POCKET_KEY)
    const again = addToPocket({
      lang: 'pt',
      cefr: 'a1',
      word: 'casa',
      addedAt: 99,
    })
    expect(again.duplicate).toBe(true)
    expect(again.added).toBe(false)
    expect(mem.get(POCKET_KEY)).toBe(before)
  })
})
