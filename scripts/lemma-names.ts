/**
 * Person given-name / surname list loader (exact uppercase NFC match).
 *
 * #366: a listed name is rejected whatever its gloss says, in every pack
 * language. Common-word homographs (WILL, MERVEILLE, the slots 0–399 base)
 * stay only with a reasoned line in lemma-names-allow.txt — a gloss cannot
 * opt a name back in.
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { nfcUpper } from './lemma-denylist'

const FILE = path.join(import.meta.dir, 'data', 'lemma-names.txt')
const ALLOW_FILE = path.join(import.meta.dir, 'data', 'lemma-names-allow.txt')

let cached: Set<string> | null = null
let allowCache: Set<string> | null = null

export type NameAllowEntry = { lang: string; word: string; reason: string }

export function loadNameList(): Set<string> {
  if (cached) return cached
  const text = readFileSync(FILE, 'utf8')
  const set = new Set<string>()
  for (const line of text.split('\n')) {
    const w = line.split('#')[0]?.trim()
    if (!w) continue
    set.add(nfcUpper(w))
  }
  cached = set
  return set
}

export function onNameList(word: string, names = loadNameList()): boolean {
  return names.has(nfcUpper(word))
}

/** `lang WORD # reason`. An entry whose word is not on the name list is stale. */
export function parseNameAllowlist(text: string): NameAllowEntry[] {
  const out: NameAllowEntry[] = []
  for (const [i, line] of text.split('\n').entries()) {
    const raw = line.trim()
    if (!raw || raw.startsWith('#')) continue
    const hash = raw.indexOf('#')
    const body = (hash >= 0 ? raw.slice(0, hash) : raw).trim()
    const reason = hash >= 0 ? raw.slice(hash + 1).trim() : ''
    const parts = body.split(/\s+/)
    if (parts.length !== 2 || !/^[a-z]{2}$/.test(parts[0]!) || !reason) {
      throw new Error(
        `lemma-names-allow:${i + 1}: expected "lang WORD # reason", got ${JSON.stringify(raw)}`,
      )
    }
    out.push({ lang: parts[0]!.toLowerCase(), word: nfcUpper(parts[1]!), reason })
  }
  return out
}

export function loadNameAllowlist(): Set<string> {
  if (allowCache) return allowCache
  const set = new Set<string>()
  for (const e of parseNameAllowlist(readFileSync(ALLOW_FILE, 'utf8'))) {
    set.add(`${e.lang} ${e.word}`)
  }
  allowCache = set
  return set
}

/** True when a name-list homograph may still ship in this language. */
export function nameAllowed(lang: string, word: string, allow = loadNameAllowlist()): boolean {
  return allow.has(`${lang.toLowerCase()} ${nfcUpper(word)}`)
}

/**
 * #366: a listed name is out in every language, whatever the gloss says.
 * Allowlisted common-word homographs stay. Generation (`okLemma`, gloss
 * rejection, the FR/IT accept predicate) and `packs:check` share this.
 */
export function listedNameRejected(
  lang: string,
  word: string,
  names = loadNameList(),
  allow = loadNameAllowlist(),
): boolean {
  return onNameList(word, names) && !nameAllowed(lang, word, allow)
}

export function resetNameAllowCache(): void {
  allowCache = null
}
