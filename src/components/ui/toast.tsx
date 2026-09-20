import { useEffect } from 'react'

export function Toast({
  message,
  onDone,
}: {
  message: string
  onDone: () => void
}) {
  useEffect(() => {
    const t = window.setTimeout(onDone, 2200)
    return () => window.clearTimeout(t)
  }, [onDone, message])

  return (
    <div
      role="status"
      className="fixed bottom-6 left-1/2 z-50 max-w-[min(90vw,22rem)] -translate-x-1/2 rounded-xl bg-ink px-4 py-3 text-center text-sm text-white shadow-lg"
    >
      {message}
    </div>
  )
}
