/** Person given-name / surname list loader (exact uppercase NFC match). */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { nfcUpper } from './lemma-denylist'

const FILE = path.join(import.meta.dir, 'data', 'lemma-names.txt')

let cached: Set<string> | null = null

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
