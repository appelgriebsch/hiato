import type { PackCefr, PackLang, WordPack } from './schema'
import {
  PACK_CEFR_LEVELS,
  PACK_LANGS,
  isPackCefr,
  isPackLang,
  packUrl,
} from './schema'

const memory = new Map<string, WordPack>()

export function localPackCacheKey(lang: PackLang, cefr: PackCefr): string {
  return `hiato:pack:${lang}:${cefr}`
}

function readLocal(lang: PackLang, cefr: PackCefr): WordPack | null {
  try {
    const raw = localStorage.getItem(localPackCacheKey(lang, cefr))
    if (!raw) return null
    const pack = assertPack(JSON.parse(raw))
    return pack
  } catch {
    // corrupt or unversioned cache — discard
    try {
      localStorage.removeItem(localPackCacheKey(lang, cefr))
    } catch {
      /* ignore */
    }
    return null
  }
}

function writeLocal(pack: WordPack): void {
  try {
    localStorage.setItem(
      localPackCacheKey(pack.lang, pack.cefr),
      JSON.stringify(pack),
    )
  } catch {
    // quota / private mode — memory cache still works
  }
}

function assertPack(raw: unknown): WordPack {
  if (!raw || typeof raw !== 'object') throw new Error('invalid pack')
  const o = raw as WordPack
  if (typeof o.version !== 'number' || !Number.isFinite(o.version)) {
    throw new Error('pack missing version')
  }
  if (!isPackLang(o.lang) || !isPackCefr(o.cefr)) throw new Error('bad lang/cefr')
  if (!Array.isArray(o.lemmas) || o.lemmas.length === 0) {
    throw new Error('empty lemmas')
  }
  return o
}

async function fetchPack(lang: PackLang, cefr: PackCefr): Promise<WordPack> {
  const res = await fetch(packUrl(lang, cefr))
  if (!res.ok) throw new Error(`pack fetch ${res.status}`)
  return assertPack(await res.json())
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

  // Prefer network when online so a version mismatch discards stale cache (W4).
  const online =
    typeof navigator === 'undefined' || navigator.onLine !== false
  if (online) {
    try {
      const pack = await fetchPack(lang, cefr)
      if (!cached || cached.version !== pack.version) {
        memory.set(key, pack)
        writeLocal(pack)
        return pack
      }
      // same version — keep / refresh cache
      memory.set(key, pack)
      writeLocal(pack)
      return pack
    } catch {
      // fall through to cache / hard fail
    }
  }

  if (cached) {
    memory.set(key, cached)
    // background refresh may still replace if a newer version appears later
    void refreshPack(lang, cefr).catch(() => {})
    return cached
  }

  const pack = await fetchPack(lang, cefr)
  memory.set(key, pack)
  writeLocal(pack)
  return pack
}

async function refreshPack(lang: PackLang, cefr: PackCefr): Promise<void> {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return
  const pack = await fetchPack(lang, cefr)
  const key = `${lang}/${cefr}`
  const prev = memory.get(key)
  if (prev && prev.version === pack.version) {
    // still refresh localStorage copy
    writeLocal(pack)
    return
  }
  memory.set(key, pack)
  writeLocal(pack)
}

/** Drop memory + localStorage copies of packs that are not the selected language. */
export function purgeLocalPacksExcept(lang: PackLang): void {
  for (const other of PACK_LANGS) {
    if (other === lang) continue
    for (const cefr of PACK_CEFR_LEVELS) {
      memory.delete(`${other}/${cefr}`)
      try {
        localStorage.removeItem(localPackCacheKey(other, cefr))
      } catch {
        /* ignore */
      }
    }
  }
}

/** True when a validated pack JSON is already in localStorage (offline-ready signal). */
export function isPackCachedLocally(lang: PackLang, cefr: PackCefr): boolean {
  try {
    const raw = localStorage.getItem(localPackCacheKey(lang, cefr))
    if (!raw) return false
    assertPack(JSON.parse(raw))
    return true
  } catch {
    // Corrupt / unversioned JSON — discard poison key (mirror readLocal).
    try {
      localStorage.removeItem(localPackCacheKey(lang, cefr))
    } catch {
      /* ignore */
    }
    return false
  }
}
