/**
 * Exclusive B2–C2 lemma selection (ADR 0028). No I/O, no xAI, no top-level await.
 */
import { isDeniedLemma, nfcUpper } from './lemma-denylist'
import {
  PACK_CEFR_LEVELS,
  type PackCefr,
  type PackLang,
} from '../src/packs/schema'

/** Shipped A1–B1 packs: read-only exclusive subtract, never written by expand. */
export const EXISTING_CEFRS = ['a1', 'a2', 'b1'] as const satisfies readonly PackCefr[]
/** Expand write-set (ADR 0029 sources). */
export const NEW_CEFRS = ['b2', 'c1', 'c2'] as const satisfies readonly PackCefr[]

export type ExistingCefr = (typeof EXISTING_CEFRS)[number]
export type NewCefr = (typeof NEW_CEFRS)[number]
export type SelectLang = PackLang

/** Compile-time parity with PACK_CEFR_LEVELS so picker/schema drift fails `tsc`. */
const EXPAND_CEFR_LEVELS = [...EXISTING_CEFRS, ...NEW_CEFRS] as const
type CefrParity = typeof EXPAND_CEFR_LEVELS extends typeof PACK_CEFR_LEVELS
  ? typeof PACK_CEFR_LEVELS extends typeof EXPAND_CEFR_LEVELS
    ? true
    : never
  : never
export const CEFR_LEVEL_PARITY: CefrParity = true

export const TARGET = 400
export const FLOOR_B2_C1 = 350
export const FLOOR_C2 = 200

/** PT hangman-filtered list (after skip-200) rank windows. */
export const PT_BANDS: Record<NewCefr, readonly [number, number]> = {
  b2: [4000, 7000],
  c1: [7000, 11000],
  c2: [11000, 16000],
}

/**
 * DE/ES hangman-filtered wordhoard rows (content POS, frequency_rank ASC).
 * Same index windows as PT — frequency bands, not cefr_estimate (ADR 0029).
 */
export const DE_ES_BANDS: Record<NewCefr, readonly [number, number]> = {
  b2: [4000, 7000],
  c1: [7000, 11000],
  c2: [11000, 16000],
}

export function bandFloor(cefr: NewCefr): number {
  return cefr === 'c2' ? FLOOR_C2 : FLOOR_B2_C1
}

export function hangmanOk(
  lang: SelectLang,
  raw: string,
  denylist?: Set<string>,
): string | null {
  const word = nfcUpper(raw)
  if (word.length < 3 || word.length > 10) return null
  if (/[\d\s\-\.'.’_/]/.test(word)) return null
  const re: Record<SelectLang, RegExp> = {
    en: /^[A-Z]+$/,
    de: /^[A-ZÄÖÜß]+$/,
    es: /^[A-ZÁÉÍÓÚÜÑ]+$/,
    pt: /^[A-ZÁÀÂÃÉÊÍÓÔÕÚÇ]+$/,
  }
  if (!re[lang].test(word)) return null
  if (/^(.)\1+$/.test(word)) return null
  if (denylist && isDeniedLemma(word, denylist)) return null
  return word
}

/** DE fold so STRAßE ↔ STRASSE collide without preferring damaged SS forms. */
export function foldKey(lang: SelectLang, word: string): string {
  const w = nfcUpper(word)
  return lang === 'de' ? w.replaceAll('ß', 'SS') : w
}

export function loadFoldKeysFromPackLemmas(
  lang: SelectLang,
  packs: { lemmas: { word: string }[] }[],
): Set<string> {
  const keys = new Set<string>()
  for (const pack of packs) {
    for (const L of pack.lemmas) {
      keys.add(foldKey(lang, L.word))
    }
  }
  return keys
}

function preferForm(lang: SelectLang, prev: string, next: string): string {
  if (lang === 'de' && next.includes('ß') && !prev.includes('ß')) return next
  return prev
}

/**
 * Take hangman-ok lemmas from `candidates` (already in-band) until `limit`,
 * skipping fold-keys in `taken`. Mutates `taken`. No other-band top-up.
 */
export function takeExclusive(
  lang: SelectLang,
  candidates: string[],
  taken: Set<string>,
  limit: number,
  denylist?: Set<string>,
): string[] {
  const out: string[] = []
  const indexByKey = new Map<string, number>()
  for (const raw of candidates) {
    const word = hangmanOk(lang, raw, denylist)
    if (!word) continue
    const key = foldKey(lang, word)
    const existingIdx = indexByKey.get(key)
    if (existingIdx !== undefined) {
      const preferred = preferForm(lang, out[existingIdx]!, word)
      out[existingIdx] = preferred
      continue
    }
    if (taken.has(key)) continue
    if (out.length >= limit) continue
    taken.add(key)
    indexByKey.set(key, out.length)
    out.push(word)
  }
  return out
}

/** B2 before C1 before C2; never reuse A1–B1 (or earlier new-band) fold-keys. */
export function assignExclusiveBands(
  lang: SelectLang,
  existingKeys: Iterable<string>,
  byBand: Record<NewCefr, string[]>,
  limit = TARGET,
  denylist?: Set<string>,
): Record<NewCefr, string[]> {
  const taken = new Set(existingKeys)
  const out = { b2: [] as string[], c1: [] as string[], c2: [] as string[] }
  for (const cefr of NEW_CEFRS) {
    out[cefr] = takeExclusive(lang, byBand[cefr], taken, limit, denylist)
  }
  return out
}

export function isExistingCefr(cefr: string): cefr is ExistingCefr {
  return (EXISTING_CEFRS as readonly string[]).includes(cefr)
}

export function isNewCefr(cefr: string): cefr is NewCefr {
  return (NEW_CEFRS as readonly string[]).includes(cefr)
}

/** Expand may only write b2|c1|c2 files. */
export function assertPackWriteAllowed(filePath: string, cefr: string): void {
  const base = filePath.replace(/\\/g, '/').split('/').pop()?.toLowerCase() ?? ''
  if (isExistingCefr(cefr) || /^(a1|a2|b1)\.json$/.test(base)) {
    throw new Error(
      `refuses to overwrite ${base || cefr + '.json'}; expand writes only ${NEW_CEFRS.join('|')}`,
    )
  }
  if (!isNewCefr(cefr)) {
    throw new Error(`expand writes only ${NEW_CEFRS.join('|')} (got ${cefr})`)
  }
}
