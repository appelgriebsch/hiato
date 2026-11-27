import type { en } from './locales/en'

/** UI locales reuse the six pack-language codes (ADR 0062). */
export type UILocale = 'en' | 'pt' | 'de' | 'es' | 'fr' | 'it'

export const UI_LOCALES: readonly UILocale[] = ['en', 'pt', 'de', 'es', 'fr', 'it']

/** Every UI copy key; derived from the English catalog so tsc fails on drift. */
export type UiKey = keyof typeof en
