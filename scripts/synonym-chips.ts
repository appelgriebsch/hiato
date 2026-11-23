/**
 * Same-language synonym chip filters (ADR 0023).
 * Empty cache arrays mean unique referent — do not retry.
 *
 * #362: languages in CHIP_LANG_GATE_LANGS additionally get the chip language
 * gate — a chip must contain at least one letter (no stringified `[]` /
 * numeral chips) and every letter token must be a word of the pack language
 * per `isWordOfLang` (for pt both dictionaries, dictionary-pt-pt and
 * dictionary-pt, are consulted) or the loanword allowlist. Add a language here
 * as its pack-QA issue lands; generation and packs:check apply the same rule.
 */
import { spoilerContains } from '../src/packs/spoilers'
import type { MembershipLang } from './lang-membership'
import { isDeniedTextToken, letterTokens, nfcUpper } from './lemma-denylist'

export const SYNONYM_CHIP_CAP = 3
export const SYNONYM_COVERAGE_FLOOR = 0.8

/** Languages whose synonym chips are language-gated (#362 starts with pt). */
export const CHIP_LANG_GATE_LANGS: ReadonlySet<MembershipLang> = new Set(['pt'])

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
  if (nfcUpper(nfc) === nfcUpper(lemma)) return 'equals lemma'
  if (spoilerContains(nfc, lemma)) return 'spoiler'
  if (chipTokensDenied(nfc, denylist, lang)) return 'denylist'
  // #362: a chip is a word (or short phrase of words) of the pack language.
  // Stringified `[]` / `[` / numeral chips have no letter and never ship.
  if (!/\p{L}/u.test(nfc)) return 'not a word'
  if (lang && CHIP_LANG_GATE_LANGS.has(lang as MembershipLang) && isWordOfLang) {
    for (const tok of letterTokens(nfc)) {
      if (!isWordOfLang(lang as MembershipLang, tok)) return `not a word of ${lang}`
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
    const key = nfcUpper(chip)
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
