/** Pack / lemma types (ADR 0006, 0023, 0027, 0055). */

export type PackLang = 'en' | 'de' | 'es' | 'pt' | 'fr' | 'it'

/** Part-of-speech codes stored on a lemma (ADR 0055); localized via POS_LABELS. */
export const PACK_POS = ['noun', 'verb', 'adjective', 'adverb'] as const
export type PackPos = (typeof PACK_POS)[number]

/** All CEFR codes the app can address. */
export const PACK_CEFR_LEVELS = ['a1', 'a2', 'b1', 'b2', 'c1', 'c2'] as const
export type PackCefr = (typeof PACK_CEFR_LEVELS)[number]

/** Display order: EN / PT / DE / ES, then FR, then IT (ADR 0040). */
export const PACK_LANGS: PackLang[] = ['en', 'pt', 'de', 'es', 'fr', 'it']

/** Shipped CEFR bands in the picker, precache, purge, and pack completeness. */
export const PACK_CEFRS = [
  'a1',
  'a2',
  'b1',
  'b2',
  'c1',
  'c2',
] as const satisfies readonly PackCefr[]

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
  /** Same-language gloss in `pack.lang` (ADR 0030) — must not contain `word` (ADR 0023). */
  gloss?: string
  /** Same-language synonym chips (≤3 shown) — must not contain `word`. */
  synonyms?: string[]
  /** One example sentence in `pack.lang` (ADR 0049) — must contain `word` as a whole word; EndCard-only. */
  example?: string
  /** Part of speech code (ADR 0055) — label localized in-app; EndCard-only. */
  pos?: PackPos
  /** One `/…/` IPA transcription in `pack.lang` (ADR 0055); EndCard-only. */
  ipa?: string
  /** Derivational relatives in `pack.lang` (≤ FAMILY_MAX, ADR 0055); EndCard-only. */
  family?: string[]
}

/** Max length of a lemma example sentence (ADR 0049 length cap). */
export const EXAMPLE_SENTENCE_MAX = 160

/** Max length of a lemma IPA transcription, slashes included (ADR 0055). */
export const IPA_MAX = 40

/** Max number of word-family chips per lemma (ADR 0055). */
export const FAMILY_MAX = 3

export interface WordPack {
  version: number
  lang: PackLang
  cefr: PackCefr
  license: string
  attribution: string[]
  lemmas: PackLemma[]
}

export function isPackLang(v: unknown): v is PackLang {
  return typeof v === 'string' && (PACK_LANGS as readonly string[]).includes(v)
}

export function isPackCefr(v: unknown): v is PackCefr {
  return (PACK_CEFR_LEVELS as readonly string[]).includes(v as string)
}

export function isPackPos(v: unknown): v is PackPos {
  return typeof v === 'string' && (PACK_POS as readonly string[]).includes(v)
}
