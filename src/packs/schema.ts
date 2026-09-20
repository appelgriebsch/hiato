/** Pack / lemma types (ADR 0006, 0023, 0027). */

export type PackLang = 'en' | 'de' | 'es' | 'pt'

/** All CEFR codes the app can address (picker still uses PACK_CEFRS). */
export const PACK_CEFR_LEVELS = ['a1', 'a2', 'b1', 'b2', 'c1', 'c2'] as const
export type PackCefr = (typeof PACK_CEFR_LEVELS)[number]

/** Display order matches G0 LanguageSelect: EN / PT / DE / ES. */
export const PACK_LANGS: PackLang[] = ['en', 'pt', 'de', 'es']

/** Shipped CEFR bands in the picker and pack completeness (B2–C2 files: #29). */
export const PACK_CEFRS = ['a1', 'a2', 'b1'] as const satisfies readonly PackCefr[]

/** Workbox runtime cache for on-demand / selected-lang packs (ADR 0006). */
export const PACK_SW_CACHE = 'hiato-packs'

/** Runtime-cache matcher; keep in sync with vite-plugin-pwa urlPattern. */
export const PACK_ASSET_PATH_RE = new RegExp(
  `^/packs/(${PACK_LANGS.join('|')})/(${PACK_CEFR_LEVELS.join('|')})\\.json$`,
)

export function packUrl(lang: PackLang, cefr: PackCefr): string {
  return `/packs/${lang}/${cefr}.json`
}

export interface PackLemma {
  /** Target word (display / answer). NFC recommended. */
  word: string
  /** Same-language gloss — must not contain `word` (ADR 0023). */
  gloss?: string
  /** Same-language synonym chips (≤3 shown) — must not contain `word`. */
  synonyms?: string[]
}

export interface WordPack {
  version: number
  lang: PackLang
  cefr: PackCefr
  license: string
  attribution: string[]
  lemmas: PackLemma[]
}

export function isPackLang(v: unknown): v is PackLang {
  return v === 'en' || v === 'de' || v === 'es' || v === 'pt'
}

export function isPackCefr(v: unknown): v is PackCefr {
  return (PACK_CEFR_LEVELS as readonly string[]).includes(v as string)
}
