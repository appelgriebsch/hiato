import { useCallback, useSyncExternalStore } from 'react'
import { t, type TParams, type UiKey, type UILocale } from './index'
import { getUiLocale, getUiLocaleSetting, subscribeUiLocale } from '@/lib/ui-locale'

export type TFn = (key: UiKey, params?: TParams) => string

/** Resolved UI locale (stored override, else device locale, else en). */
export function useUiLocale(): UILocale {
  return useSyncExternalStore(subscribeUiLocale, getUiLocale, getUiLocale)
}

/** Stored setting: an explicit locale, or 'system' (ADR 0063). */
export function useUiLocaleSetting(): UILocale | 'system' {
  return useSyncExternalStore(subscribeUiLocale, getUiLocaleSetting, getUiLocaleSetting)
}

/** Bound translator: t() pinned to the current UI locale. */
export function useT(): TFn {
  const locale = useUiLocale()
  return useCallback((key: UiKey, params?: TParams) => t(locale, key, params), [locale])
}
