/** Tatoeba stock persona-name list loader (exact uppercase NFC match). */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { nfcUpper } from './lemma-denylist'

const FILE = path.join(import.meta.dir, 'data', 'tatoeba-stock-names.txt')

let cached: Set<string> | null = null

function loadStockNameList(): Set<string> {
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

export function isStockName(word: string, names = loadStockNameList()): boolean {
  return names.has(nfcUpper(word))
}

/**
 * Capitalized stock-persona token, or null.
 * German nouns are capitalised, so a `de` lemma's own spelling is allowed (#279).
 */
export function stockNameInText(
  text: string,
  lemma: string,
  lang: string,
  names = loadStockNameList(),
): string | null {
  const lemmaKey = nfcUpper(lemma)
  const re = /[\p{L}\p{M}]+/gu
  let m: RegExpExecArray | null
  while ((m = re.exec(text)) !== null) {
    const tok = m[0]!
    const key = nfcUpper(tok)
    if (!/^\p{Lu}/u.test(tok) || !names.has(key)) continue
    if (lang === 'de' && key === lemmaKey) continue
    return tok
  }
  return null
}
