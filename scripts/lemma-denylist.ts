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
const GLOSS_EXEMPT_FILE = path.join(DIR, 'data', 'lemma-denylist-gloss-exempt.txt')

/** Exact-list buckets. Gloss scan reads profanity and slur only. */
export type ExactCategory = 'profanity' | 'slur' | 'violence' | 'name' | 'other'

const EXACT_CATEGORIES = new Set<ExactCategory>(['profanity', 'slur', 'violence', 'name', 'other'])

export type ExactRecord = { key: string; category: ExactCategory }

/** Preserve German ß under uppercasing (JS toUpperCase maps ß→SS). */
export function nfcUpper(s: string): string {
  const PH = '\uE000'
  return s.replaceAll('ß', PH).normalize('NFC').toUpperCase().replaceAll(PH, 'ß')
}

let cached: Set<string> | null = null
let categoryCache: Map<string, ExactCategory> | null = null
let glossExemptCache: AllowEntry[] | null = null

export function loadDenylist(): Set<string> {
  if (cached) return cached
  cached = parseExactDenylist(readFileSync(FILE, 'utf8'))
  return cached
}

export function loadExactCategories(): Map<string, ExactCategory> {
  if (categoryCache) return categoryCache
  categoryCache = new Map(parseExactEntries(readFileSync(FILE, 'utf8')).map((e) => [e.key, e.category]))
  return categoryCache
}

/** Letters of a gloss or chip. Splits on hyphens, slashes, and other punctuation. */
export function letterTokens(text: string): string[] {
  return text.match(/[\p{L}\p{M}]+/gu) ?? []
}

/**
 * Parse exact-list text. A `# category: profanity|slur|violence|name|other`
 * line sets the bucket for the entries after it. Default is profanity.
 */
export function parseExactEntries(text: string): ExactRecord[] {
  const out: ExactRecord[] = []
  let category: ExactCategory = 'profanity'
  for (const [i, line] of text.split('\n').entries()) {
    const directive = /^#\s*category:\s*([A-Za-z]+)\s*$/.exec(line.trim())
    if (directive) {
      const cat = directive[1]!.toLowerCase()
      if (!EXACT_CATEGORIES.has(cat as ExactCategory)) {
        throw new Error(`lemma-denylist:${i + 1}: bad category ${JSON.stringify(directive[1])}`)
      }
      category = cat as ExactCategory
      continue
    }
    const w = line.split('#')[0]?.trim()
    if (!w) continue
    const parts = w.split(/\s+/)
    if (parts.length === 1) {
      out.push({ key: nfcUpper(parts[0]!), category })
      continue
    }
    if (parts.length === 2 && /^[a-z]{2}$/i.test(parts[0]!)) {
      out.push({ key: `${parts[0]!.toLowerCase()} ${nfcUpper(parts[1]!)}`, category })
      continue
    }
    throw new Error(`lemma-denylist:${i + 1}: expected "WORD" or "lang WORD", got ${JSON.stringify(w)}`)
  }
  return out
}

/** Parse exact-list text. Throws on a bad line. */
export function parseExactDenylist(text: string): Set<string> {
  return new Set(parseExactEntries(text).map((e) => e.key))
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
export function parseAllowlist(text: string, label = 'lemma-denylist-allow'): AllowEntry[] {
  const out: AllowEntry[] = []
  for (const [i, line] of text.split('\n').entries()) {
    const raw = line.trim()
    if (!raw || raw.startsWith('#')) continue
    const hash = raw.indexOf('#')
    if (hash < 0) {
      throw new Error(`${label}:${i + 1}: expected "lang WORD # reason", got ${JSON.stringify(raw)}`)
    }
    const reason = raw.slice(hash + 1).trim()
    const head = raw.slice(0, hash).trim()
    const parts = head.split(/\s+/)
    if (!reason || reason.includes('\n')) {
      throw new Error(`${label}:${i + 1}: missing reason`)
    }
    if (parts.length !== 2 || !/^[a-z]{2}$/i.test(parts[0]!)) {
      throw new Error(`${label}:${i + 1}: expected "lang WORD # reason", got ${JSON.stringify(head)}`)
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

export function loadGlossExempt(): AllowEntry[] {
  if (glossExemptCache) return glossExemptCache
  glossExemptCache = parseAllowlist(readFileSync(GLOSS_EXEMPT_FILE, 'utf8'), 'lemma-denylist-gloss-exempt')
  return glossExemptCache
}

export function resetDenylistCache(): void {
  cached = null
  categoryCache = null
  patternCache = null
  allowCache = null
  glossExemptCache = null
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
  allow: readonly AllowEntry[] = loadDenylistAllow(),
): boolean {
  const w = nfcUpper(word)
  if (denylist.has(w)) return true
  if (lang && denylist.has(`${lang.toLowerCase()} ${w}`)) return true
  if (!matchesDeniedPattern(w, lang)) return false
  if (isPatternAllowlisted(w, lang, allow)) return false
  return true
}

const GLOSS_CATEGORIES = new Set<ExactCategory>(['profanity', 'slur'])

function exactGlossKeys(word: string, lang: string | undefined): string[] {
  const w = nfcUpper(word)
  const L = lang?.toLowerCase()
  return L ? [`${L} ${w}`, w] : [w]
}

/** True when an exact entry in this language is profanity or a slur. */
export function exactGlossCategoryHit(
  word: string,
  lang: string | undefined,
  denylist: Set<string>,
  categories: ReadonlyMap<string, ExactCategory>,
): boolean {
  for (const key of exactGlossKeys(word, lang)) {
    if (!denylist.has(key)) continue
    if (GLOSS_CATEGORIES.has(categories.get(key) ?? 'profanity')) return true
  }
  return false
}

/**
 * Gloss token: own lemma is skipped. A pattern hit counts. An exact hit counts
 * only for profanity and slur, and only in the gloss language. Violence, names,
 * and other stay on the lemma list.
 */
export function isDeniedGlossToken(
  token: string,
  lang?: string,
  lemma?: string,
  denylist = loadDenylist(),
  categories: ReadonlyMap<string, ExactCategory> = loadExactCategories(),
  allow: readonly AllowEntry[] = loadDenylistAllow(),
  exempt: readonly AllowEntry[] = loadGlossExempt(),
): boolean {
  const w = nfcUpper(token)
  if (lemma && nfcUpper(lemma) === w) return false
  if (matchesDeniedPattern(w, lang) && !isPatternAllowlisted(w, lang, allow)) return true
  if (!exactGlossCategoryHit(w, lang, denylist, categories)) return false
  const L = lang?.toLowerCase()
  if (L && exempt.some((e) => e.lang === L && e.word === w)) return false
  return true
}

/** Exemption lines that do not name a profanity or slur exact in that language. */
export function staleGlossExempt(
  exempt: readonly AllowEntry[] = loadGlossExempt(),
  denylist = loadDenylist(),
  categories: ReadonlyMap<string, ExactCategory> = loadExactCategories(),
): AllowEntry[] {
  return exempt.filter((e) => !exactGlossCategoryHit(e.word, e.lang, denylist, categories))
}
