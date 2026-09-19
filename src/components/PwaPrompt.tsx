import { useEffect, useRef, useState } from 'react'
import { useRegisterSW } from 'virtual:pwa-register/react'
import { Button } from '@/components/ui/button'

export function PwaPrompt() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW()

  const [dismissed, setDismissed] = useState(false)
  const updateBtnRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (needRefresh) setDismissed(false)
  }, [needRefresh])

  useEffect(() => {
    if (needRefresh && !dismissed) {
      updateBtnRef.current?.focus()
    }
  }, [needRefresh, dismissed])

  if (!needRefresh || dismissed) return null

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed inset-x-0 bottom-0 z-50 mx-auto max-w-md p-4 pb-[max(1rem,env(safe-area-inset-bottom))]"
    >
      <div className="rounded-2xl border border-line bg-white p-4 shadow-lg">
        <p className="mb-3 text-sm text-ink">A new version is ready.</p>
        <div className="flex gap-2">
          <Button
            ref={updateBtnRef}
            variant="primary"
            fullWidth
            onClick={() => void updateServiceWorker(true)}
          >
            Update
          </Button>
          <Button
            variant="ghost"
            onClick={() => {
              setDismissed(true)
              setNeedRefresh(false)
            }}
          >
            Later
          </Button>
        </div>
      </div>
    </div>
  )
}
