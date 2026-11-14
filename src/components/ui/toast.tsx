import { useEffect } from 'react'
import { cn } from '@/lib/utils'

/**
 * Toast (ADR 0052 §5.8): raised box, 2px edge outline, 4px drop, Inter 14px.
 * The error variant uses danger text and a danger outline.
 */
export function Toast({
  message,
  onDone,
  tone = 'neutral',
}: {
  message: string
  onDone: () => void
  tone?: 'neutral' | 'error'
}) {
  useEffect(() => {
    const t = window.setTimeout(onDone, 2200)
    return () => window.clearTimeout(t)
  }, [onDone, message])

  return (
    <div
      role="status"
      className={cn(
        'fixed bottom-6 left-1/2 z-50 max-w-[min(90vw,22rem)] -translate-x-1/2 px-4 py-3 text-center text-sm',
        'bg-raised px-frame px-drop-only',
        tone === 'error'
          ? 'text-danger [--px-edge:var(--color-danger)]'
          : 'text-ink',
      )}
    >
      {message}
    </div>
  )
}
