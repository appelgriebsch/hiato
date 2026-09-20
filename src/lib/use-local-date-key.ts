import { useEffect, useState } from 'react'
import { localDateKey } from '@/engine'

const POLL_MS = 30_000

/** Local YYYY-MM-DD; refreshes on focus, visibility, and a short poll (ADR 0004). */
export function useLocalDateKey(): string {
  const [key, setKey] = useState(() => localDateKey())

  useEffect(() => {
    const tick = () => {
      const next = localDateKey()
      setKey((prev) => (prev === next ? prev : next))
    }
    const id = window.setInterval(tick, POLL_MS)
    const onVis = () => {
      if (document.visibilityState === 'visible') tick()
    }
    document.addEventListener('visibilitychange', onVis)
    window.addEventListener('focus', tick)
    tick()
    return () => {
      window.clearInterval(id)
      document.removeEventListener('visibilitychange', onVis)
      window.removeEventListener('focus', tick)
    }
  }, [])

  return key
}
