import { localDateKey } from '../engine'
import {
  FAMILY_MAX,
  IPA_MAX,
  isPackCefr,
  isPackLang,
  isPackPos,
  type PackCefr,
  type PackLang,
  type PackPos,
} from '../packs/schema'

/** One completed daily attempt per lang+CEFR (latest dateKey wins). */
export const DAILY_KEY = 'hiato.daily'

export type DailyRecord = {
  dateKey: string
  lang: PackLang
  cefr: PackCefr
  word: string
  gloss?: string
  synonyms?: string[]
  example?: string
  /** ADR 0055 extras — optional so stale records without them still parse. */
  pos?: PackPos
  ipa?: string
  family?: string[]
  won: boolean
  completed: boolean
}

type DailyMap = Record<string, DailyRecord>

function slot(lang: PackLang, cefr: PackCefr): string {
  return `${lang}|${cefr}`
}

function parseRecord(raw: unknown): DailyRecord | null {
  if (!raw || typeof raw !== 'object') return null
  const o = raw as Record<string, unknown>
  if (!isPackLang(o.lang) || !isPackCefr(o.cefr)) return null
  if (typeof o.dateKey !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(o.dateKey)) {
    return null
  }
  if (typeof o.word !== 'string' || o.word.length === 0) return null
  if (typeof o.won !== 'boolean' || typeof o.completed !== 'boolean') return null
  const rec: DailyRecord = {
    dateKey: o.dateKey,
    lang: o.lang,
    cefr: o.cefr,
    word: o.word,
    won: o.won,
    completed: o.completed,
  }
  if (typeof o.gloss === 'string' && o.gloss.length > 0) rec.gloss = o.gloss
  if (typeof o.example === 'string' && o.example.length > 0) rec.example = o.example
  if (isPackPos(o.pos)) rec.pos = o.pos
  // localStorage is a trust boundary — bound the stored transcription like the pack cap.
  if (typeof o.ipa === 'string' && o.ipa.trim().length > 0) rec.ipa = o.ipa.slice(0, IPA_MAX)
  if (Array.isArray(o.synonyms)) {
    const synonyms = o.synonyms
      .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
      .slice(0, 3)
    if (synonyms.length > 0) rec.synonyms = synonyms
  }
  if (Array.isArray(o.family)) {
    const family = o.family
      .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
      .slice(0, FAMILY_MAX)
    if (family.length > 0) rec.family = family
  }
  return rec
}

function readMap(): DailyMap {
  try {
    const raw = localStorage.getItem(DAILY_KEY)
    if (!raw) return {}
    const parsed: unknown = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    const out: DailyMap = {}
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
      const rec = parseRecord(v)
      if (rec) out[k] = rec
    }
    return out
  } catch {
    return {}
  }
}

function writeMap(map: DailyMap): void {
  try {
    localStorage.setItem(DAILY_KEY, JSON.stringify(map))
  } catch {
    /* quota / private mode */
  }
}

export function getDailyRecord(
  lang: PackLang,
  cefr: PackCefr,
): DailyRecord | null {
  return readMap()[slot(lang, cefr)] ?? null
}

export function setDailyRecord(rec: DailyRecord): void {
  const map = readMap()
  map[slot(rec.lang, rec.cefr)] = rec
  writeMap(map)
}

export function isDailyComplete(
  lang: PackLang,
  cefr: PackCefr,
  dateKey: string = localDateKey(),
): boolean {
  const rec = getDailyRecord(lang, cefr)
  return Boolean(rec && rec.dateKey === dateKey && rec.completed)
}
