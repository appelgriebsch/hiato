/**
 * French A1–C2 selection from wordhoard v0.1.0 (ADR 0040).
 * A1–B1 use the cefr_estimate rank cuts. B2–C2 use DE_ES_BANDS index
 * windows on the hangman-filtered list. No cross-band borrow.
 */
import { nfcUpper } from './lemma-denylist'
import {
  DE_ES_BANDS,
  TARGET,
  foldKey,
  hangmanOk,
  type NewCefr,
  type SelectLang,
} from './pack-select'

/** Wordhoard languages that share the FR band planner (ADR 0040). */
export type WordhoardBandLang = Extract<SelectLang, 'fr' | 'it'>

/** Citation infinitives only. Participles and cliticized verbs stay out. */
const IT_INFINITIVE = /(?:ARE|ERE|IRE|URRE|ORRE)$/

export const FR_RANK_CEILING = { a1: 750, a2: 1500, b1: 3000 } as const

export type FrCefr = 'a1' | 'a2' | 'b1' | NewCefr

export type FrSourceRow = {
  lemma: string
  pos: string
  rank: number
}

export type FrFiltered = { word: string; rank: number }

export type FrBandPlan = {
  bands: Record<FrCefr, string[]>
  /** Rank or filtered-index ceiling actually used (raised only if the band was short). */
  ceilings: Record<FrCefr, number>
  filtered: number
}

const LOW_BANDS = ['a1', 'a2', 'b1'] as const

function foldTaken(
  lang: WordhoardBandLang,
  word: string,
  taken: Set<string>,
): boolean {
  return taken.has(foldKey(lang, word))
}

/**
 * Hangman-filtered FR rows in frequency order.
 * Drops inflected VERB rows (ADJ participles stay). Keeps the more frequent
 * È/É spelling variant via foldKey. Does not apply the person-name skip —
 * FR uses the name-list AND person-name-gloss rule at every level.
 */
export function filterFrRows(
  rows: readonly FrSourceRow[],
  inflectedVerbs: ReadonlySet<string>,
  accept: (word: string) => boolean,
  denylist?: Set<string>,
  lang: WordhoardBandLang = 'fr',
): FrFiltered[] {
  const sorted = [...rows].sort((a, b) => a.rank - b.rank)
  const seen = new Set<string>()
  const out: FrFiltered[] = []
  for (const row of sorted) {
    if (lang === 'it') {
      if (row.pos === 'VERB' && !IT_INFINITIVE.test(nfcUpper(row.lemma))) continue
    } else if (row.pos === 'VERB' && inflectedVerbs.has(nfcUpper(row.lemma))) {
      continue
    }
    const word = hangmanOk(lang, row.lemma, denylist)
    if (!word || !accept(word)) continue
    const key = foldKey(lang, word)
    if (seen.has(key)) continue
    seen.add(key)
    out.push({ word, rank: row.rank })
  }
  return out
}

function takePool(
  lang: WordhoardBandLang,
  pool: readonly FrFiltered[],
  taken: Set<string>,
  want: number,
): string[] {
  const out: string[] = []
  for (const it of pool) {
    if (foldTaken(lang, it.word, taken)) continue
    taken.add(foldKey(lang, it.word))
    out.push(it.word)
    if (out.length >= want) break
  }
  return out
}

export function selectFrBands(
  rows: readonly FrSourceRow[],
  opts: {
    inflectedVerbs: ReadonlySet<string>
    accept: (word: string) => boolean
    denylist?: Set<string>
    target?: number
    surplus?: number
    rankCeiling?: { a1: number; a2: number; b1: number }
    indexBands?: Record<NewCefr, readonly [number, number]>
    lang?: WordhoardBandLang
  },
): FrBandPlan {
  const lang = opts.lang ?? 'fr'
  const target = opts.target ?? TARGET
  const surplus = opts.surplus ?? 0
  const want = target + surplus
  const rankCeiling = { ...FR_RANK_CEILING, ...opts.rankCeiling }
  const indexBands = opts.indexBands ?? DE_ES_BANDS
  const filtered = filterFrRows(
    rows,
    opts.inflectedVerbs,
    opts.accept,
    opts.denylist,
    lang,
  )
  const taken = new Set<string>()
  const bands = {
    a1: [] as string[],
    a2: [] as string[],
    b1: [] as string[],
    b2: [] as string[],
    c1: [] as string[],
    c2: [] as string[],
  }
  const ceilings: Record<FrCefr, number> = {
    a1: rankCeiling.a1,
    a2: rankCeiling.a2,
    b1: rankCeiling.b1,
    b2: indexBands.b2[1],
    c1: indexBands.c1[1],
    c2: indexBands.c2[1],
  }

  let lo = 0
  for (const band of LOW_BANDS) {
    const initialHi = rankCeiling[band]
    const window = filtered.filter(
      (it) => it.rank > lo && it.rank <= initialHi && !foldTaken(lang, it.word, taken),
    )
    let pool = window
    let hi = initialHi
    if (pool.length < want) {
      const extra = filtered.filter(
        (it) => it.rank > hi && !foldTaken(lang, it.word, taken),
      )
      for (const it of extra) {
        pool = [...pool, it]
        hi = it.rank
        if (pool.length >= want) break
      }
    }
    bands[band] = takePool(lang, pool, taken, want)
    ceilings[band] = hi
    lo = hi
  }

  const indexLo: Record<NewCefr, number> = {
    b2: indexBands.b2[0],
    c1: indexBands.c1[0],
    c2: indexBands.c2[0],
  }
  const indexHi: Record<NewCefr, number> = {
    b2: indexBands.b2[1],
    c1: indexBands.c1[1],
    c2: indexBands.c2[1],
  }
  for (const band of ['b2', 'c1', 'c2'] as const) {
    let hi = indexHi[band]
    const gather = (end: number): FrFiltered[] => {
      const out: FrFiltered[] = []
      const start = indexLo[band]
      for (let i = start; i < end && i < filtered.length; i++) {
        const it = filtered[i]!
        if (foldTaken(lang, it.word, taken)) continue
        out.push(it)
      }
      return out
    }
    let pool = gather(hi)
    while (pool.length < want && hi < filtered.length) {
      hi += 1
      if (band === 'b2') indexLo.c1 = Math.max(indexLo.c1, hi)
      if (band === 'c1') indexLo.c2 = Math.max(indexLo.c2, hi)
      pool = gather(hi)
    }
    bands[band] = takePool(lang, pool, taken, want)
    ceilings[band] = hi
  }

  return { bands, ceilings, filtered: filtered.length }
}

/** Italian bands: same windows as FR, infinitive verbs only (ADR 0040). */
export function selectItBands(
  rows: readonly FrSourceRow[],
  opts: Omit<Parameters<typeof selectFrBands>[1], 'lang'>,
): FrBandPlan {
  return selectFrBands(rows, { ...opts, lang: 'it' })
}
