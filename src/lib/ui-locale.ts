/**
 * UI locale state (ADR 0063 / #302). `hiato.ui-locale` is
 * { "v": 1, "locale": UILocale | null } — a separate versioned key, never
 * `hiato.prefs` (pack language + CEFR live there and are untouched here).
 * `null` means "System": resolve from navigator.languages (prefix-matched to
 * the six supported codes, pt-BR -> pt), falling back to 'en'. getUiLocale()
 * recomputes on each call so another tab's write is heard on the next read;
 * setUiLocale notifies this tab's subscribers and the storage event syncs
 * other tabs.
 */
import { UI_LOCALES, type UILocale } from '@/i18n'

export const UI_LOCALE_STORAGE_KEY = 'hiato.ui-locale'

function isUiLocale(value: unknown): value is UILocale {
  return typeof value === 'string' && (UI_LOCALES as readonly string[]).includes(value)
}

function readStored(): UILocale | null {
  try {
    if (typeof localStorage === 'undefined') return null
    const raw = localStorage.getItem(UI_LOCALE_STORAGE_KEY)
    if (!raw) return null
    const parsed: unknown = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return null
    const row = parsed as { v?: unknown; locale?: unknown }
    if (row.v !== 1) return null
    if (row.locale === null) return null
    return isUiLocale(row.locale) ? row.locale : null
  } catch {
    return null
  }
}

/** First navigator.languages entry whose language prefix is supported. */
export function deviceUiLocale(): UILocale {
  try {
    if (typeof navigator === 'undefined') return 'en'
    const list = navigator.languages?.length
      ? navigator.languages
      : navigator.language
        ? [navigator.language]
        : []
    for (const tag of list) {
      const prefix = String(tag).split('-')[0]?.toLowerCase()
      if (prefix && isUiLocale(prefix)) return prefix
    }
  } catch {
    /* no navigator */
  }
  return 'en'
}

/** Resolved UI locale: stored override, else device locale, else 'en'. */
export function getUiLocale(): UILocale {
  return readStored() ?? deviceUiLocale()
}

/** The stored setting: an explicit locale, or 'system'. */
export function getUiLocaleSetting(): UILocale | 'system' {
  return readStored() ?? 'system'
}

const listeners = new Set<() => void>()

function notify(): void {
  for (const fn of [...listeners]) fn()
}

let storageHooked = false
function hookStorage(): void {
  if (storageHooked || typeof window === 'undefined') return
  storageHooked = true
  window.addEventListener('storage', (event) => {
    if (event.key && event.key !== UI_LOCALE_STORAGE_KEY) return
    notify()
  })
}

/** 'system' stores null and returns to device-locale resolution. */
export function setUiLocale(locale: UILocale | 'system'): void {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(
        UI_LOCALE_STORAGE_KEY,
        JSON.stringify({ v: 1, locale: locale === 'system' ? null : locale }),
      )
    }
  } catch {
    /* private mode: this tab keeps the in-memory resolution */
  }
  notify()
}

/** Re-render on same-tab setUiLocale and on other tabs' storage writes. */
export function subscribeUiLocale(listener: () => void): () => void {
  listeners.add(listener)
  hookStorage()
  return () => {
    listeners.delete(listener)
  }
}
