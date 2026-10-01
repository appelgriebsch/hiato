import { useEffect, useState } from 'react'

/**
 * Quiet network / pack-ready signal.
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
    return (
      <span className="rounded-full bg-cream-dark px-2.5 py-1 text-xs font-medium text-ink-muted">
        Offline
      </span>
    )
  }

  if (packReady) {
    return (
      <span
        className="rounded-full bg-cream-dark/80 px-2.5 py-1 text-xs font-medium text-ink-muted"
        data-offline-ready
      >
        Offline ready
      </span>
    )
  }

  return null
}
