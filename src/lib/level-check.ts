/**
 * Optional CEFR level check (ADR 0050, #227/#276). Pure: no storage, no
 * streak, no analytics — the sheet keeps state in memory only.
 */
import { dailySeedKey, hashString } from '../engine/daily'
import {
  PACK_CEFR_LEVELS,
  type PackCefr,
  type PackLang,
  type PackLemma,
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
 * Level-check pick (ADR 0050 amendment 2026-11-19): own seed
 * `dailySeedKey(dateKey, lang, cefr) + '|level-check'`, so a check word is
 * never that level's Daily for the day. If the seeded index collides with the
 * Daily index and the pack has more than one lemma, take the next lemma.
 * Stable per local `dateKey`. `pickDailyLemma` and the Daily are unchanged.
 */
export function pickLevelCheckLemma(
  lemmas: PackLemma[],
  dateKey: string,
  lang: PackLang,
  cefr: PackCefr,
): PackLemma {
  if (lemmas.length === 0) {
    throw new Error('empty lemma pack')
  }
  const seed = dailySeedKey(dateKey, lang, cefr)
  const dailyIdx = hashString(seed) % lemmas.length
  let idx = hashString(`${seed}|level-check`) % lemmas.length
  if (idx === dailyIdx && lemmas.length > 1) idx = (idx + 1) % lemmas.length
  return lemmas[idx]!
}

/**
 * One seeded word per level A1–C2 of `lang`, picked with `pickLevelCheckLemma`
 * so the check is stable per local `dateKey` and never spoils the Daily
 * (ADR 0050 amendment 2026-11-19).
 */
export function checkItems(
  packs: Readonly<Record<PackCefr, WordPack>>,
  dateKey: string,
  lang: PackLang,
): LevelCheckItem[] {
  return PACK_CEFR_LEVELS.map((cefr) => ({
    cefr,
    word: pickLevelCheckLemma(packs[cefr].lemmas, dateKey, lang, cefr).word,
  }))
}
