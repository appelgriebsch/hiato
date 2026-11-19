import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { PixelIcon } from '@/components/PixelIcon'
import { Button } from '@/components/ui/button'
import {
  checkItems,
  suggestLevel,
  type LevelCheckItem,
} from '@/lib/level-check'
import { CEFR_CODES, CEFR_LINES } from '@/packs/labels'
import { loadPack } from '@/packs/load'
import {
  PACK_CEFR_LEVELS,
  type PackCefr,
  type PackLang,
  type WordPack,
} from '@/packs/schema'

type LevelCheckSheetProps = {
  lang: PackLang
  today: string
  open: boolean
  onClose: () => void
  onApply: (cefr: PackCefr) => void
}

type LevelCheckPhase = 'loading' | 'error' | 'questions' | 'result'

/** One question: word only (never the gloss), know / don't know (ADR 0050). */
export function LevelCheckQuestions({
  item,
  step,
  total,
  onAnswer,
}: {
  item: LevelCheckItem
  step: number
  total: number
  onAnswer: (knows: boolean) => void
}) {
  return (
    <div className="mt-4" data-level-check-questions>
      <p
        role="status"
        aria-live="polite"
        data-level-check-progress
        className="text-sm text-ink-muted"
      >
        Question {step + 1} of {total}
      </p>
      <p
        data-level-check-word
        className="text-pixel-display mt-2 break-words text-ink"
      >
        {item.word}
      </p>
      <p id="level-check-question-label" className="mt-2 text-sm text-ink-muted">
        Do you know this word?
      </p>
      <div
        className="mt-3 flex gap-2"
        role="group"
        aria-labelledby="level-check-question-label"
      >
        <Button
          type="button"
          variant="secondary"
          className="min-h-11 flex-1"
          data-level-check-know
          onClick={() => onAnswer(true)}
        >
          Know
        </Button>
        <Button
          type="button"
          variant="outline"
          className="min-h-11 flex-1"
          data-level-check-dont-know
          onClick={() => onAnswer(false)}
        >
          Don’t know
        </Button>
      </div>
    </div>
  )
}

/** Result: suggested level is advisory; "Keep my pick" always ignores it (ADR 0050/0051). */
export function LevelCheckResult({
  level,
  onApply,
  onKeep,
}: {
  level: PackCefr
  onApply: (cefr: PackCefr) => void
  onKeep: () => void
}) {
  return (
    <div className="mt-4" data-level-check-result>
      <p className="text-sm text-ink-muted">Suggested level</p>
      <p data-level-check-level className="text-pixel-display mt-1 text-ink">
        {CEFR_CODES[level]}
      </p>
      <p className="mt-1 text-sm text-ink-muted">{CEFR_LINES[level]}</p>
      <Button
        type="button"
        fullWidth
        className="mt-4 min-h-11"
        data-level-check-apply
        onClick={() => onApply(level)}
      >
        Use {CEFR_CODES[level]}
      </Button>
      <Button
        type="button"
        fullWidth
        variant="secondary"
        className="mt-2 min-h-11"
        data-level-check-keep
        onClick={onKeep}
      >
        Keep my pick
      </Button>
    </div>
  )
}

/**
 * Optional level check on /language (ADR 0050/0051, #227/#276). House dialog
 * sheet (PocketSheet/InstallHelp pattern): portal while open, showModal focus
 * trap, Esc / backdrop close, focus restore. Loads the six level packs of the
 * chosen language lazily on open (loadPack, cache-first). Writes nothing and
 * never touches the streak — all state lives in this component.
 */
export function LevelCheckSheet({
  lang,
  today,
  open,
  onClose,
  onApply,
}: LevelCheckSheetProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const closeRef = useRef<HTMLButtonElement>(null)
  const openerRef = useRef<HTMLElement | null>(null)
  const restoreFocusRef = useRef(false)
  const onCloseRef = useRef(onClose)
  // oxlint-disable-next-line react/refs -- latest onClose for the layout effect, not a render read
  onCloseRef.current = onClose
  const slotKey = `${lang}\0${today}`
  const [loadedFor, setLoadedFor] = useState<string | null>(null)
  const [phase, setPhase] = useState<LevelCheckPhase>('loading')
  const [items, setItems] = useState<LevelCheckItem[]>([])
  const [step, setStep] = useState(0)
  const [known, setKnown] = useState<PackCefr[]>([])

  if (open && loadedFor !== slotKey) {
    setLoadedFor(slotKey)
    setPhase('loading')
    setItems([])
    setStep(0)
    setKnown([])
  } else if (!open && loadedFor !== null) {
    setLoadedFor(null)
  }

  // Lazy pack load on first open (and on lang/day change while open).
  useEffect(() => {
    if (!open || loadedFor !== slotKey) return
    let cancelled = false
    void Promise.all(
      PACK_CEFR_LEVELS.map((cefr) => loadPack(lang, cefr)),
    )
      .then((packs) => {
        if (cancelled) return
        const map = {} as Record<PackCefr, WordPack>
        PACK_CEFR_LEVELS.forEach((cefr, i) => {
          map[cefr] = packs[i]!
        })
        setItems(checkItems(map, today, lang))
        setPhase('questions')
      })
      .catch(() => {
        if (!cancelled) setPhase('error')
      })
    return () => {
      cancelled = true
    }
  }, [open, loadedFor, slotKey, lang, today])

  useLayoutEffect(() => {
    const dialog = dialogRef.current
    if (!open) {
      if (dialog?.open) dialog.close()
      return
    }
    if (!dialog) return
    if (!dialog.open) {
      const active = document.activeElement
      openerRef.current = active instanceof HTMLElement ? active : null
      restoreFocusRef.current = true
      dialog.showModal()
    }
    closeRef.current?.focus()
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

  function answer(knows: boolean) {
    const item = items[step]
    if (!item) return
    if (knows) setKnown((prev) => [...prev, item.cefr])
    if (step + 1 >= items.length) setPhase('result')
    else setStep(step + 1)
  }

  return (
    <>
      {/* Sheet mounts only while open: keeps SSR/static render portal-free. */}
      {open &&
        createPortal(
          <dialog
            ref={dialogRef}
            className="level-check-sheet"
            role="dialog"
            aria-modal="true"
            aria-labelledby="level-check-sheet-heading"
            data-level-check-sheet
            onCancel={(event) => {
              event.preventDefault()
              onCloseRef.current()
            }}
            onClick={(event) => {
              if (event.target === event.currentTarget) onCloseRef.current()
            }}
          >
            <div className="px-stripe" aria-hidden="true" />
            <div className="level-check-sheet-panel">
              <div className="flex items-center justify-between gap-2">
                <h2
                  id="level-check-sheet-heading"
                  className="text-pixel-display flex items-center gap-2 text-ink"
                >
                  <PixelIcon name="spark" size={24} aria-hidden="true" />
                  Check your level
                </h2>
                <Button
                  ref={closeRef}
                  type="button"
                  variant="ghost"
                  className="min-h-11 min-w-11 shrink-0 px-3"
                  data-level-check-close
                  onClick={() => onCloseRef.current()}
                >
                  <PixelIcon
                    name="close"
                    size={16}
                    className="text-ink-muted"
                    aria-hidden="true"
                  />
                  Close
                </Button>
              </div>
              <p className="mt-1 text-sm text-ink-muted">
                Six words, one per level. Nothing is saved and your streak is
                not touched.
              </p>
              {phase === 'loading' ? (
                <p role="status" className="mt-4 text-sm text-ink-muted">
                  Loading words…
                </p>
              ) : null}
              {phase === 'error' ? (
                <p
                  role="alert"
                  data-level-check-error
                  className="mt-4 text-sm text-accent-fg"
                >
                  Could not load the word packs. Check your connection and try
                  again — or just pick a level below.
                </p>
              ) : null}
              {phase === 'questions' && items[step] ? (
                <LevelCheckQuestions
                  item={items[step]!}
                  step={step}
                  total={items.length}
                  onAnswer={answer}
                />
              ) : null}
              {phase === 'result' ? (
                <LevelCheckResult
                  level={suggestLevel(known)}
                  onApply={onApply}
                  onKeep={() => onCloseRef.current()}
                />
              ) : null}
            </div>
          </dialog>,
          document.body,
        )}
    </>
  )
}
