import type { PackCefr, PackLang, PackLemma } from '@/packs/schema'
import { graphemeKey, graphemes, normalizeNfc } from './graphemes'

/** FNV-1a 32-bit style hash → unsigned int (matches G0). */
export function hashString(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

const DATE_KEY_RE = /^(\d{4})-(\d{2})-(\d{2})$/

/** Local calendar date YYYY-MM-DD (ADR 0004). */
export function localDateKey(d = new Date()): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/** Previous local calendar day of a YYYY-MM-DD key (device-local, not UTC). */
export function previousLocalDateKey(dateKey: string): string {
  const m = DATE_KEY_RE.exec(dateKey)
  if (!m) throw new Error(`bad dateKey: ${dateKey}`)
  const dt = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
  dt.setDate(dt.getDate() - 1)
  return localDateKey(dt)
}

/** Next local calendar day of a YYYY-MM-DD key (device-local, not UTC). */
export function nextLocalDateKey(dateKey: string): string {
  const m = DATE_KEY_RE.exec(dateKey)
  if (!m) throw new Error(`bad dateKey: ${dateKey}`)
  const dt = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
  dt.setDate(dt.getDate() + 1)
  return localDateKey(dt)
}

/** Seed string: date|lang|cefr (lowercase pack codes). */
export function dailySeedKey(
  dateKey: string,
  lang: PackLang,
  cefr: PackCefr,
): string {
  return `${dateKey}|${lang}|${cefr}`
}

/** Case-folded NFC grapheme identity for lemma comparison. */
export function lemmaIdentity(word: string): string {
  return graphemes(normalizeNfc(word)).map(graphemeKey).join('')
}

export function pickDailyLemma(
  lemmas: PackLemma[],
  dateKey: string,
  lang: PackLang,
  cefr: PackCefr,
): PackLemma {
  if (lemmas.length === 0) {
    throw new Error('empty lemma pack')
  }
  const idx = hashString(dailySeedKey(dateKey, lang, cefr)) % lemmas.length
  return lemmas[idx]!
}

/**
 * Pack minus today's daily lemma (ADR 0018). Empty only when the pack has
 * a single word — callers then fall back so practice still runs.
 */
export function lemmasExcludingDaily(
  lemmas: PackLemma[],
  dateKey: string,
  lang: PackLang,
  cefr: PackCefr,
): PackLemma[] {
  if (lemmas.length === 0) return []
  const daily = pickDailyLemma(lemmas, dateKey, lang, cefr)
  const exclude = lemmaIdentity(daily.word)
  return lemmas.filter((w) => lemmaIdentity(w.word) !== exclude)
}

/**
 * Endless practice pick (ADR 0018). Never returns today's daily lemma when
 * the pack has any other word. Does not use the daily seed; `seed` is a
 * caller-supplied index (G0 Date.now() / query param).
 */
export function pickPracticeLemma(
  lemmas: PackLemma[],
  dateKey: string,
  lang: PackLang,
  cefr: PackCefr,
  seed: number,
): PackLemma {
  if (lemmas.length === 0) {
    throw new Error('empty lemma pack')
  }
  const candidates = lemmasExcludingDaily(lemmas, dateKey, lang, cefr)
  const pool = candidates.length > 0 ? candidates : lemmas
  const idx = ((seed % pool.length) + pool.length) % pool.length
  return pool[idx]!
}
