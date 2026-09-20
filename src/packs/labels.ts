import type { PackCefr, PackLang } from './schema'

export const LANG_LABELS: Record<PackLang, string> = {
  en: 'English',
  pt: 'Português',
  de: 'Deutsch',
  es: 'Español',
}

export const LANG_CODES: Record<PackLang, string> = {
  en: 'EN',
  pt: 'PT',
  de: 'DE',
  es: 'ES',
}

export const CEFR_LABELS: Record<PackCefr, string> = {
  a1: 'A1 · Beginner',
  a2: 'A2 · Elementary',
  b1: 'B1 · Intermediate',
}

export const CEFR_CODES: Record<PackCefr, string> = {
  a1: 'A1',
  a2: 'A2',
  b1: 'B1',
}

/** Localized empty-state for the learner-hint strip. */
export const NO_HINT_COPY: Record<PackLang, string> = {
  en: 'No hint for this word',
  pt: 'Sem dica para esta palavra',
  de: 'Kein Hinweis für dieses Wort',
  es: 'Sin pista para esta palabra',
}
