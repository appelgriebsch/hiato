import { loadPack, purgeLocalPacksExcept } from './load'
import {
  PACK_CEFRS,
  PACK_LANGS,
  PACK_SW_CACHE,
  isPackLang,
  packUrl,
  type PackCefr,
  type PackLang,
} from './schema'

export { PACK_SW_CACHE }

/** Parse `/packs/{lang}/{cefr}.json` out of an absolute or relative URL. */
export function packLangFromUrl(url: string): PackLang | null {
  let path = url
  try {
    path = new URL(url, 'https://hiato.local').pathname
  } catch {
    /* use raw */
  }
  const m = path.match(new RegExp(`/packs/(${PACK_LANGS.join('|')})/`))
  if (!m) return null
  return isPackLang(m[1]) ? m[1] : null
}

/** True when this cached pack request belongs to a language other than `selected`. */
export function shouldPurgePackUrl(url: string, selected: PackLang): boolean {
  const lang = packLangFromUrl(url)
  return lang !== null && lang !== selected
}

/** Purge other langs only if the selected CEFR (or any pack, if omitted) loaded. */
export function canPurgeOtherLanguages(
  loaded: ReadonlySet<PackCefr>,
  selectedCefr?: PackCefr,
): boolean {
  if (selectedCefr) return loaded.has(selectedCefr)
  return loaded.size > 0
}

async function openPackCache(): Promise<Cache | null> {
  if (typeof caches === 'undefined') return null
  try {
    return await caches.open(PACK_SW_CACHE)
  } catch {
    return null
  }
}

/** Delete SW-cached packs for every language except `selected` (ADR 0006). */
export async function purgeOtherLanguagePacks(
  selected: PackLang,
): Promise<void> {
  const cache = await openPackCache()
  if (!cache) return
  let keys: readonly Request[]
  try {
    keys = await cache.keys()
  } catch {
    return
  }
  await Promise.all(
    keys.map(async (req) => {
      if (shouldPurgePackUrl(req.url, selected)) {
        try {
          await cache.delete(req)
        } catch {
          /* ignore */
        }
      }
    }),
  )
}

/** Language whose six packs are already in SW cache this session (#190). */
// ponytail: per-session module flag, reset on reload; the SW cache is not re-checked, so an evicted pack is only re-added after a reload or language switch.
let precachedLang: PackLang | null = null

/** Test seam: forget the precached language. */
export function resetPrecachedLang(): void {
  precachedLang = null
}

/**
 * Precache shipped CEFR packs for the selected language, then drop other langs
 * from SW cache + localStorage (ADR 0006). Returns false if the selected CEFR
 * (or any pack, when `selectedCefr` is omitted) did not load — caller must not
 * navigate as if Play is ready.
 */
export async function precacheSelectedLanguage(
  lang: PackLang,
  selectedCefr?: PackCefr,
): Promise<boolean> {
  const loaded = new Set<PackCefr>()
  await Promise.all(
    PACK_CEFRS.map(async (cefr) => {
      try {
        await loadPack(lang, cefr)
        loaded.add(cefr)
      } catch {
        /* missing or network */
      }
    }),
  )

  if (!canPurgeOtherLanguages(loaded, selectedCefr)) {
    return false
  }

  // Same language, all packs in memory: a CEFR change needs no network (#190).
  if (precachedLang === lang && loaded.size === PACK_CEFRS.length) return true

  let allAdded = loaded.size === PACK_CEFRS.length
  const cache = await openPackCache()
  if (cache) {
    await Promise.all(
      [...loaded].map(async (cefr) => {
        const url = packUrl(lang, cefr)
        try {
          await cache.add(url)
        } catch {
          // offline — loadPack may still have filled localStorage; retry next call
          allAdded = false
        }
      }),
    )
    await purgeOtherLanguagePacks(lang)
  }

  purgeLocalPacksExcept(lang)
  precachedLang = allAdded ? lang : null
  return true
}
