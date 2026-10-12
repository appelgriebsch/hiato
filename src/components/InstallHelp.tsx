import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Button } from '@/components/ui/button'

export type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

/** Set once the user taps the link; hides it for good on this device (#201). */
export const INSTALL_HELP_OPENED_KEY = 'hiato.installHelpOpened'

function readOpened(): boolean {
  try {
    return localStorage.getItem(INSTALL_HELP_OPENED_KEY) === '1'
  } catch {
    return false
  }
}

/** Link shows only when the pack is Ready offline, not installed, how-to not yet opened (#201). */
export function installLinkVisible(ready: boolean, standalone: boolean, opened: boolean): boolean {
  return ready && !standalone && !opened
}

/** Tap: persist the opened flag, then native prompt if the browser offered one, else the how-to. */
export async function openInstallHelp(
  evt: BeforeInstallPromptEvent | null,
  showSheet: () => void,
): Promise<'prompt' | 'sheet'> {
  try {
    localStorage.setItem(INSTALL_HELP_OPENED_KEY, '1')
  } catch {
    /* private mode: link just reappears next visit */
  }
  if (evt) {
    try {
      await evt.prompt()
      await evt.userChoice
      return 'prompt'
    } catch {
      /* fall through to help sheet */
    }
  }
  showSheet()
  return 'sheet'
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
 * One quiet "Add Hiato to your Home Screen" link under Continue (#201) + optional dismissible A2HS help sheet.
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
  // ponytail: read once at mount, so the link stays put this session (focus can
  // return to it when the sheet closes) and is gone from the next load on (#201).
  const [opened] = useState(readOpened)
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
    if (open) {
      return () => {
        if (dialog?.open) dialog.close()
      }
    }
    if (dialog?.open) dialog.close()
    if (!restoreFocusRef.current) return
    restoreFocusRef.current = false
    const opener = openerRef.current
    if (opener && opener.isConnected) opener.focus()
  }, [open])

  if (!installLinkVisible(visible, standalone, opened)) return null

  async function onInstallClick() {
    const how = await openInstallHelp(deferred.current, () => setOpen(true))
    if (how === 'prompt') {
      deferred.current = null
      setStandalone(isStandaloneDisplay())
    }
  }

  function closeSheet() {
    setOpen(false)
  }

  return (
    <>
      <button
        type="button"
        data-install-link
        className="motion-press mx-auto mt-1 flex min-h-11 items-center px-2 text-sm text-ink-muted underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-fg/40 rounded-sm"
        onClick={() => void onInstallClick()}
      >
        Add Hiato to your Home Screen
        </button>

      {/* Sheet mounts only while open: keeps SSR/static render portal-free. */}
      {open && createPortal(
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
