import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Button } from '@/components/ui/button'
import { listPocketStored, removeFromPocket } from '@/lib/pocket'
import type { PocketEntry } from '@/lib/pocket'
import { pocketListLabel, pocketRetryHref } from '@/lib/pocket-save'
import type { PackCefr, PackLang } from '@/packs/schema'

type PocketSheetProps = {
  lang: PackLang
  cefr: PackCefr
  open: boolean
  onClose: () => void
  onCount: (n: number) => void
  onRetry: (id: string) => void
}

export function PocketSheet({
  lang,
  cefr,
  open,
  onClose,
  onCount,
  onRetry,
}: PocketSheetProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const openerRef = useRef<HTMLElement | null>(null)
  const restoreFocusRef = useRef(false)
  const slotKey = `${lang}\0${cefr}`
  const [loadedFor, setLoadedFor] = useState<string | null>(null)
  const [entries, setEntries] = useState<PocketEntry[]>([])
  const [cleared, setCleared] = useState(false)

  if (open && loadedFor !== slotKey) {
    setLoadedFor(slotKey)
    setEntries(listPocketStored(lang, cefr))
    setCleared(false)
  } else if (!open && loadedFor !== null) {
    setLoadedFor(null)
  }

  useLayoutEffect(() => {
    if (!open) return
    const dialog = dialogRef.current
    if (!dialog) return
    const active = document.activeElement
    openerRef.current = active instanceof HTMLElement ? active : null
    restoreFocusRef.current = true
    if (!dialog.open) dialog.showModal()
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

  function handleRetry(id: string) {
    const href = pocketRetryHref(id, Date.now())
    if (!href.startsWith('/play?mode=pocket&id=') || !href.includes('&seed=')) {
      return
    }
    restoreFocusRef.current = false
    onClose()
    onRetry(id)
  }

  function handleRemove(id: string) {
    removeFromPocket(id)
    const next = listPocketStored(lang, cefr)
    onCount(next.length)
    if (next.length === 0) {
      setEntries([])
      setCleared(true)
      onClose()
      return
    }
    setEntries(next)
  }

  return createPortal(
    <dialog
      ref={dialogRef}
      className="pocket-sheet"
      role="dialog"
      aria-modal="true"
      aria-labelledby="pocket-sheet-heading"
      onCancel={(event) => {
        event.preventDefault()
        onClose()
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div className="pocket-sheet-panel">
        <h2 id="pocket-sheet-heading" className="text-title text-ink">
          Pocket
        </h2>
        <p className="text-caption mt-1 mb-3">
          Meanings to retry, oldest first. Spelling stays hidden.
        </p>
        {cleared ? (
          <p className="text-sm text-accent-fg" role="status">
            Pocket cleared
          </p>
        ) : (
          <ul className="flex flex-col gap-3">
            {entries.map((entry, index) => {
              const glossId = `pocket-sheet-gloss-${index}`
              return (
                <li key={entry.id} className="flex flex-col gap-2">
                  <p id={glossId} className="text-sm text-ink">
                    {pocketListLabel(entry)}
                  </p>
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant="secondary"
                      className="min-h-11 flex-1"
                      aria-labelledby={`${glossId} pocket-sheet-retry-name`}
                      onClick={() => handleRetry(entry.id)}
                    >
                      Retry
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      className="min-h-11 flex-1"
                      aria-labelledby={`${glossId} pocket-sheet-remove-name`}
                      onClick={() => handleRemove(entry.id)}
                    >
                      Remove
                    </Button>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
        <span id="pocket-sheet-retry-name" className="sr-only">
          Retry
        </span>
        <span id="pocket-sheet-remove-name" className="sr-only">
          Remove
        </span>
      </div>
    </dialog>,
    document.body,
  )
}
