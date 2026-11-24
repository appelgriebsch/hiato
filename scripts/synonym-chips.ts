/**
 * Same-language synonym chip filters (ADR 0023).
 * Empty cache arrays mean unique referent — do not retry.
 *
 * #362 / #366: languages in CHIP_LANG_GATE_LANGS get the chip language gate.
 * A chip must contain a letter and no Unicode number (no stringified `[]`,
 * numerals, or `CO2`). `3º` fails because of the digit: U+00BA is a letter,
 * not a number. A hyphenated or apostrophe form is checked whole before it
 * is split (`week-end`, `dell'ordine`). Every remaining letter token must be
 * a word of the pack language per `isWordOfLang` (en accepts en-US or en-GB;
 * pt accepts pt-PT or pt-BR) or the loanword allowlist. Every pack language
 * with a Hunspell dictionary is in the set. Generation and packs:check apply
 * the same rule.
 */
import { spoilerContains } from '../src/packs/spoilers'
import type { MembershipLang } from './lang-membership'
import { isDeniedTextToken, letterTokens, spellingKey } from './lemma-denylist'

export const SYNONYM_CHIP_CAP = 3
export const SYNONYM_COVERAGE_FLOOR = 0.8

/** Every pack language that has a Hunspell dictionary (#366 extends #362). */
export const CHIP_LANG_GATE_LANGS: ReadonlySet<MembershipLang> = new Set([
  'en',
  'de',
  'es',
  'pt',
  'fr',
  'it',
])

/** Membership predicate shape shared with lang-membership isWordOfLang. */
export type ChipMembershipFn = (lang: MembershipLang, word: string) => boolean

export function synonymCacheKeyIsSettled(
  cache: Record<string, string[]>,
  word: string,
): boolean {
  return Object.hasOwn(cache, word)
}

function chipTokensDenied(
  chip: string,
  denylist: Set<string>,
  lang?: string,
): boolean {
  // isDeniedTextToken: every exact category counts, the gloss-exempt list
  // lifts a language-scoped homograph (de HELL, de SCHWANZ), and ß/SS folds (#363).
  if (isDeniedTextToken(chip, lang, undefined, denylist)) return true
  // Same letter tokenizer as glosses, so hyphens and slashes split too.
  for (const tok of letterTokens(chip)) {
    if (isDeniedTextToken(tok, lang, undefined, denylist)) return true
  }
  return false
}

/**
 * Words of a chip. Hyphens and apostrophes stay inside the word so
 * `week-end` and `dell'ordine` are one membership probe. A curly apostrophe
 * is folded to ASCII before the probe; the shipped chip text is unchanged.
 */
export function chipSurfaceWords(text: string): string[] {
  const nfc = text.normalize('NFC').replaceAll('’', "'").replaceAll('ʼ', "'")
  return nfc.match(/[\p{L}\p{M}]+(?:['-][\p{L}\p{M}]+)*/gu) ?? []
}

/** Why a raw chip must not ship, or null if it is usable. */
export function invalidSynonymChipReason(
  lemma: string,
  chip: string,
  denylist: Set<string>,
  lang?: string,
  isWordOfLang?: ChipMembershipFn,
): string | null {
  if (typeof chip !== 'string' || !chip.trim()) return 'empty'
  if (chip !== chip.normalize('NFC')) return 'not NFC'
  const nfc = chip.normalize('NFC').trim()
  if (!nfc) return 'empty'
  // #366: ß/SS and case fold, so LAß/LASS and GRÜSSE/Grüße are the lemma.
  if (spellingKey(nfc) === spellingKey(lemma)) return 'equals lemma'
  if (spoilerContains(nfc, lemma)) return 'spoiler'
  if (chipTokensDenied(nfc, denylist, lang)) return 'denylist'
  // #362 / #366: a chip is a word or a short phrase of words. No letter, or a
  // Unicode number (digits, ², ₂), and it is not a word: `[]`, `7`, `CO2`.
  // `3º` fails on the digit. U+00BA is a letter (`\p{Lo}`), not a number.
  if (/\p{N}/u.test(nfc) || !/\p{L}/u.test(nfc)) return 'not a word'
  if (lang && CHIP_LANG_GATE_LANGS.has(lang as MembershipLang) && isWordOfLang) {
    const surfaces = chipSurfaceWords(nfc)
    if (surfaces.length === 0) return `not a word of ${lang}`
    for (const surface of surfaces) {
      if (isWordOfLang(lang as MembershipLang, surface)) continue
      for (const tok of letterTokens(surface)) {
        if (!isWordOfLang(lang as MembershipLang, tok)) return `not a word of ${lang}`
      }
    }
  }
  return null
}

/** Keep up to 3 valid chips; drop spoilers, denylist, lemma copies, empties. */
export function filterSynonymChips(
  lemma: string,
  chips: readonly string[] | undefined,
  denylist: Set<string>,
  lang?: string,
  isWordOfLang?: ChipMembershipFn,
): string[] {
  if (!chips?.length) return []
  const out: string[] = []
  const seen = new Set<string>()
  for (const raw of chips) {
    if (typeof raw !== 'string') continue
    const chip = raw.normalize('NFC').trim()
    if (invalidSynonymChipReason(lemma, chip, denylist, lang, isWordOfLang)) continue
    const key = spellingKey(chip)
    if (seen.has(key)) continue
    seen.add(key)
    out.push(chip)
    if (out.length >= SYNONYM_CHIP_CAP) break
  }
  return out
}

export function lemmaHasValidChips(
  lemma: string,
  chips: readonly string[] | undefined,
  denylist: Set<string>,
  lang?: string,
  isWordOfLang?: ChipMembershipFn,
): boolean {
  const n = filterSynonymChips(lemma, chips, denylist, lang, isWordOfLang).length
  return n >= 1 && n <= SYNONYM_CHIP_CAP
}

export function synonymCoverageRatio(
  lemmas: { word: string; synonyms?: string[] }[],
  denylist: Set<string>,
  lang?: string,
  isWordOfLang?: ChipMembershipFn,
): number {
  if (lemmas.length === 0) return 0
  let n = 0
  for (const L of lemmas) {
    if (lemmaHasValidChips(L.word, L.synonyms, denylist, lang, isWordOfLang)) n++
  }
  return n / lemmas.length
}
