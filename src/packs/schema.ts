/** Pack / lemma types (ADR 0006, 0023). */

export type PackLang = 'en' | 'de' | 'es' | 'pt'
export type PackCefr = 'a1' | 'a2' | 'b1'

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
  return v === 'a1' || v === 'a2' || v === 'b1'
}
