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
  b2: 'B2 · Upper-intermediate',
  c1: 'C1 · Advanced',
  c2: 'C2 · Proficiency',
}

export const CEFR_CODES: Record<PackCefr, string> = {
  a1: 'A1',
  a2: 'A2',
  b1: 'B1',
  b2: 'B2',
  c1: 'C1',
  c2: 'C2',
}

/** Localized empty-state for the learner-hint strip. */
export const NO_HINT_COPY: Record<PackLang, string> = {
  en: 'No hint for this word',
  pt: 'Sem dica para esta palavra',
  de: 'Kein Hinweis für dieses Wort',
  es: 'Sin pista para esta palabra',
}
