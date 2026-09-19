import { useEffect, useState } from 'react'

export function OfflineChip() {
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

  if (online) return null

  return (
    <span className="rounded-full bg-cream-dark px-2.5 py-1 text-xs font-medium text-ink-muted">
      Offline
    </span>
  )
}
