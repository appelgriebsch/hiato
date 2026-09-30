import { lemmaIdentity } from '../engine'
import {
  isPackCefr,
  isPackLang,
  type PackCefr,
  type PackLang,
} from '../packs/schema'

/**
 * Missed-word pocket (ADR 0034 / #82).
 * Guest-local retry queue in localStorage — never touches streaks, Clerk, or D1.
 * Cap is 5 per lang×CEFR; full-slot Save replaces the oldest entry
 * (UI confirm for replace-oldest is #83/#85; this helper just replaces).
 *
 * Multi-tab / concurrent RMW on localStorage is last-write-wins (same as
 * streaks and daily). Do not assume stronger consistency in #83–#85.
 */

export const POCKET_KEY = 'hiato.pocket'
export const POCKET_CAP = 5
export const POCKET_VERSION = 1 as const

export type PocketEntry = {
  id: string
  lang: PackLang
  cefr: PackCefr
  word: string
  gloss?: string
  /** ms epoch — ordering only; no soft TTL in v1 */
  addedAt: number
}

export type PocketEnvelope = {
  v: typeof POCKET_VERSION
  entries: PocketEntry[]
}

export function pocketSlot(lang: PackLang, cefr: PackCefr): string {
  return `${lang}|${cefr}`
}

export function pocketEntryId(
  lang: PackLang,
  cefr: PackCefr,
  word: string,
): string {
  return `${lang}|${cefr}|${lemmaIdentity(word)}`
}

/** Entries for one lang×CEFR slot, oldest-first. */
export function listPocket(
  entries: PocketEntry[],
  lang: PackLang,
  cefr: PackCefr,
): PocketEntry[] {
  return entries
    .filter((e) => e.lang === lang && e.cefr === cefr)
    .slice()
    .sort((a, b) => a.addedAt - b.addedAt || a.id.localeCompare(b.id))
}

export type AddPocketResult = {
  entries: PocketEntry[]
  /** true when a new entry was appended (possibly after replace-oldest) */
  added: boolean
  /** entry dropped under cap, if any */
  replaced: PocketEntry | null
  /** true when id already present — keep-first, no-op */
  duplicate: boolean
}

/**
 * Pure add. Duplicate id → keep-first no-op (does not bump addedAt).
 * When the slot already has {@link POCKET_CAP} distinct ids and the add is
 * new → drop the entry with the smallest addedAt, then append.
 */
export function addPocketEntry(
  entries: PocketEntry[],
  input: {
    lang: PackLang
    cefr: PackCefr
    word: string
    gloss?: string
    addedAt?: number
  },
): AddPocketResult {
  const id = pocketEntryId(input.lang, input.cefr, input.word)
  if (entries.some((e) => e.id === id)) {
    return { entries, added: false, replaced: null, duplicate: true }
  }

  const entry: PocketEntry = {
    id,
    lang: input.lang,
    cefr: input.cefr,
    word: input.word,
    addedAt: input.addedAt ?? Date.now(),
  }
  if (typeof input.gloss === 'string' && input.gloss.length > 0) {
    entry.gloss = input.gloss
  }

  const slot = listPocket(entries, input.lang, input.cefr)
  let next = entries.slice()
  let replaced: PocketEntry | null = null

  if (slot.length >= POCKET_CAP) {
    const oldest = slot[0]!
    replaced = oldest
    next = next.filter((e) => e.id !== oldest.id)
  }

  next.push(entry)
  return { entries: next, added: true, replaced, duplicate: false }
}

export function removePocketEntry(
  entries: PocketEntry[],
  id: string,
): PocketEntry[] {
  return entries.filter((e) => e.id !== id)
}

function parseEntry(raw: unknown): PocketEntry | null {
  try {
    if (!raw || typeof raw !== 'object') return null
    const o = raw as Record<string, unknown>
    if (!isPackLang(o.lang) || !isPackCefr(o.cefr)) return null
    if (typeof o.word !== 'string' || o.word.length === 0) return null
    if (typeof o.addedAt !== 'number' || !Number.isFinite(o.addedAt)) return null
    // Never trust stored id — corrupt localStorage could fork duplicates.
    // A throw from lemmaIdentity drops this row only.
    const id = pocketEntryId(o.lang, o.cefr, o.word)
    const entry: PocketEntry = {
      id,
      lang: o.lang,
      cefr: o.cefr,
      word: o.word,
      addedAt: o.addedAt,
    }
    if (typeof o.gloss === 'string' && o.gloss.length > 0) entry.gloss = o.gloss
    return entry
  } catch {
    return null
  }
}

function storedIdMatches(raw: unknown, id: string): boolean {
  if (!raw || typeof raw !== 'object') return false
  return (raw as Record<string, unknown>).id === id
}

/** Drop oldest ids past cap. Survivors keep their envelope order. */
function clampSlots(entries: PocketEntry[]): {
  entries: PocketEntry[]
  dropped: boolean
} {
  const drop = new Set<string>()
  const bySlot = new Map<string, PocketEntry[]>()
  for (const entry of entries) {
    const key = pocketSlot(entry.lang, entry.cefr)
    const group = bySlot.get(key)
    if (group) group.push(entry)
    else bySlot.set(key, [entry])
  }
  for (const group of bySlot.values()) {
    if (group.length <= POCKET_CAP) continue
    const oldestFirst = group
      .slice()
      .sort((a, b) => a.addedAt - b.addedAt || a.id.localeCompare(b.id))
    for (const entry of oldestFirst.slice(0, group.length - POCKET_CAP)) {
      drop.add(entry.id)
    }
  }
  if (drop.size === 0) return { entries, dropped: false }
  return {
    entries: entries.filter((entry) => !drop.has(entry.id)),
    dropped: true,
  }
}

type PocketReadKind = 'missing' | 'blocked' | 'future' | 'clean' | 'dirty'

type PocketRead = {
  kind: PocketReadKind
  /** Present key's raw string. Null when missing or getItem threw. */
  raw: string | null
  entries: PocketEntry[]
  /** Shape is unusable (not a row salvage). v > 1 is not unusable. */
  unusable: boolean
}

/**
 * Normalize hiato.pocket. Does not write.
 * Empty string is unreadable, not missing. v > 1 stays on disk and
 * reads as an empty list so a newer schema is neither shown nor crashed on.
 */
function readPocket(): PocketRead {
  let raw: string | null
  try {
    raw = localStorage.getItem(POCKET_KEY)
  } catch {
    return { kind: 'blocked', raw: null, entries: [], unusable: false }
  }
  if (raw === null) {
    return { kind: 'missing', raw: null, entries: [], unusable: false }
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(raw) as unknown
  } catch {
    return { kind: 'dirty', raw, entries: [], unusable: true }
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { kind: 'dirty', raw, entries: [], unusable: true }
  }

  const record = parsed as Record<string, unknown>
  const version = record.v
  if (typeof version !== 'number' || !Number.isFinite(version)) {
    return { kind: 'dirty', raw, entries: [], unusable: true }
  }
  if (version > POCKET_VERSION) {
    return { kind: 'future', raw, entries: [], unusable: false }
  }
  if (version !== POCKET_VERSION || !Array.isArray(record.entries)) {
    return { kind: 'dirty', raw, entries: [], unusable: true }
  }

  let dirty = false
  const entries: PocketEntry[] = []
  const seen = new Set<string>()
  for (const item of record.entries) {
    const entry = parseEntry(item)
    if (!entry || seen.has(entry.id)) {
      dirty = true
      continue
    }
    seen.add(entry.id)
    if (!storedIdMatches(item, entry.id)) dirty = true
    entries.push(entry)
  }
  const clamped = clampSlots(entries)
  if (clamped.dropped) dirty = true
  return {
    kind: dirty ? 'dirty' : 'clean',
    raw,
    entries: clamped.entries,
    unusable: false,
  }
}

/**
 * Persist envelope. Concurrent tabs are last-write-wins (no merge) —
 * same guest baseline as streaks/daily localStorage RMW.
 */
function writeEnvelope(env: PocketEnvelope): boolean {
  try {
    localStorage.setItem(POCKET_KEY, JSON.stringify(env))
    return true
  } catch {
    /* quota / private mode */
    return false
  }
}

/**
 * Write a normalized envelope only when the key is present and dirty
 * (unusable shape other than v > 1, a dropped row, a non-canonical id,
 * or a slot over cap). Key order, whitespace, and unknown fields are not
 * dirt. Re-reads immediately before setItem and skips if the bytes moved.
 */
function repairFromRead(read: PocketRead): PocketEntry[] {
  if (read.kind !== 'dirty' || read.raw === null) return read.entries
  let current: string | null
  try {
    current = localStorage.getItem(POCKET_KEY)
  } catch {
    return read.entries
  }
  if (current !== read.raw) return read.entries
  try {
    localStorage.setItem(
      POCKET_KEY,
      JSON.stringify({ v: POCKET_VERSION, entries: read.entries }),
    )
  } catch {
    // Poison shape must not stick. A salvage of real rows keeps the old bytes.
    if (read.unusable) {
      try {
        localStorage.removeItem(POCKET_KEY)
      } catch {
        /* private mode */
      }
    }
  }
  return read.entries
}

/** Repair hiato.pocket outside render. Reads stay read-only. */
export function repairPocket(): PocketEntry[] {
  return repairFromRead(readPocket())
}

/** All stored entries (any slot). Does not write. */
export function loadPocket(): PocketEntry[] {
  return readPocket().entries
}

export function listPocketStored(
  lang: PackLang,
  cefr: PackCefr,
): PocketEntry[] {
  return listPocket(loadPocket(), lang, cefr)
}

export function addToPocket(input: {
  lang: PackLang
  cefr: PackCefr
  word: string
  gloss?: string
  addedAt?: number
}): AddPocketResult {
  const read = readPocket()
  // Newer schema and unreadable storage are left untouched (no key create).
  if (read.kind === 'future' || read.kind === 'blocked') {
    return { entries: [], added: false, replaced: null, duplicate: false }
  }
  repairFromRead(read)
  const result = addPocketEntry(read.entries, input)
  if (result.added) {
    const stored = writeEnvelope({ v: POCKET_VERSION, entries: result.entries })
    if (!stored) return { ...result, added: false }
  }
  return result
}

/** Persist remove by id; returns the full remaining entry list. */
export function removeFromPocket(id: string): PocketEntry[] {
  const read = readPocket()
  if (read.kind === 'future' || read.kind === 'blocked') return []
  repairFromRead(read)
  const next = removePocketEntry(read.entries, id)
  if (next.length !== read.entries.length) {
    writeEnvelope({ v: POCKET_VERSION, entries: next })
  }
  return next
}
