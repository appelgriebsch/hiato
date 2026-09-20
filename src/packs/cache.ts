import { loadPack, purgeLocalPacksExcept } from './load'
import {
  PACK_CEFRS,
  PACK_SW_CACHE,
  isPackLang,
  packUrl,
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
 * Precache A1/A2/B1 for the selected language, then drop other langs
 * from SW cache + localStorage (ADR 0006).
 */
export async function precacheSelectedLanguage(
  lang: PackLang,
): Promise<void> {
  await Promise.all(
    PACK_CEFRS.map((cefr) => loadPack(lang, cefr).catch(() => null)),
  )

  const cache = await openPackCache()
  if (cache) {
    await Promise.all(
      PACK_CEFRS.map(async (cefr) => {
        const url = packUrl(lang, cefr)
        try {
          await cache.add(url)
        } catch {
          // offline or missing — loadPack may still have filled localStorage
        }
      }),
    )
    await purgeOtherLanguagePacks(lang)
  }

  purgeLocalPacksExcept(lang)
}
