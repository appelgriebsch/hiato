import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
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
 * Shown only when a pack is cache-ready — not a sales wall (#103).
 * Native dialog showModal: focus trap, restore focus, inert backdrop (PocketSheet).
 */
export function InstallHelpLink({
  visible,
}: {
  /** True after selected pack cache succeeds. */
  visible: boolean
}) {
  const [open, setOpen] = useState(false)
  const [standalone, setStandalone] = useState(isStandaloneDisplay)
  const deferred = useRef<BeforeInstallPromptEvent | null>(null)
  const dialogRef = useRef<HTMLDialogElement>(null)
  const openerRef = useRef<HTMLElement | null>(null)
  const restoreFocusRef = useRef(false)
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

  useLayoutEffect(() => {
    const dialog = dialogRef.current
    if (!open) {
      if (dialog?.open) dialog.close()
      return
    }
    if (!dialog) return
    const active = document.activeElement
    openerRef.current = active instanceof HTMLElement ? active : null
    restoreFocusRef.current = true
    if (!dialog.open) dialog.showModal()
    closeBtnRef.current?.focus()
  }, [open])

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    if (open) {
      return () => {
        if (dialog.open) dialog.close()
      }
    }
    if (dialog.open) dialog.close()
    if (!restoreFocusRef.current) return
    restoreFocusRef.current = false
    const opener = openerRef.current
    if (opener && opener.isConnected) opener.focus()
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

  function closeSheet() {
    setOpen(false)
  }

  return (
    <>
      <button
        type="button"
        data-install-link
        className="motion-press inline-flex min-h-11 items-center text-xs text-ink-muted underline-offset-2 hover:underline focus-visible:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-fg/40 rounded-sm py-1"
        onClick={() => void onInstallClick()}
      >
        Add to Home Screen
      </button>

      {createPortal(
        <dialog
          ref={dialogRef}
          className="install-help-sheet"
          role="dialog"
          aria-modal="true"
          aria-labelledby="install-help-title"
          data-install-sheet
          onCancel={(event) => {
            event.preventDefault()
            closeSheet()
          }}
          onClick={(event) => {
            if (event.target === event.currentTarget) closeSheet()
          }}
        >
          <div className="install-help-sheet-panel">
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
              onClick={closeSheet}
            >
              Close
            </Button>
          </div>
        </dialog>,
        document.body,
      )}
    </>
  )
}
