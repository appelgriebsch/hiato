import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Button } from '@/components/ui/button'
import { historySlot, statsFor, type SlotStats } from '@/lib/history'
import { CEFR_CODES, LANG_LABELS } from '@/packs/labels'
import type { PackCefr, PackLang } from '@/packs/schema'

type StatsSheetProps = {
  lang: PackLang
  cefr: PackCefr
  open: boolean
  onClose: () => void
}

const ROW_LEFTS = [6, 5, 4, 3, 2, 1] as const

export function StatsSheet({ lang, cefr, open, onClose }: StatsSheetProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const closeRef = useRef<HTMLButtonElement>(null)
  const openerRef = useRef<HTMLElement | null>(null)
  const restoreFocusRef = useRef(false)
  const onCloseRef = useRef(onClose)
  // oxlint-disable-next-line react/refs -- latest onClose for the layout effect, not a render read
  onCloseRef.current = onClose
  const slotKey = historySlot(lang, cefr)
  const [loadedFor, setLoadedFor] = useState<string | null>(null)
  const [stats, setStats] = useState<SlotStats | null>(null)

  if (open && loadedFor !== slotKey) {
    setLoadedFor(slotKey)
    setStats(statsFor(slotKey))
  } else if (!open && loadedFor !== null) {
    setLoadedFor(null)
  }

  useLayoutEffect(() => {
    const dialog = dialogRef.current
    if (!open) {
      if (dialog?.open) dialog.close()
      return
    }
    if (!dialog) return
    // Live read, not the snapshot: a wipe while open (same tab or another)
    // closes the sheet and restores focus even if no render re-snapshotted.
    if (loadedFor === slotKey && statsFor(slotKey).played === 0) {
      if (dialog.open) dialog.close()
      restoreFocusRef.current = true
      onCloseRef.current()
      return
    }
    if (!dialog.open) {
      const active = document.activeElement
      openerRef.current = active instanceof HTMLElement ? active : null
      restoreFocusRef.current = true
      dialog.showModal()
      closeRef.current?.focus()
    }
  }, [open, stats, loadedFor, slotKey])

  // Wipe while open: storage events do not fire in the tab that wrote, so
  // also re-snapshot on focus / visibility return and let the layout effect
  // above close.
  useEffect(() => {
    if (!open) return
    const refresh = () => {
      setStats(statsFor(slotKey))
    }
    const onStorage = (event: StorageEvent) => {
      if (event.key && event.key !== 'hiato.history') return
      refresh()
    }
    window.addEventListener('storage', onStorage)
    window.addEventListener('focus', refresh)
    document.addEventListener('visibilitychange', refresh)
    return () => {
      window.removeEventListener('storage', onStorage)
      window.removeEventListener('focus', refresh)
      document.removeEventListener('visibilitychange', refresh)
    }
  }, [open, slotKey])

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

  const maxRow = stats
    ? Math.max(...ROW_LEFTS.map((left) => stats.rows[String(left) as '6' | '5' | '4' | '3' | '2' | '1']), stats.rows.lost)
    : 0

  function barPct(count: number): number {
    if (maxRow === 0 || count === 0) return 0
    return (count / maxRow) * 100
  }

  return createPortal(
    <dialog
      ref={dialogRef}
      className="stats-sheet"
      role="dialog"
      aria-modal="true"
      aria-labelledby="stats-sheet-heading"
      onCancel={(event) => {
        event.preventDefault()
        onClose()
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div className="stats-sheet-panel">
        <div className="flex items-center justify-between gap-2">
          <h2 id="stats-sheet-heading" className="text-title text-ink">
            Stats
          </h2>
          <Button
            ref={closeRef}
            type="button"
            variant="ghost"
            className="min-h-11 min-w-11 shrink-0 px-3"
            onClick={onClose}
          >
            Close
          </Button>
        </div>
        {stats ? (
          <>
            <p className="mt-1 text-sm text-ink-muted">
              {LANG_LABELS[lang]} {CEFR_CODES[cefr]} &middot; last {stats.played}{' '}
              {stats.played === 1 ? 'round' : 'rounds'}
            </p>
            <p className="mt-1 mb-4 text-sm text-ink-muted">Daily and Practice only.</p>
            <dl className="mb-4 flex flex-col gap-2">
              <div className="flex items-baseline justify-between gap-2">
                <dt className="text-sm text-ink-muted">Win rate</dt>
                <dd
                  className="text-title text-ink"
                  role="img"
                  aria-label={`Win rate, ${stats.winRate} percent`}
                >
                  {stats.winRate}%
                </dd>
              </div>
              <div className="flex items-baseline justify-between gap-2">
                <dt className="text-sm text-ink-muted">Average lives left</dt>
                <dd
                  className="text-title text-ink"
                  role="img"
                  aria-label={
                    stats.avgLivesLeftOnWins === null
                      ? 'Average lives left on wins, no wins yet'
                      : `Average lives left on wins, ${stats.avgLivesLeftOnWins.toFixed(1)}`
                  }
                >
                  {stats.avgLivesLeftOnWins === null
                    ? 'No wins yet'
                    : stats.avgLivesLeftOnWins.toFixed(1)}
                </dd>
              </div>
            </dl>
            <h3 className="mb-2 text-sm font-medium text-ink">Wins by lives left</h3>
            <ul className="flex flex-col gap-2">
              {ROW_LEFTS.map((left) => {
                const count = stats.rows[String(left) as '6' | '5' | '4' | '3' | '2' | '1']
                return (
                  <li
                    key={left}
                    role="img"
                    aria-label={`${left} ${left === 1 ? 'life' : 'lives'} left: ${count} ${count === 1 ? 'win' : 'wins'}`}
                    className="flex items-center gap-2 text-sm"
                  >
                    <span className="w-10 shrink-0 text-ink">{left}</span>
                    <span className="stats-bar-track h-3 min-w-0 flex-1 overflow-hidden rounded-full">
                      <span
                        className="stats-bar block h-full rounded-full"
                        style={{ width: `${barPct(count)}%` }}
                      />
                    </span>
                    <span className="w-6 shrink-0 text-right text-ink">{count}</span>
                  </li>
                )
              })}
              <li
                role="img"
                aria-label={`Lost: ${stats.rows.lost} ${stats.rows.lost === 1 ? 'round' : 'rounds'}`}
                className="flex items-center gap-2 text-sm"
              >
                <span className="w-10 shrink-0 text-ink">Lost</span>
                <span className="stats-bar-track h-3 min-w-0 flex-1 overflow-hidden rounded-full">
                  <span
                    className="stats-bar block h-full rounded-full"
                    style={{ width: `${barPct(stats.rows.lost)}%` }}
                  />
                </span>
                <span className="w-6 shrink-0 text-right text-ink">{stats.rows.lost}</span>
              </li>
            </ul>
          </>
        ) : null}
      </div>
    </dialog>,
    document.body,
  )
}
