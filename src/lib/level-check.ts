/**
 * Optional CEFR level check (ADR 0050, #227/#276). Pure: no storage, no
 * streak, no analytics — the sheet keeps state in memory only.
 */
import { pickDailyLemma } from '../engine/daily'
import {
  PACK_CEFR_LEVELS,
  type PackCefr,
  type PackLang,
  type WordPack,
} from '../packs/schema'

/** One check question: a single word from one level pack, seeded per local day. */
export interface LevelCheckItem {
  cefr: PackCefr
  word: string
}

/**
 * Suggested level: the highest CEFR level whose word was marked known.
 * None known → 'a1'; all known → 'c2' (ADR 0050). Advisory only.
 */
export function suggestLevel(known: readonly PackCefr[]): PackCefr {
  for (let i = PACK_CEFR_LEVELS.length - 1; i >= 0; i--) {
    const level = PACK_CEFR_LEVELS[i]!
    if (known.includes(level)) return level
  }
  return 'a1'
}

/**
 * One seeded word per level A1–C2 of `lang`, picked with the existing
 * `pickDailyLemma` so the check is stable per local `dateKey` (ADR 0050).
 */
export function checkItems(
  packs: Readonly<Record<PackCefr, WordPack>>,
  dateKey: string,
  lang: PackLang,
): LevelCheckItem[] {
  return PACK_CEFR_LEVELS.map((cefr) => ({
    cefr,
    word: pickDailyLemma(packs[cefr].lemmas, dateKey, lang, cefr).word,
  }))
}
