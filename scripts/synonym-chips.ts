/**
 * Same-language synonym chip filters (ADR 0023).
 * Empty cache arrays mean unique referent — do not retry.
 */
import { spoilerContains } from '../src/packs/spoilers'
import { isDeniedLemma, letterTokens, nfcUpper } from './lemma-denylist'

export const SYNONYM_CHIP_CAP = 3
export const SYNONYM_COVERAGE_FLOOR = 0.8

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
  if (isDeniedLemma(chip, denylist, lang)) return true
  // Same letter tokenizer as glosses, so hyphens and slashes split too.
  for (const tok of letterTokens(chip)) {
    if (isDeniedLemma(tok, denylist, lang)) return true
  }
  return false
}

/** Why a raw chip must not ship, or null if it is usable. */
export function invalidSynonymChipReason(
  lemma: string,
  chip: string,
  denylist: Set<string>,
  lang?: string,
): string | null {
  if (typeof chip !== 'string' || !chip.trim()) return 'empty'
  if (chip !== chip.normalize('NFC')) return 'not NFC'
  const nfc = chip.normalize('NFC').trim()
  if (!nfc) return 'empty'
  if (nfcUpper(nfc) === nfcUpper(lemma)) return 'equals lemma'
  if (spoilerContains(nfc, lemma)) return 'spoiler'
  if (chipTokensDenied(nfc, denylist, lang)) return 'denylist'
  return null
}

/** Keep up to 3 valid chips; drop spoilers, denylist, lemma copies, empties. */
export function filterSynonymChips(
  lemma: string,
  chips: readonly string[] | undefined,
  denylist: Set<string>,
  lang?: string,
): string[] {
  if (!chips?.length) return []
  const out: string[] = []
  const seen = new Set<string>()
  for (const raw of chips) {
    if (typeof raw !== 'string') continue
    const chip = raw.normalize('NFC').trim()
    if (invalidSynonymChipReason(lemma, chip, denylist, lang)) continue
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
): boolean {
  const n = filterSynonymChips(lemma, chips, denylist, lang).length
  return n >= 1 && n <= SYNONYM_CHIP_CAP
}

export function synonymCoverageRatio(
  lemmas: { word: string; synonyms?: string[] }[],
  denylist: Set<string>,
  lang?: string,
): number {
  if (lemmas.length === 0) return 0
  let n = 0
  for (const L of lemmas) {
    if (lemmaHasValidChips(L.word, L.synonyms, denylist, lang)) n++
  }
  return n / lemmas.length
}
