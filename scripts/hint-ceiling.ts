/**
 * Hint ceiling: a gloss/synonym token fails when its easiest candidate band
 * is strictly above the pack (pack lemma, stem, or English CEFR-J/Octanove tag).
 * The scorer runs on every band. packs:check still fails only A1–B1. Pure — no I/O.
 */
import { foldKey, type SelectLang } from './pack-select'
import { isPackLang, type PackCefr, type PackLang } from '../src/packs/schema'

export const CEFR_RANK: Record<string, number> = {
  a1: 0,
  a2: 1,
  b1: 2,
  b2: 3,
  c1: 4,
  c2: 5,
}

/** Bands packs:check fails. The scorer itself runs on B2–C2 too. */
export const HINT_CEILING_SUBJECT_BANDS = new Set(['a1', 'a2', 'b1'])

/**
 * Enforce the ceiling when `rel` is a pack language + A1–B1 subject band
 * (issue #50: all twelve en/de/es/pt × a1/a2/b1). No per-rel allowlist.
 */
export function isHintCeilingEnforcedRel(rel: string): boolean {
  const m = /^([a-z]{2})\/([a-z][0-9])\.json$/.exec(rel)
  if (!m) return false
  const [, lang, cefr] = m
  return isPackLang(lang) && HINT_CEILING_SUBJECT_BANDS.has(cefr!)
}

const TOKEN_RE = /[\p{L}\p{M}]+/gu

export function cefrAbove(candidate: string, packBand: string): boolean {
  const a = CEFR_RANK[candidate]
  const b = CEFR_RANK[packBand]
  if (a === undefined || b === undefined) return false
  return a > b
}

export function isHintCeilingSubjectBand(band: string): boolean {
  return HINT_CEILING_SUBJECT_BANDS.has(band)
}

export type HintCeilingHit = {
  token: string
  kind: 'gloss' | 'synonym'
  band: string
  via: 'pack' | 'cefr-tag' | 'stem'
  lemma?: string
}

export type HintCeilingInputs = {
  lang: PackLang | SelectLang
  packBand: string
  gloss: string
  synonyms: readonly string[]
  /** foldKey → easiest pack band that contains the lemma */
  lemmaEasiestBand: Map<string, string> | ReadonlyMap<string, string>
  /** foldKey surface → folded stem lemmas (empty/missing → use surface) */
  stemCache: Map<string, string[]> | ReadonlyMap<string, string[]> | Record<string, string[]>
  /** English easiest CEFR-J/Octanove tag; ignored when lang !== 'en' */
  enEasiestTag?: Map<string, string> | ReadonlyMap<string, string> | Record<string, string> | null
}

function stemLookup(
  cache: HintCeilingInputs['stemCache'],
  key: string,
): string[] | undefined {
  if (cache instanceof Map) return cache.get(key)
  return (cache as Record<string, string[]>)[key]
}

function tagLookup(
  tags: NonNullable<HintCeilingInputs['enEasiestTag']>,
  key: string,
): string | undefined {
  if (tags instanceof Map) return tags.get(key)
  return (tags as Record<string, string>)[key]
}

function tokenize(text: string): string[] {
  const out: string[] = []
  for (const m of text.matchAll(TOKEN_RE)) {
    const t = m[0]
    if (t.length >= 3) out.push(t)
  }
  return out
}

function candidatesFor(
  lang: SelectLang,
  surface: string,
  stemCache: HintCeilingInputs['stemCache'],
): { folded: string; viaStem: boolean }[] {
  const folded = foldKey(lang, surface)
  const stems = stemLookup(stemCache, folded) ?? []
  // Keep the surface even when stems exist, then take the easiest band.
  // WASSER stems only to C2 WASSERN; the A1 surface must still be a candidate.
  const out: { folded: string; viaStem: boolean }[] = [{ folded, viaStem: false }]
  for (const s of stems) {
    out.push({ folded: foldKey(lang, s), viaStem: true })
  }
  return out
}

/**
 * Fail a token only when the easiest candidate band is strictly above the pack.
 * No pack/tag hit → pass. Scores every band; packs:check gates on A1–B1.
 */
export function hintCeilingViolations(input: HintCeilingInputs): HintCeilingHit[] {
  const { lang, packBand, gloss, synonyms } = input

  const hits: HintCeilingHit[] = []
  const seen = new Set<string>()

  const checkToken = (raw: string, kind: 'gloss' | 'synonym') => {
    const cands = candidatesFor(lang as SelectLang, raw, input.stemCache)
    let minPack: string | undefined
    let minLemma: string | undefined
    let viaStem = false

    for (const c of cands) {
      const band = input.lemmaEasiestBand.get(c.folded)
      if (!band) continue
      if (
        minPack === undefined ||
        (CEFR_RANK[band] ?? 99) < (CEFR_RANK[minPack] ?? 99)
      ) {
        minPack = band
        minLemma = c.folded
        viaStem = c.viaStem
      }
    }

    if (minPack && cefrAbove(minPack, packBand)) {
      const key = `${kind}:pack:${foldKey(lang as SelectLang, raw)}:${minPack}`
      if (!seen.has(key)) {
        seen.add(key)
        hits.push({
          token: raw,
          kind,
          band: minPack,
          via: viaStem ? 'stem' : 'pack',
          lemma: minLemma,
        })
      }
    }

    if (lang === 'en' && input.enEasiestTag) {
      const foldKeys = new Set<string>([
        foldKey('en', raw),
        ...cands.map((c) => c.folded),
      ])
      let minTag: string | undefined
      for (const fk of foldKeys) {
        const tag = tagLookup(input.enEasiestTag, fk)
        if (!tag) continue
        if (
          minTag === undefined ||
          (CEFR_RANK[tag] ?? 99) < (CEFR_RANK[minTag] ?? 99)
        ) {
          minTag = tag
        }
      }
      if (minTag && cefrAbove(minTag, packBand)) {
        const key = `${kind}:tag:${foldKey('en', raw)}:${minTag}`
        if (!seen.has(key)) {
          seen.add(key)
          hits.push({
            token: raw,
            kind,
            band: minTag,
            via: 'cefr-tag',
          })
        }
      }
    }
  }

  for (const t of tokenize(gloss ?? '')) checkToken(t, 'gloss')
  for (const chip of synonyms ?? []) {
    for (const t of tokenize(chip)) checkToken(t, 'synonym')
  }
  return hits
}

/** Easiest pack band per folded lemma for one language. */
export function buildLemmaEasiestBand(
  lang: SelectLang,
  packs: { cefr: string; lemmas: { word: string }[] }[],
): Map<string, string> {
  const out = new Map<string, string>()
  for (const pack of packs) {
    const band = pack.cefr.toLowerCase()
    if (!(band in CEFR_RANK)) continue
    for (const L of pack.lemmas) {
      const k = foldKey(lang, L.word)
      const prev = out.get(k)
      if (
        prev === undefined ||
        (CEFR_RANK[band] ?? 99) < (CEFR_RANK[prev] ?? 99)
      ) {
        out.set(k, band)
      }
    }
  }
  return out
}

export type PackBandSnapshot = {
  rel: string
  pack: { lang: string; cefr: string; lemmas: { word: string }[] }
}

/** lang → foldKey → easiest band, from a full pack snapshot list. */
export function buildLemmaEasiestByLang(
  snapshots: PackBandSnapshot[],
): Map<string, Map<string, string>> {
  const byLang = new Map<string, { cefr: string; lemmas: { word: string }[] }[]>()
  for (const { pack } of snapshots) {
    const list = byLang.get(pack.lang) ?? []
    list.push(pack)
    byLang.set(pack.lang, list)
  }
  const out = new Map<string, Map<string, string>>()
  for (const [lang, packs] of byLang) {
    out.set(lang, buildLemmaEasiestBand(lang as SelectLang, packs))
  }
  return out
}

export type { PackCefr }
