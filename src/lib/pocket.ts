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
    .sort((a, b) => a.addedAt - b.addedAt)
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
  if (!raw || typeof raw !== 'object') return null
  const o = raw as Record<string, unknown>
  if (!isPackLang(o.lang) || !isPackCefr(o.cefr)) return null
  if (typeof o.word !== 'string' || o.word.length === 0) return null
  if (typeof o.addedAt !== 'number' || !Number.isFinite(o.addedAt)) return null
  const id =
    typeof o.id === 'string' && o.id.length > 0
      ? o.id
      : pocketEntryId(o.lang, o.cefr, o.word)
  const entry: PocketEntry = {
    id,
    lang: o.lang,
    cefr: o.cefr,
    word: o.word,
    addedAt: o.addedAt,
  }
  if (typeof o.gloss === 'string' && o.gloss.length > 0) entry.gloss = o.gloss
  return entry
}

function parseEnvelope(raw: unknown): PocketEnvelope {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { v: POCKET_VERSION, entries: [] }
  }
  const o = raw as Record<string, unknown>
  if (o.v !== POCKET_VERSION) return { v: POCKET_VERSION, entries: [] }
  if (!Array.isArray(o.entries)) return { v: POCKET_VERSION, entries: [] }
  const entries: PocketEntry[] = []
  const seen = new Set<string>()
  for (const item of o.entries) {
    const e = parseEntry(item)
    if (!e || seen.has(e.id)) continue
    seen.add(e.id)
    entries.push(e)
  }
  return { v: POCKET_VERSION, entries }
}

function readEnvelope(): PocketEnvelope {
  try {
    const raw = localStorage.getItem(POCKET_KEY)
    if (!raw) return { v: POCKET_VERSION, entries: [] }
    return parseEnvelope(JSON.parse(raw) as unknown)
  } catch {
    return { v: POCKET_VERSION, entries: [] }
  }
}

function writeEnvelope(env: PocketEnvelope): void {
  try {
    localStorage.setItem(POCKET_KEY, JSON.stringify(env))
  } catch {
    /* quota / private mode */
  }
}

/** All stored entries (any slot). */
export function loadPocket(): PocketEntry[] {
  return readEnvelope().entries
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
  const result = addPocketEntry(loadPocket(), input)
  if (result.added) {
    writeEnvelope({ v: POCKET_VERSION, entries: result.entries })
  }
  return result
}

/** Persist remove by id; returns the full remaining entry list. */
export function removeFromPocket(id: string): PocketEntry[] {
  const next = removePocketEntry(loadPocket(), id)
  writeEnvelope({ v: POCKET_VERSION, entries: next })
  return next
}
