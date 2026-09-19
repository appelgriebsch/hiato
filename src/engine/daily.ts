import type { PackCefr, PackLang, PackLemma } from '@/packs/schema'

/** FNV-1a 32-bit style hash → unsigned int (matches G0). */
export function hashString(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

/** Local calendar date YYYY-MM-DD (ADR 0004). */
export function localDateKey(d = new Date()): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/** Seed string: date|lang|cefr (lowercase pack codes). */
export function dailySeedKey(
  dateKey: string,
  lang: PackLang,
  cefr: PackCefr,
): string {
  return `${dateKey}|${lang}|${cefr}`
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
