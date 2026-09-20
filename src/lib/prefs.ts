import { isPackCefr, isPackLang, type PackCefr, type PackLang } from '../packs/schema'

const PREFS_KEY = 'hiato.prefs'

export interface Prefs {
  lang: PackLang
  cefr: PackCefr
}

function readRaw(): unknown {
  try {
    const raw = localStorage.getItem(PREFS_KEY)
    if (!raw) return null
    return JSON.parse(raw)
  } catch {
    return null
  }
}

export function getPrefs(): Prefs | null {
  const o = readRaw()
  if (!o || typeof o !== 'object') return null
  const rec = o as Record<string, unknown>
  if (!isPackLang(rec.lang) || !isPackCefr(rec.cefr)) return null
  return { lang: rec.lang, cefr: rec.cefr }
}

export function setPrefs(prefs: Prefs): void {
  localStorage.setItem(PREFS_KEY, JSON.stringify(prefs))
}
