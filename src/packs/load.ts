import type { PackCefr, PackLang, WordPack } from './schema'
import { isPackCefr, isPackLang } from './schema'

const memory = new Map<string, WordPack>()

function cacheKey(lang: PackLang, cefr: PackCefr): string {
  return `hiato:pack:${lang}:${cefr}`
}

function packUrl(lang: PackLang, cefr: PackCefr): string {
  return `/packs/${lang}/${cefr}.json`
}

function readLocal(lang: PackLang, cefr: PackCefr): WordPack | null {
  try {
    const raw = localStorage.getItem(cacheKey(lang, cefr))
    if (!raw) return null
    return JSON.parse(raw) as WordPack
  } catch {
    return null
  }
}

function writeLocal(pack: WordPack): void {
  try {
    localStorage.setItem(cacheKey(pack.lang, pack.cefr), JSON.stringify(pack))
  } catch {
    // quota / private mode — memory cache still works
  }
}

function assertPack(raw: unknown): WordPack {
  if (!raw || typeof raw !== 'object') throw new Error('invalid pack')
  const o = raw as WordPack
  if (!isPackLang(o.lang) || !isPackCefr(o.cefr)) throw new Error('bad lang/cefr')
  if (!Array.isArray(o.lemmas) || o.lemmas.length === 0) {
    throw new Error('empty lemmas')
  }
  return o
}

/** Fetch pack JSON, cache in memory + localStorage (ADR 0006). */
export async function loadPack(
  lang: PackLang,
  cefr: PackCefr,
): Promise<WordPack> {
  const key = `${lang}/${cefr}`
  const mem = memory.get(key)
  if (mem) return mem

  const cached = readLocal(lang, cefr)
  if (cached) {
    memory.set(key, cached)
    // Refresh in background when online
    void refreshPack(lang, cefr).catch(() => {})
    return cached
  }

  const res = await fetch(packUrl(lang, cefr))
  if (!res.ok) throw new Error(`pack fetch ${res.status}`)
  const pack = assertPack(await res.json())
  memory.set(key, pack)
  writeLocal(pack)
  return pack
}

async function refreshPack(lang: PackLang, cefr: PackCefr): Promise<void> {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return
  const res = await fetch(packUrl(lang, cefr))
  if (!res.ok) return
  const pack = assertPack(await res.json())
  memory.set(`${lang}/${cefr}`, pack)
  writeLocal(pack)
}

/** T2 hardcoded daily target. */
export const T2_LANG: PackLang = 'en'
export const T2_CEFR: PackCefr = 'a1'
