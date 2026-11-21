/** Shared gate version + key shape for lemma extras (ADR 0055 / #316, #316 packs:check enforcement). */
import { nfcUpper } from './lemma-denylist'

export const EXTRAS_GATE_VERSION = 1

export function isCurrentExtrasPass(
  entry: { verdict?: string; gate?: number } | null | undefined,
): boolean {
  return entry?.verdict === 'pass' && entry.gate === EXTRAS_GATE_VERSION
}

export type ExtrasGateEntry = {
  /** ipa string, or family array for family keys. */
  value: string | string[]
  source: 'wiktextract' | 'mistral'
  verdict: 'pass' | 'reject'
  gate: number
  at: string
}

export type ExtrasGateLog = Record<string, ExtrasGateEntry>

export function extrasGateKey(lang: string, word: string, field: 'ipa' | 'family'): string {
  return `${lang}|${nfcUpper(word)}|${field}`
}
