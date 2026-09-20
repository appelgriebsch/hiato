/** Shared NSFW / violence / slur denylist loader (exact uppercase NFC match). */
import { readFileSync } from 'node:fs'
import path from 'node:path'

const FILE = path.join(import.meta.dir, 'data', 'lemma-denylist.txt')

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
    set.add(nfcUpper(w))
  }
  cached = set
  return set
}

export function isDeniedLemma(word: string, denylist = loadDenylist()): boolean {
  return denylist.has(nfcUpper(word))
}
