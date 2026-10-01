import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

function isStandaloneDisplay(): boolean {
  if (typeof window === 'undefined') return true
  const mq = window.matchMedia?.('(display-mode: standalone)')
  if (mq?.matches) return true
  // iOS Safari
  const nav = window.navigator as Navigator & { standalone?: boolean }
  return nav.standalone === true
}

/**
 * Quiet muted "Add to Home Screen" + optional dismissible A2HS help sheet.
 * Shown only when a pack is cached (or caching) — not a sales wall (#103).
 */
export function InstallHelpLink({
  visible,
}: {
  /** True while/after selected pack cache succeeds. */
  visible: boolean
}) {
  const [open, setOpen] = useState(false)
  const [standalone, setStandalone] = useState(isStandaloneDisplay)
  const deferred = useRef<BeforeInstallPromptEvent | null>(null)
  const closeBtnRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    setStandalone(isStandaloneDisplay())
    const onBip = (e: Event) => {
      e.preventDefault()
      deferred.current = e as BeforeInstallPromptEvent
    }
    window.addEventListener('beforeinstallprompt', onBip)
    return () => window.removeEventListener('beforeinstallprompt', onBip)
  }, [])

  useEffect(() => {
    if (!open) return
    closeBtnRef.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        setOpen(false)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  if (!visible || standalone) return null

  async function onInstallClick() {
    const evt = deferred.current
    if (evt) {
      try {
        await evt.prompt()
        await evt.userChoice
        deferred.current = null
        setStandalone(isStandaloneDisplay())
        return
      } catch {
        /* fall through to help sheet */
      }
    }
    setOpen(true)
  }

  return (
    <>
      <button
        type="button"
        data-install-link
        className="motion-press text-xs text-ink-muted underline-offset-2 hover:underline focus-visible:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-fg/40 rounded-sm py-1"
        onClick={() => void onInstallClick()}
      >
        Add to Home Screen
      </button>

      {open ? (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-ink/30 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:items-center"
          role="presentation"
          onClick={(e) => {
            if (e.target === e.currentTarget) setOpen(false)
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="install-help-title"
            className="w-full max-w-md rounded-2xl border border-line bg-raised p-5 shadow-lg"
            data-install-sheet
          >
            <h2
              id="install-help-title"
              className="text-base font-semibold text-ink"
            >
              Optional: install Hiato
            </h2>
            <p className="mt-2 text-sm text-ink-muted">
              Add Hiato to your home screen for one-tap offline play. No store
              and no account.
            </p>
            <div className="mt-4 space-y-3 text-sm text-ink">
              <div>
                <p className="font-medium text-accent-fg">iOS (Safari)</p>
                <ol className="mt-1 list-decimal space-y-0.5 pl-5 text-ink-muted">
                  <li>Tap the Share button</li>
                  <li>Scroll and tap “Add to Home Screen”</li>
                  <li>Confirm “Add” — Hiato opens like an app</li>
                </ol>
              </div>
              <div>
                <p className="font-medium text-accent-fg">Android (Chrome)</p>
                <ol className="mt-1 list-decimal space-y-0.5 pl-5 text-ink-muted">
                  <li>Tap the ⋮ menu</li>
                  <li>Tap “Install app” or “Add to Home screen”</li>
                  <li>Confirm — packs stay cached offline</li>
                </ol>
              </div>
            </div>
            <Button
              ref={closeBtnRef}
              fullWidth
              variant="ghost"
              className="mt-4"
              onClick={() => setOpen(false)}
            >
              Close
            </Button>
          </div>
        </div>
      ) : null}
    </>
  )
}
