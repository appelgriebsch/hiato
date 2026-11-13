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

/** Capitalized stock-persona token, or null. The lemma's own spelling counts (#279). */
export function stockNameInText(text: string, names = loadStockNameList()): string | null {
  const re = /[\p{L}\p{M}]+/gu
  let m: RegExpExecArray | null
  while ((m = re.exec(text)) !== null) {
    const tok = m[0]!
    if (/^\p{Lu}/u.test(tok) && names.has(nfcUpper(tok))) return tok
  }
  return null
}
