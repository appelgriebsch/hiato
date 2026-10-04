import { useEffect, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { useRegisterSW } from 'virtual:pwa-register/react'
import { Button } from '@/components/ui/button'

export function PwaPrompt() {
  const { pathname } = useLocation()
  const onPlay = pathname === '/play' || pathname.startsWith('/play/')
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
    // Play (in progress or finish actions) must not take focus for Update.
    if (onPlay || !needRefresh || dismissed) return
    updateBtnRef.current?.focus()
  }, [onPlay, needRefresh, dismissed])

  // Home and other non-play routes still show the prompt. Later stays
  // session-scoped because this component stays mounted across routes.
  if (onPlay || !needRefresh || dismissed) return null

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed inset-x-0 bottom-0 z-50 mx-auto max-w-md p-4 pb-[max(1rem,env(safe-area-inset-bottom))]"
    >
      <div className="rounded-2xl border border-line bg-raised p-4 shadow-lg">
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
