/**
 * Shared NSFW / violence / slur denylist.
 * Exact lines live in lemma-denylist.txt (global `WORD` or scoped `lang WORD`).
 * Conjugation patterns live in lemma-denylist-patterns.txt and match the whole
 * lemma only (`^…$` over nfcUpper). Homographs a pattern would catch are listed
 * in lemma-denylist-allow.txt and are exempt after a pattern hit, not after an
 * exact hit (ADR 0040: scoped lines do not block another language).
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const DIR = path.dirname(fileURLToPath(import.meta.url))
const FILE = path.join(DIR, 'data', 'lemma-denylist.txt')
const PATTERN_FILE = path.join(DIR, 'data', 'lemma-denylist-patterns.txt')
const ALLOW_FILE = path.join(DIR, 'data', 'lemma-denylist-allow.txt')

/** Preserve German ß under uppercasing (JS toUpperCase maps ß→SS). */
export function nfcUpper(s: string): string {
  const PH = '\uE000'
  return s.replaceAll('ß', PH).normalize('NFC').toUpperCase().replaceAll(PH, 'ß')
}

let cached: Set<string> | null = null

export function loadDenylist(): Set<string> {
  if (cached) return cached
  cached = parseExactDenylist(readFileSync(FILE, 'utf8'))
  return cached
}

/** Parse exact-list text. Throws on a bad line. */
export function parseExactDenylist(text: string): Set<string> {
  const set = new Set<string>()
  for (const line of text.split('\n')) {
    const w = line.split('#')[0]?.trim()
    if (!w) continue
    const parts = w.split(/\s+/)
    if (parts.length === 1) {
      set.add(nfcUpper(parts[0]!))
      continue
    }
    if (parts.length === 2 && /^[a-z]{2}$/i.test(parts[0]!)) {
      set.add(`${parts[0]!.toLowerCase()} ${nfcUpper(parts[1]!)}`)
      continue
    }
    throw new Error(`lemma-denylist: expected "WORD" or "lang WORD", got ${JSON.stringify(w)}`)
  }
  return set
}

const LETTERS = /^[\p{L}ß]+$/u

export type PatternRule = {
  /** Null is a global pattern. */
  lang: string | null
  /** nfcUpper stem, for tests. */
  stem: string
  re: RegExp
}

export type AllowEntry = {
  lang: string
  word: string
  reason: string
}

/**
 * One pattern line is `STEM(SUFFIX|…)` or `lang STEM(SUFFIX|…)`.
 * Compiled to `^STEM(?:SUFFIX|…)$` after nfcUpper. A bare stem needs an empty
 * alternative (`FUCK(|ING)`), never a substring.
 */
export function parsePatternDenylist(text: string): PatternRule[] {
  const rules: PatternRule[] = []
  for (const [i, line] of text.split('\n').entries()) {
    const raw = line.split('#')[0]?.trim()
    if (!raw) continue
    const m = /^(?:([A-Za-z]{2})\s+)?(\S+)\(([^)]*)\)$/.exec(raw)
    if (!m) {
      throw new Error(
        `lemma-denylist-patterns:${i + 1}: expected "STEM(SUF|SUF)" or "lang STEM(SUF|SUF)", got ${JSON.stringify(raw)}`,
      )
    }
    const lang = m[1] ? m[1].toLowerCase() : null
    if (lang !== null && !/^[a-z]{2}$/.test(lang)) {
      throw new Error(`lemma-denylist-patterns:${i + 1}: bad lang ${JSON.stringify(m[1])}`)
    }
    const stem = nfcUpper(m[2]!)
    if (!stem || !LETTERS.test(stem)) {
      throw new Error(`lemma-denylist-patterns:${i + 1}: stem must be letters, got ${JSON.stringify(m[2])}`)
    }
    if (m[3] === '') {
      throw new Error(`lemma-denylist-patterns:${i + 1}: empty suffix group`)
    }
    const suffixes = m[3]!.split('|').map((s) => nfcUpper(s))
    for (const suf of suffixes) {
      if (suf !== '' && !LETTERS.test(suf)) {
        throw new Error(
          `lemma-denylist-patterns:${i + 1}: suffix must be letters, got ${JSON.stringify(suf)}`,
        )
      }
    }
    const body = suffixes.map(escapeRegExp).join('|')
    rules.push({
      lang,
      stem,
      re: new RegExp(`^${escapeRegExp(stem)}(?:${body})$`),
    })
  }
  return rules
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** `lang WORD # reason`. A pattern must match the word or the guard calls it stale. */
export function parseAllowlist(text: string): AllowEntry[] {
  const out: AllowEntry[] = []
  for (const [i, line] of text.split('\n').entries()) {
    const raw = line.trim()
    if (!raw || raw.startsWith('#')) continue
    const hash = raw.indexOf('#')
    if (hash < 0) {
      throw new Error(`lemma-denylist-allow:${i + 1}: expected "lang WORD # reason", got ${JSON.stringify(raw)}`)
    }
    const reason = raw.slice(hash + 1).trim()
    const head = raw.slice(0, hash).trim()
    const parts = head.split(/\s+/)
    if (!reason || reason.includes('\n')) {
      throw new Error(`lemma-denylist-allow:${i + 1}: missing reason`)
    }
    if (parts.length !== 2 || !/^[a-z]{2}$/i.test(parts[0]!)) {
      throw new Error(`lemma-denylist-allow:${i + 1}: expected "lang WORD # reason", got ${JSON.stringify(head)}`)
    }
    out.push({ lang: parts[0]!.toLowerCase(), word: nfcUpper(parts[1]!), reason })
  }
  return out
}

let patternCache: PatternRule[] | null = null
let allowCache: AllowEntry[] | null = null

export function loadPatternDenylist(): PatternRule[] {
  if (patternCache) return patternCache
  patternCache = parsePatternDenylist(readFileSync(PATTERN_FILE, 'utf8'))
  return patternCache
}

export function loadDenylistAllow(): AllowEntry[] {
  if (allowCache) return allowCache
  allowCache = parseAllowlist(readFileSync(ALLOW_FILE, 'utf8'))
  return allowCache
}

export function resetDenylistCache(): void {
  cached = null
  patternCache = null
  allowCache = null
}

/** True when a global pattern, or a pattern scoped to `lang`, matches the whole lemma. */
export function matchesDeniedPattern(
  word: string,
  lang?: string,
  rules: readonly PatternRule[] = loadPatternDenylist(),
): boolean {
  const w = nfcUpper(word)
  const L = lang?.toLowerCase()
  for (const rule of rules) {
    if (rule.lang !== null && rule.lang !== L) continue
    if (rule.re.test(w)) return true
  }
  return false
}

export function isPatternAllowlisted(
  word: string,
  lang?: string,
  allow: readonly AllowEntry[] = loadDenylistAllow(),
): boolean {
  const w = nfcUpper(word)
  const L = lang?.toLowerCase()
  return allow.some((e) => e.word === w && e.lang === L)
}

/** Allow entries no scoped-or-global pattern matches. */
export function staleAllowEntries(
  rules: readonly PatternRule[] = loadPatternDenylist(),
  allow: readonly AllowEntry[] = loadDenylistAllow(),
): AllowEntry[] {
  return allow.filter((e) => !matchesDeniedPattern(e.word, e.lang, rules))
}

/**
 * Exact hit, then a whole-lemma pattern hit that is not allowlisted.
 * An exact entry stays denied even if the allowlist names it.
 */
export function isDeniedLemma(
  word: string,
  denylist = loadDenylist(),
  lang?: string,
): boolean {
  const w = nfcUpper(word)
  if (denylist.has(w)) return true
  if (lang && denylist.has(`${lang.toLowerCase()} ${w}`)) return true
  if (!matchesDeniedPattern(w, lang)) return false
  if (isPatternAllowlisted(w, lang)) return false
  return true
}
