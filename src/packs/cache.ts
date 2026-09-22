import { loadPack, purgeLocalPacksExcept } from './load'
import {
  PACK_CEFRS,
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
  const m = path.match(/\/packs\/(en|de|es|pt)\//)
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

  const cache = await openPackCache()
  if (cache) {
    await Promise.all(
      [...loaded].map(async (cefr) => {
        const url = packUrl(lang, cefr)
        try {
          await cache.add(url)
        } catch {
          // offline — loadPack may still have filled localStorage
        }
      }),
    )
    await purgeOtherLanguagePacks(lang)
  }

  purgeLocalPacksExcept(lang)
  return true
}
