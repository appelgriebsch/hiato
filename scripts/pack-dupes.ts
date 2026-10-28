/**
 * Accent-only pairs (ADR 0028 addendum).
 * Accents stay distinct letters (ADR 0005). DE ß/SS and FR È/É stay on foldKey
 * and are reported by exclusiveConflicts, not here.
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { nfcUpper } from './lemma-denylist'
import { foldKey, type SelectLang } from './pack-select'

export type AccentAllowEntry = {
  words: string[]
  reason: string
}

export type AccentAllowlist = Partial<Record<SelectLang, readonly AccentAllowEntry[]>>

export type DupeFile = {
  rel: string
  lang: string
  lemmas: readonly { word: string }[]
}

const LANGS = new Set<string>(['en', 'de', 'es', 'pt', 'fr', 'it'])

/** NFD, strip marks, lowercase, ß→ss. Distinct foldKeys with this key are accent-only. */
export function accentKey(word: string): string {
  return word.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replaceAll('ß', 'ss')
}

export function parseAccentAllowlist(raw: unknown): AccentAllowlist {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error('accent-pair allowlist must be an object of lang → entries')
  }
  const out: AccentAllowlist = {}
  for (const [lang, entries] of Object.entries(raw)) {
    if (!LANGS.has(lang)) throw new Error(`accent-pair allowlist: unknown lang ${lang}`)
    if (!Array.isArray(entries)) throw new Error(`accent-pair allowlist: ${lang} must be an array`)
    const seenSets = new Set<string>()
    out[lang as SelectLang] = entries.map((entry, i) => {
      if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
        throw new Error(`accent-pair allowlist: ${lang}[${i}] must be an object`)
      }
      const e = entry as { words?: unknown; reason?: unknown }
      if (!Array.isArray(e.words) || e.words.length < 2) {
        throw new Error(`accent-pair allowlist: ${lang}[${i}].words must list at least two lemmas`)
      }
      const words = e.words.map((w, j) => {
        if (typeof w !== 'string' || !w.trim()) {
          throw new Error(`accent-pair allowlist: ${lang}[${i}].words[${j}] must be a non-empty string`)
        }
        return nfcUpper(w)
      })
      if (new Set(words).size !== words.length) {
        throw new Error(`accent-pair allowlist: ${lang}[${i}] repeats a lemma`)
      }
      const setKey = [...words].sort().join('\n')
      if (seenSets.has(setKey)) {
        throw new Error(`accent-pair allowlist: ${lang} duplicate allowlist entry ${words.join('/')}`)
      }
      seenSets.add(setKey)
      if (typeof e.reason !== 'string' || !e.reason.trim() || e.reason.includes('\n')) {
        throw new Error(
          `accent-pair allowlist: ${lang} ${words.join('/')} needs a one-line reason`,
        )
      }
      return { words, reason: e.reason.trim() }
    })
  }
  return out
}

export function loadAccentAllowlist(
  file = path.join(import.meta.dir, 'data', 'accent-pair-allowlist.json'),
): AccentAllowlist {
  return parseAccentAllowlist(JSON.parse(readFileSync(file, 'utf8')))
}

function covers(entries: readonly AccentAllowEntry[], a: string, b: string): boolean {
  return entries.some((e) => e.words.includes(a) && e.words.includes(b))
}

/**
 * Accent-only pairs (same accent key, different fold keys). Fold-key clashes
 * are reported by `exclusiveConflicts` across packs and by `validatePack`
 * inside one pack. An accent-only pair fails unless some allowlist entry
 * contains both words. An entry is used when every listed word sits in that
 * one cluster; any other entry is an unused-entry error.
 */
export function packDupeErrors(
  files: readonly DupeFile[],
  allowlist: AccentAllowlist,
): string[] {
  const errors: string[] = []
  const byLang = new Map<string, DupeFile[]>()
  for (const f of files) byLang.set(f.lang, [...(byLang.get(f.lang) ?? []), f])

  const used = new Set<AccentAllowEntry>()

  for (const [lang, packs] of byLang) {
    const langKey = lang as SelectLang
    const groups = new Map<string, Map<string, { word: string; rel: string }>>()
    for (const pack of packs) {
      for (const L of pack.lemmas) {
        const word = nfcUpper(L.word)
        const ak = accentKey(word)
        const fk = foldKey(langKey, word)
        let folds = groups.get(ak)
        if (!folds) {
          folds = new Map()
          groups.set(ak, folds)
        }
        if (!folds.has(fk)) folds.set(fk, { word, rel: pack.rel })
      }
    }

    const entries = allowlist[langKey] ?? []
    for (const folds of groups.values()) {
      if (folds.size < 2) continue
      const occs = [...folds.values()]
      const words = new Set(occs.map((o) => o.word))
      for (const entry of entries) {
        if (entry.words.every((w) => words.has(w))) used.add(entry)
      }
      for (let i = 0; i < occs.length; i++) {
        for (let j = i + 1; j < occs.length; j++) {
          const a = occs[i]!
          const b = occs[j]!
          if (covers(entries, a.word, b.word)) continue
          errors.push(
            `accent-only pair "${a.word}" in ${a.rel} and "${b.word}" in ${b.rel}`,
          )
        }
      }
    }
  }

  for (const [lang, entries] of Object.entries(allowlist)) {
    for (const entry of entries ?? []) {
      if (used.has(entry)) continue
      errors.push(`unused accent-pair allowlist entry ${lang} ${entry.words.join('/')}`)
    }
  }
  return errors
}
