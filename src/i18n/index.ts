import { de } from './locales/de'
import { en } from './locales/en'
import { es } from './locales/es'
import { fr } from './locales/fr'
import { it } from './locales/it'
import { pt } from './locales/pt'
import { UI_LOCALES, type UILocale, type UiKey } from './types'

export { UI_LOCALES, type UILocale, type UiKey }

/** Typed catalog: one entry per locale, each covering the full UiKey set (ADR 0062). */
export const UI_COPY: Record<UILocale, Record<UiKey, string>> = {
  en,
  pt,
  de,
  es,
  fr,
  it,
}

export type TParams = Record<string, string | number>

/**
 * Look up UI copy. No silent fallthrough: the catalogs are typed and the
 * parity tests pin every locale to the full key set, so a key always resolves
 * in the requested locale. `{name}` placeholders are replaced with the
 * (stringified) param values; values render as React text, never HTML.
 */
export function t(locale: UILocale, key: UiKey, params?: TParams): string {
  let out: string = UI_COPY[locale][key]
  if (params) {
    for (const [name, value] of Object.entries(params)) {
      out = out.replaceAll(`{${name}}`, String(value))
    }
  }
  return out
}
