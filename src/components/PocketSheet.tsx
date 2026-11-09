import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { pickDailyLemma } from '@/engine'
import { getDailyRecord } from '@/lib/daily-record'
import {
  isDue,
  listPocketStored,
  nextReviewWhen,
  removeFromPocket,
  sortForSheet,
} from '@/lib/pocket'
import type { PocketEntry } from '@/lib/pocket'
import {
  dailyGateFor,
  playableDueEntries,
  type DailyGateSnapshot,
} from '@/lib/pocket-play'
import { pocketListLabel, pocketRetryHref } from '@/lib/pocket-save'
import { loadPack } from '@/packs/load'
import type { PackCefr, PackLang } from '@/packs/schema'

type PocketSheetProps = {
  lang: PackLang
  cefr: PackCefr
  today: string
  open: boolean
  onClose: () => void
  onCount: (n: number) => void
  onRetry: (id: string) => void
}

export function PocketSheet({
  lang,
  cefr,
  today,
  open,
  onClose,
  onCount,
  onRetry,
}: PocketSheetProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const openerRef = useRef<HTMLElement | null>(null)
  const restoreFocusRef = useRef(false)
  const focusRetryAt = useRef<number | null>(null)
  const reviewFocusedRef = useRef(false)
  const onCloseRef = useRef(onClose)
  // oxlint-disable-next-line react/refs -- latest onClose for the layout effect, not a render read
  onCloseRef.current = onClose
  const slotKey = `${lang}\0${cefr}\0${today}`
  const [loadedFor, setLoadedFor] = useState<string | null>(null)
  const [entries, setEntries] = useState<PocketEntry[]>([])
  const [gate, setGate] = useState<DailyGateSnapshot | null>(null)

  if (open && loadedFor !== slotKey) {
    setLoadedFor(slotKey)
    setEntries(sortForSheet(listPocketStored(lang, cefr), today))
    setGate(null)
    // oxlint-disable-next-line react/refs -- clear the pending focus index when the slot changes, in this render
    focusRetryAt.current = null
  } else if (!open && loadedFor !== null) {
    setLoadedFor(null)
  }

  const playable = gate ? playableDueEntries(entries, today, gate) : []
  const dueCount = entries.filter((entry) => isDue(entry, today)).length
  const nextAt = entries.find((entry) => !isDue(entry, today))?.dueAt

  useEffect(() => {
    if (!open) return
    let cancelled = false
    void loadPack(lang, cefr)
      .then((pack) => {
        if (cancelled) return
        const daily = pickDailyLemma(pack.lemmas, today, lang, cefr)
        setGate(dailyGateFor(today, daily.word, getDailyRecord(lang, cefr)))
      })
      .catch(() => {
        if (!cancelled) setGate(dailyGateFor(today, '\0', null))
      })
    return () => {
      cancelled = true
    }
  }, [open, lang, cefr, today])

  useLayoutEffect(() => {
    const dialog = dialogRef.current
    if (!open) {
      reviewFocusedRef.current = false
      if (dialog?.open) dialog.close()
      return
    }
    if (!dialog) return
    if (entries.length === 0) {
      // Only after this open has snapshotted storage. Empty is not a clear.
      if (loadedFor !== slotKey) return
      if (dialog.open) dialog.close()
      onCloseRef.current()
      return
    }
    const retryAt = focusRetryAt.current
    if (retryAt !== null) {
      focusRetryAt.current = null
      dialog
        .querySelector<HTMLButtonElement>(`[data-pocket-retry="${retryAt}"]`)
        ?.focus()
      return
    }
    if (!dialog.open) {
      const active = document.activeElement
      openerRef.current = active instanceof HTMLElement ? active : null
      restoreFocusRef.current = true
      dialog.showModal()
    }
    if (playable.length > 0 && !reviewFocusedRef.current) {
      const review = dialog.querySelector<HTMLButtonElement>('[data-pocket-review]')
      if (review) {
        reviewFocusedRef.current = true
        review.focus()
      }
    }
  }, [open, entries, loadedFor, slotKey, playable.length])

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
    // oxlint-disable-next-line react/purity -- Date.now() runs in the click handler, not during render
    const href = pocketRetryHref(id, Date.now())
    if (!href.startsWith('/play?mode=pocket&id=') || !href.includes('&seed=')) {
      return
    }
    restoreFocusRef.current = false
    onClose()
    onRetry(id)
  }

  function handleRemove(id: string) {
    const removedAt = entries.findIndex((entry) => entry.id === id)
    removeFromPocket(id)
    const next = sortForSheet(listPocketStored(lang, cefr), today)
    onCount(next.length)
    if (next.length === 0) {
      // Status stays on the opener. Restoring focus would land on a control
      // this remove is about to unmount.
      setEntries([])
      restoreFocusRef.current = false
      onClose()
      return
    }
    focusRetryAt.current = Math.min(
      Math.max(removedAt, 0),
      next.length - 1,
    )
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
        <div className="flex items-center justify-between gap-2">
          <h2 id="pocket-sheet-heading" className="text-title text-ink">
            Pocket
          </h2>
          <Button
            type="button"
            variant="ghost"
            className="min-h-11 min-w-11 shrink-0 px-3"
            onClick={onClose}
          >
            Close
          </Button>
        </div>
        <p className="mt-1 mb-3 text-sm text-ink-muted">
          {dueCount > 0
            ? `${dueCount} due today. Spelling stays hidden.`
            : `Nothing due today. Next review ${nextAt == null ? 'tomorrow' : nextReviewWhen(nextAt, today)}.`}
        </p>
        {playable.length > 0 ? (
          <Button
            type="button"
            fullWidth
            className="mb-3 min-h-11"
            data-pocket-review
            onClick={() => {
              const first = playable[0]
              if (first) handleRetry(first.id)
            }}
          >
            Review due words ({playable.length})
          </Button>
        ) : null}
        <ul className="flex flex-col gap-3">
            {entries.map((entry, index) => {
              const glossId = `pocket-sheet-gloss-${index}`
              const dueId = `pocket-sheet-due-${index}`
              const whenId = `pocket-sheet-when-${index}`
              const due = isDue(entry, today)
              return (
                <li key={entry.id} className="flex flex-col gap-2">
                  <div className="flex items-start justify-between gap-2">
                    <p id={glossId} className="min-w-0 text-sm text-ink">
                      {pocketListLabel(entry)}
                    </p>
                    {due ? (
                      <Badge id={dueId} tone="accent" className="shrink-0">
                        Due
                      </Badge>
                    ) : null}
                  </div>
                  {due ? null : (
                    <p id={whenId} className="text-xs text-ink-muted">
                      Next review {nextReviewWhen(entry.dueAt, today)}
                    </p>
                  )}
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant="secondary"
                      className="min-h-11 flex-1"
                      data-pocket-retry={index}
                      aria-labelledby={
                        due
                          ? `${glossId} ${dueId} pocket-sheet-retry-name`
                          : `${glossId} ${whenId} pocket-sheet-retry-name`
                      }
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
