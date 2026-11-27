import type { PackCefr, PackLang, PackPos } from './schema'

export const LANG_LABELS: Record<PackLang, string> = {
  en: 'English',
  pt: 'Português',
  de: 'Deutsch',
  es: 'Español',
  fr: 'Français',
  it: 'Italiano',
}

export const LANG_CODES: Record<PackLang, string> = {
  en: 'EN',
  pt: 'PT',
  de: 'DE',
  es: 'ES',
  fr: 'FR',
  it: 'IT',
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
  fr: 'Pas d’indice pour ce mot',
  it: 'Nessun indizio per questa parola',
}

/** Localized aria-label for EndCard tap-to-speak (ADR 0037 / #117). */
export const SPEAK_LEMMA_ARIA: Record<PackLang, string> = {
  en: 'Hear the word',
  pt: 'Ouvir a palavra',
  de: 'Wort anhören',
  es: 'Escuchar la palabra',
  fr: 'Écouter le mot',
  it: 'Ascolta la parola',
}

/** Aria-label for the speak control; missing keys fall back to EN. */
export function speakLemmaAriaLabel(lang: PackLang): string {
  return SPEAK_LEMMA_ARIA[lang] ?? SPEAK_LEMMA_ARIA.en
}

/** Localized POS chip labels in the pack language (ADR 0055; glosses are same-language per ADR 0030). */
export const POS_LABELS: Record<PackLang, Record<PackPos, string>> = {
  en: { noun: 'noun', verb: 'verb', adjective: 'adjective', adverb: 'adverb' },
  pt: { noun: 'substantivo', verb: 'verbo', adjective: 'adjetivo', adverb: 'advérbio' },
  de: { noun: 'Substantiv', verb: 'Verb', adjective: 'Adjektiv', adverb: 'Adverb' },
  es: { noun: 'sustantivo', verb: 'verbo', adjective: 'adjetivo', adverb: 'adverbio' },
  fr: { noun: 'nom', verb: 'verbe', adjective: 'adjectif', adverb: 'adverbe' },
  it: { noun: 'sostantivo', verb: 'verbo', adjective: 'aggettivo', adverb: 'avverbio' },
}

/** POS chip label; missing keys fall back to EN. */
export function posLabel(lang: PackLang, pos: PackPos): string {
  return POS_LABELS[lang]?.[pos] ?? POS_LABELS.en[pos]
}

// The per-level picker line is UI copy now: t(`language.cefrLine.${cefr}`) (ADR 0062).
