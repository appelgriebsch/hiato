import { useEffect, useState } from 'react'

/**
 * Quiet network / pack-ready signal (ADR 0052 §5.8: Inter 12px 600 on
 * cream-dark with a 2px line outline, square corners).
 * - Offline (no network): muted "Offline" chip
 * - packReady while online: muted "Offline ready" (landing trust signal; #103)
 * - Otherwise: null (never loud Install CTA)
 */
export function OfflineChip({ packReady = false }: { packReady?: boolean } = {}) {
  const [online, setOnline] = useState(
    typeof navigator === 'undefined' ? true : navigator.onLine,
  )

  useEffect(() => {
    const on = () => setOnline(true)
    const off = () => setOnline(false)
    window.addEventListener('online', on)
    window.addEventListener('offline', off)
    return () => {
      window.removeEventListener('online', on)
      window.removeEventListener('offline', off)
    }
  }, [])

  if (!online) {
    // packReady chip is the landing trust signal — stay quiet while offline so
    // TopBar OfflineChip is the sole network chrome (#103 Avery W3).
    if (packReady) return null
    return (
      <span className="inline-flex items-center border-2 border-line bg-cream-dark px-2.5 py-1 text-xs font-semibold text-ink-muted">
        Offline
      </span>
    )
  }

  if (packReady) {
    return (
      <span
        className="inline-flex items-center border-2 border-line bg-cream-dark/80 px-2.5 py-1 text-xs font-semibold text-ink-muted"
        data-offline-ready
      >
        Offline ready
      </span>
    )
  }

  return null
}
