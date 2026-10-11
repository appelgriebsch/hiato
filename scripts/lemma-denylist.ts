/**
 * Shared NSFW / violence / slur denylist loader (exact uppercase NFC match).
 * A line is global (`WORD`) or language-scoped (`fr WORD`), same shape as the
 * loanword allowlist. Scoped lines do not block another language's homograph.
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const FILE = path.join(path.dirname(fileURLToPath(import.meta.url)), 'data', 'lemma-denylist.txt')

/** Preserve German ß under uppercasing (JS toUpperCase maps ß→SS). */
export function nfcUpper(s: string): string {
  const PH = '\uE000'
  return s.replaceAll('ß', PH).normalize('NFC').toUpperCase().replaceAll(PH, 'ß')
}

let cached: Set<string> | null = null

export function loadDenylist(): Set<string> {
  if (cached) return cached
  const text = readFileSync(FILE, 'utf8')
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
  cached = set
  return set
}

/** Global entry, or `lang WORD` when `lang` is set. */
export function isDeniedLemma(
  word: string,
  denylist = loadDenylist(),
  lang?: string,
): boolean {
  const w = nfcUpper(word)
  if (denylist.has(w)) return true
  if (lang && denylist.has(`${lang.toLowerCase()} ${w}`)) return true
  return false
}
