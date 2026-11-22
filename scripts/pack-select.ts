/**
 * Exclusive B2–C2 lemma selection (ADR 0028). No I/O, no Mistral AI call, no top-level await.
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
/** ADR 0058: the floor is 350 for every band including C2 (amends ADR 0028). */
export const FLOOR_C2 = 350

/** Hard cap for any pack under `--grow` (ADR 0058). */
export const PACK_TARGET_CAP = 1000

/**
 * Committed per-band growth targets (ADR 0058): min(--grow --dry-run source
 * capacity, PACK_TARGET_CAP) per pack, seeded by the #328 capacity report and
 * grown into by the per-language PRs (#329–#334). Every value stays ≥ the
 * shipped 400 so the pin range guard passes before any growth.
 */
export const BAND_TARGETS: Record<SelectLang, Record<PackCefr, number>> = {
  en: { a1: 740, a2: 955, b1: 1000, b2: 1000, c1: 675, c2: 593 },
  pt: { a1: 1000, a2: 1000, b1: 1000, b2: 1000, c1: 1000, c2: 1000 },
  de: { a1: 840, a2: 1000, b1: 1000, b2: 1000, c1: 1000, c2: 1000 },
  es: { a1: 858, a2: 1000, b1: 1000, b2: 1000, c1: 1000, c2: 1000 },
  fr: { a1: 810, a2: 1000, b1: 1000, b2: 1000, c1: 1000, c2: 1000 },
  it: { a1: 671, a2: 935, b1: 1000, b2: 1000, c1: 1000, c2: 1000 },
}

export function bandTarget(lang: SelectLang, cefr: PackCefr): number {
  return BAND_TARGETS[lang][cefr]
}

/**
 * Widened B2–C2 index windows (ADR 0058) on the hangman-filtered frequency
 * lists. The first TARGET=400 picks of the legacy path are unchanged because
 * selection takes candidates in order; the wider tail only feeds `--grow`.
 */
export const PT_BANDS: Record<NewCefr, readonly [number, number]> = {
  b2: [4000, 9000],
  c1: [9000, 16000],
  c2: [16000, 26000],
}

/**
 * DE/ES hangman-filtered wordhoard rows (content POS, frequency_rank ASC).
 * Same index windows as PT — frequency bands, not cefr_estimate (ADR 0029).
 */
export const DE_ES_BANDS: Record<NewCefr, readonly [number, number]> = {
  b2: [4000, 9000],
  c1: [9000, 16000],
  c2: [16000, 26000],
}

/**
 * Widened A1–B1 index windows on the same filtered DE/ES/PT frequency lists
 * for the one-time `--grow` unfreeze (ADR 0040 addendum, ADR 0058). PT's list
 * is already skip-200. Windows stay contiguous and non-overlapping with
 * B2–C2 (ADR 0028).
 */
export const LOW_BAND_WINDOWS: Record<ExistingCefr, readonly [number, number]> = {
  a1: [0, 1500],
  a2: [1500, 3000],
  b1: [3000, 4000],
}

/** Frequency-list window for any band: widened low bands or B2–C2 bands. */
export function bandWindow(cefr: PackCefr): readonly [number, number] {
  return isNewCefr(cefr) ? DE_ES_BANDS[cefr] : LOW_BAND_WINDOWS[cefr]
}

/**
 * Elision stubs Hunspell still accepts (ADR 0040). Not hangman targets.
 * The grid has no apostrophe cell, so the truncated lemma is not a word we play.
 */
export const FR_ELISION_STUBS = new Set([
  'JUSQU',
  'QUELQU',
  'PRESQU',
  'PUISQU',
  'LORSQU',
  'AUJOURD',
])

/**
 * One-token articulated prepositions and fused clitics (ADR 0040 addendum).
 * COLLO / COLLA / COLLE / PELLE stay: they are content lemmas, not this class.
 */
export const IT_FUSED_FORMS = new Set([
  'DEL',
  'DELLO',
  'DELLA',
  'DEI',
  'DEGLI',
  'DELLE',
  'NEL',
  'NELLO',
  'NELLA',
  'NEI',
  'NEGLI',
  'NELLE',
  'AL',
  'ALLO',
  'ALLA',
  'AI',
  'AGLI',
  'ALLE',
  'DAL',
  'DALLO',
  'DALLA',
  'DAI',
  'DAGLI',
  'DALLE',
  'SUL',
  'SULLO',
  'SULLA',
  'SUI',
  'SUGLI',
  'SULLE',
  'COL',
  'COI',
  'COGLI',
  'PEL',
  'PELLO',
  'PEI',
  'PEGLI',
  'GLIELO',
  'GLIELA',
  'GLIELI',
  'GLIELE',
  'GLIENE',
])

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
  if (/[\d\s\-.'’_/]/.test(word)) return null
  const re: Record<SelectLang, RegExp> = {
    en: /^[A-Z]+$/,
    de: /^[A-ZÄÖÜß]+$/,
    es: /^[A-ZÁÉÍÓÚÜÑ]+$/,
    pt: /^[A-ZÁÀÂÃÉÊÍÓÔÕÚÇ]+$/,
    // No Æ / Ÿ / Ù / Ü. Œ is one letter (U+0152), not O+E.
    fr: /^[A-ZÀÂÇÉÈÊËÎÏÔÛŒ]+$/,
    // À È É Ì Ò Ù only. Í / Î / Ó / Ú stay out (ADR 0040 addendum).
    it: /^[A-ZÀÈÉÌÒÙ]+$/,
  }
  if (!re[lang].test(word)) return null
  if (lang === 'fr' && FR_ELISION_STUBS.has(word)) return null
  if (lang === 'it' && IT_FUSED_FORMS.has(word)) return null
  if (/^(.)\1+$/.test(word)) return null
  if (denylist && isDeniedLemma(word, denylist, lang)) return null
  return word
}

/** DE fold so STRAßE ↔ STRASSE collide without preferring damaged SS forms. */
export function foldKey(lang: SelectLang, word: string): string {
  const w = nfcUpper(word)
  if (lang === 'de') return w.replaceAll('ß', 'SS')
  // Grave/acute E only (événement / évènement). Do not strip accents:
  // MÛR≠MUR, SÛR≠SUR, PÊCHE≠PÉCHÉ (ADR 0040).
  if (lang === 'fr') return w.replaceAll('È', 'É')
  return w
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

export type GrowBandPlan = {
  cefr: PackCefr
  /** Lemmas already shipped in this pack. */
  existing: number
  /** Gate-passing in-band candidates whose fold-key is not taken (uncapped). */
  capacity: number
  /** min(existing + capacity, PACK_TARGET_CAP) — the dry-run proposed target. */
  target: number
  /** Committed BAND_TARGETS value the pin range guard and --grow use. */
  bandTarget: number
  /** How many lemmas --grow may still append: min(bandTarget, target) - existing. */
  room: number
  /** The actual appends (mutates `taken`). */
  appended: string[]
}

/**
 * Plan one band of a `--grow` run (ADR 0058). `taken` must already hold the
 * fold-keys of all six packs of the language; the append pass mutates it so
 * later bands stay exclusive. Pure: no I/O.
 */
export function planGrowBand(
  lang: SelectLang,
  cefr: PackCefr,
  existingWords: readonly string[],
  candidates: string[],
  taken: Set<string>,
  denylist?: Set<string>,
): GrowBandPlan {
  const existing = existingWords.length
  const capacity = takeExclusive(
    lang,
    candidates,
    new Set(taken),
    Number.MAX_SAFE_INTEGER,
    denylist,
  ).length
  const target = Math.min(existing + capacity, PACK_TARGET_CAP)
  const band = bandTarget(lang, cefr)
  const room = Math.max(0, Math.min(band, target) - existing)
  const appended = takeExclusive(lang, candidates, taken, room, denylist)
  return { cefr, existing, capacity, target, bandTarget: band, room, appended }
}

/**
 * Hard-refuse any rewrite of an existing slot under `--grow` (ADR 0058):
 * the new lemma array must keep the old array as an exact word-prefix.
 */
export function assertGrowAppendOnly(
  rel: string,
  before: readonly { word: string }[],
  after: readonly { word: string }[],
): void {
  if (after.length < before.length) {
    throw new Error(
      `${rel}: --grow is append-only; lemma count shrank ${before.length} -> ${after.length}`,
    )
  }
  for (let i = 0; i < before.length; i++) {
    const prev = nfcUpper(before[i]!.word)
    const next = nfcUpper(after[i]!.word)
    if (prev !== next) {
      throw new Error(
        `${rel}: --grow refuses to rewrite slot ${i} ("${before[i]!.word}" -> "${after[i]!.word}")`,
      )
    }
  }
}

/**
 * Expand may only write b2|c1|c2 files.
 * `bootstrapLang` allows a one-time write of missing `{lang}/a1|a2|b1`
 * (ADR 0040). The caller sets it only when that language has no pack yet.
 * `grow` is the one-time `--grow` unfreeze of a1–b1 for every language
 * (ADR 0040 addendum, ADR 0058) — still only real `{lang}/{cefr}.json` paths.
 */
export function assertPackWriteAllowed(
  filePath: string,
  cefr: string,
  opts?: { bootstrapLang?: string; grow?: boolean },
): void {
  const posix = filePath.replace(/\\/g, '/')
  const base = posix.split('/').pop()?.toLowerCase() ?? ''
  const boot = opts?.bootstrapLang
  const lowOk =
    (boot === 'fr' || boot === 'it') &&
    new RegExp(`/${boot}/(a1|a2|b1)\\.json$`).test(posix) &&
    (cefr === 'a1' || cefr === 'a2' || cefr === 'b1')
  const growOk =
    opts?.grow === true &&
    (PACK_CEFR_LEVELS as readonly string[]).includes(cefr) &&
    base === `${cefr}.json`
  if (!lowOk && !growOk && (isExistingCefr(cefr) || /^(a1|a2|b1)\.json$/.test(base))) {
    throw new Error(
      `refuses to overwrite ${base || cefr + '.json'}; expand writes only ${NEW_CEFRS.join('|')}`,
    )
  }
  if (!lowOk && !growOk && !isNewCefr(cefr)) {
    throw new Error(`expand writes only ${NEW_CEFRS.join('|')} (got ${cefr})`)
  }
}
