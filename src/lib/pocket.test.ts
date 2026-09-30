import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { lemmaIdentity } from '../engine'
import { DAILY_KEY } from './daily-record'
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
  repairPocket,
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

  test('listPocket equal-addedAt ties break by id lexicographic', () => {
    const t = 1000
    // Insert zebra before apple so insertion order ≠ id order
    const entries = [
      entry('en', 'a1', 'zebra', t),
      entry('en', 'a1', 'apple', t),
      entry('en', 'a1', 'mango', t),
    ]
    const ids = entries.map((e) => e.id).sort()
    expect(listPocket(entries, 'en', 'a1').map((e) => e.id)).toEqual(ids)
    expect(listPocket(entries, 'en', 'a1').map((e) => e.word)).toEqual([
      'apple',
      'mango',
      'zebra',
    ])
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

  test('parse ignores stored id and always uses pocketEntryId', () => {
    const canonical = pocketEntryId('en', 'a1', 'ok')
    mem.set(
      POCKET_KEY,
      JSON.stringify({
        v: 1,
        entries: [
          {
            id: 'forged|id',
            lang: 'en',
            cefr: 'a1',
            word: 'ok',
            addedAt: 1,
          },
        ],
      }),
    )
    const loaded = loadPocket()
    expect(loaded).toHaveLength(1)
    expect(loaded[0]!.id).toBe(canonical)
    expect(loaded[0]!.id).not.toBe('forged|id')
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

  test('removeFromPocket skips write when id missing', () => {
    addToPocket({ lang: 'en', cefr: 'a1', word: 'keep', addedAt: 1 })
    const before = mem.get(POCKET_KEY)
    const next = removeFromPocket('missing-id')
    expect(next).toHaveLength(1)
    expect(mem.get(POCKET_KEY)).toBe(before)
  })
})

function storedRow(
  lang: PocketEntry['lang'],
  cefr: PocketEntry['cefr'],
  word: string,
  addedAt: number,
) {
  return {
    id: pocketEntryId(lang, cefr, word),
    lang,
    cefr,
    word,
    addedAt,
  }
}

function countWrites(): { sets: number } {
  const seen = { sets: 0 }
  const orig = localStorage.setItem.bind(localStorage)
  localStorage.setItem = (key: string, value: string) => {
    seen.sets += 1
    orig(key, value)
  }
  return seen
}

describe('pocket repair (#86)', () => {
  let mem: Map<string, string>

  beforeEach(() => {
    mem = installLocalStorageMock()
  })

  afterEach(() => {
    mem.clear()
  })

  test('unreadable values repair to an empty v1 envelope after a pure read', () => {
    const samples = [
      '{not json',
      '',
      'null',
      '[]',
      JSON.stringify({ v: '1', entries: [] }),
    ]
    for (const raw of samples) {
      mem.set(POCKET_KEY, raw)
      const writes = countWrites()
      expect(loadPocket()).toEqual([])
      expect(listPocketStored('en', 'a1')).toEqual([])
      expect(mem.get(POCKET_KEY)).toBe(raw)
      expect(writes.sets).toBe(0)
      expect(repairPocket()).toEqual([])
      expect(mem.get(POCKET_KEY)).toBe('{"v":1,"entries":[]}')
    }
  })

  test('a missing key stays absent and does not call setItem', () => {
    const writes = countWrites()
    expect(mem.has(POCKET_KEY)).toBe(false)
    expect(loadPocket()).toEqual([])
    expect(listPocketStored('de', 'b1')).toEqual([])
    expect(repairPocket()).toEqual([])
    expect(mem.has(POCKET_KEY)).toBe(false)
    expect(writes.sets).toBe(0)
  })

  test('getItem throwing does not create the key', () => {
    let sets = 0
    let removes = 0
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      writable: true,
      value: {
        getItem: () => {
          throw new Error('disabled')
        },
        setItem: () => {
          sets += 1
        },
        removeItem: () => {
          removes += 1
        },
      },
    })
    expect(loadPocket()).toEqual([])
    expect(listPocketStored('en', 'a1')).toEqual([])
    expect(repairPocket()).toEqual([])
    expect(addToPocket({ lang: 'en', cefr: 'a1', word: 'tree', addedAt: 1 }).added).toBe(
      false,
    )
    expect(removeFromPocket('any')).toEqual([])
    expect(sets).toBe(0)
    expect(removes).toBe(0)
  })

  test('v greater than 1 reads empty and does not change the stored string', () => {
    const raw = JSON.stringify({
      v: 2,
      entries: [{ word: 'x', lang: 'en', cefr: 'a1', addedAt: 1 }],
    })
    mem.set(POCKET_KEY, raw)
    const writes = countWrites()
    expect(loadPocket()).toEqual([])
    expect(listPocketStored('en', 'a1')).toEqual([])
    expect(repairPocket()).toEqual([])
    expect(addToPocket({ lang: 'en', cefr: 'a1', word: 'tree', addedAt: 3 }).added).toBe(
      false,
    )
    expect(removeFromPocket(pocketEntryId('en', 'a1', 'x'))).toEqual([])
    expect(mem.get(POCKET_KEY)).toBe(raw)
    expect(writes.sets).toBe(0)
  })

  test('one bad row beside one good row keeps the good row and rewrites v1', () => {
    const good = storedRow('en', 'a1', 'ok', 1)
    mem.set(
      POCKET_KEY,
      JSON.stringify({
        v: 1,
        entries: [good, { lang: 'en' }],
      }),
    )
    const before = mem.get(POCKET_KEY)
    expect(loadPocket().map((e) => e.word)).toEqual(['ok'])
    expect(mem.get(POCKET_KEY)).toBe(before)
    expect(repairPocket()).toHaveLength(1)
    const stored = JSON.parse(mem.get(POCKET_KEY)!) as {
      v: number
      entries: PocketEntry[]
    }
    expect(stored.v).toBe(POCKET_VERSION)
    expect(stored.entries).toHaveLength(1)
    expect(stored.entries[0]!.word).toBe('ok')
    expect(stored.entries[0]!.id).toBe(good.id)
  })

  test('over-cap slot persists the five newest and leaves the other slot', () => {
    const other = storedRow('de', 'a1', 'Hund', 50)
    const words = ['a', 'b', 'c', 'd', 'e', 'f']
    mem.set(
      POCKET_KEY,
      JSON.stringify({
        v: 1,
        entries: [
          storedRow('en', 'a1', 'a', 1),
          other,
          ...words.slice(1).map((word, index) =>
            storedRow('en', 'a1', word, index + 2),
          ),
        ],
      }),
    )
    const repaired = repairPocket()
    expect(repaired.map((e) => `${e.lang}:${e.word}`)).toEqual([
      'de:Hund',
      'en:b',
      'en:c',
      'en:d',
      'en:e',
      'en:f',
    ])
    const stored = JSON.parse(mem.get(POCKET_KEY)!) as {
      entries: PocketEntry[]
    }
    expect(stored.entries.map((e) => `${e.lang}:${e.word}`)).toEqual([
      'de:Hund',
      'en:b',
      'en:c',
      'en:d',
      'en:e',
      'en:f',
    ])
    expect(stored.entries[0]).toMatchObject(other)
    expect(listPocket(stored.entries, 'en', 'a1')).toHaveLength(POCKET_CAP)
    expect(listPocket(stored.entries, 'de', 'a1')).toEqual([
      expect.objectContaining(other),
    ])
  })

  test('equal addedAt keeps the five newest by id, not the earliest rows', () => {
    const words = ['fig', 'elder', 'date', 'cherry', 'banana', 'apple']
    mem.set(
      POCKET_KEY,
      JSON.stringify({
        v: 1,
        entries: words.map((word) => storedRow('en', 'a1', word, 10)),
      }),
    )
    expect(repairPocket().map((e) => e.word)).toEqual([
      'fig',
      'elder',
      'date',
      'cherry',
      'banana',
    ])
  })

  test('a second read of a clean envelope does not call setItem', () => {
    const pretty = '{ "v": 1, "extra": true, "entries": [] }'
    mem.set(POCKET_KEY, pretty)
    const writes = countWrites()
    expect(loadPocket()).toEqual([])
    expect(listPocketStored('en', 'a1')).toEqual([])
    expect(repairPocket()).toEqual([])
    expect(repairPocket()).toEqual([])
    expect(writes.sets).toBe(0)
    expect(mem.get(POCKET_KEY)).toBe(pretty)

    addToPocket({ lang: 'en', cefr: 'a1', word: 'tree', addedAt: 1 })
    const clean = mem.get(POCKET_KEY)
    const after = countWrites()
    loadPocket()
    listPocketStored('en', 'a1')
    repairPocket()
    repairPocket()
    expect(after.sets).toBe(0)
    expect(mem.get(POCKET_KEY)).toBe(clean)
  })

  test('setItem throwing on an unusable envelope returns [] and removes it', () => {
    mem.set(POCKET_KEY, '{not json')
    localStorage.setItem = () => {
      throw new Error('quota')
    }
    expect(() => repairPocket()).not.toThrow()
    expect(repairPocket()).toEqual([])
    expect(mem.has(POCKET_KEY)).toBe(false)
  })

  test('addToPocket does not report added when setItem throws', () => {
    localStorage.setItem = () => {
      throw new Error('quota')
    }
    const result = addToPocket({
      lang: 'en',
      cefr: 'a1',
      word: 'tree',
      addedAt: 1,
    })
    expect(result.added).toBe(false)
    expect(result.duplicate).toBe(false)
    expect(result.entries.map((e) => e.word)).toEqual(['tree'])
    expect(mem.has(POCKET_KEY)).toBe(false)
  })

  test('setItem throwing on a salvage of good rows returns the clamped list', () => {
    const entries = ['a', 'b', 'c', 'd', 'e', 'f'].map((word, index) =>
      storedRow('en', 'a1', word, index + 1),
    )
    const raw = JSON.stringify({ v: 1, entries })
    mem.set(POCKET_KEY, raw)
    localStorage.setItem = () => {
      throw new Error('quota')
    }
    const repaired = repairPocket()
    expect(repaired.map((e) => e.word)).toEqual(['b', 'c', 'd', 'e', 'f'])
    expect(mem.get(POCKET_KEY)).toBe(raw)
  })

  test('corrupt key is repaired by addToPocket and by removeFromPocket', () => {
    mem.set(POCKET_KEY, '{not json')
    const added = addToPocket({
      lang: 'en',
      cefr: 'a1',
      word: 'tree',
      addedAt: 4,
    })
    expect(added.added).toBe(true)
    expect(added.entries.map((e) => e.word)).toEqual(['tree'])
    expect(JSON.parse(mem.get(POCKET_KEY)!).entries[0].word).toBe('tree')

    mem.set(
      POCKET_KEY,
      JSON.stringify({
        v: 1,
        entries: [{ ...storedRow('en', 'a1', 'ok', 1), id: 'forged' }],
      }),
    )
    const duplicate = addToPocket({
      lang: 'en',
      cefr: 'a1',
      word: 'ok',
      addedAt: 99,
    })
    expect(duplicate.duplicate).toBe(true)
    expect(duplicate.added).toBe(false)
    expect(JSON.parse(mem.get(POCKET_KEY)!).entries[0].id).toBe(
      pocketEntryId('en', 'a1', 'ok'),
    )
    expect(JSON.parse(mem.get(POCKET_KEY)!).entries[0].addedAt).toBe(1)

    mem.set(POCKET_KEY, '[]')
    expect(removeFromPocket('missing-id')).toEqual([])
    expect(mem.get(POCKET_KEY)).toBe('{"v":1,"entries":[]}')
  })

  test('repair rewrites only hiato.pocket and drops ttl fields', () => {
    const streaks = '{"en|a1":{"count":4,"lastWinDate":"2026-09-01"}}'
    const daily = '{"en|a1":{"dateKey":"2026-09-01","won":true}}'
    const prefs = '{"lang":"en","cefr":"a1"}'
    mem.set(STREAKS_KEY, streaks)
    mem.set(DAILY_KEY, daily)
    mem.set('hiato.prefs', prefs)
    mem.set(
      POCKET_KEY,
      JSON.stringify({
        v: 1,
        ttl: 30,
        expiresAt: 123,
        entries: [storedRow('en', 'a1', 'ok', 1), { broken: true }],
      }),
    )
    repairPocket()
    expect(mem.get(STREAKS_KEY)).toBe(streaks)
    expect(mem.get(DAILY_KEY)).toBe(daily)
    expect(mem.get('hiato.prefs')).toBe(prefs)
    expect([...mem.keys()].sort()).toEqual(
      [DAILY_KEY, POCKET_KEY, STREAKS_KEY, 'hiato.prefs'].sort(),
    )
    const pocket = JSON.parse(mem.get(POCKET_KEY)!) as Record<string, unknown>
    expect(pocket.expiresAt).toBeUndefined()
    expect(pocket.ttl).toBeUndefined()
    expect(pocket.v).toBe(1)
    expect(pocket.entries).toHaveLength(1)
  })

  test('repair skips the write when the raw string changes before setItem', () => {
    mem.set(POCKET_KEY, '{not json')
    const orig = localStorage.getItem.bind(localStorage)
    let reads = 0
    localStorage.getItem = (key: string) => {
      if (key === POCKET_KEY) {
        reads += 1
        if (reads >= 2) {
          const next = '{"v":2,"entries":[]}'
          mem.set(POCKET_KEY, next)
          return next
        }
      }
      return orig(key)
    }
    expect(repairPocket()).toEqual([])
    expect(mem.get(POCKET_KEY)).toBe('{"v":2,"entries":[]}')
    expect(reads).toBeGreaterThanOrEqual(2)
  })
})
