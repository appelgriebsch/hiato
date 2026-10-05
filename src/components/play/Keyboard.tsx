import type { CSSProperties } from 'react'
import { graphemeKey } from '@/engine'
import {
  ACCENT_STRIP_LABEL,
  LETTER_PADS,
  keyUsesUppercaseFace,
  padColumns,
} from '@/lib/keyboards'
import type { PackLang } from '@/packs/schema'

type KeyState = {
  usedWrong: Set<string>
  usedCorrect: Set<string>
  disabled?: boolean
  onKey: (letter: string) => void
  shakeKey?: string | null
}

/**
 * Custom letter pad — the only mobile input (#138; no system-keyboard toggle).
 *
 * Each source QWERTY/QWERTZ row is ONE `flex-nowrap` row: keys share the row
 * width (`flex-1 min-w-0`, capped at one column pitch so short rows center)
 * and never wrap into mid-row orphans. Render it full-bleed in the Layout
 * footer (`footerBleed`) so it sits in the bottom safe-area thumb zone.
 *
 * Hit-slop: the `<button>` is an invisible tap box — 48px tall (height floor
 * ≥44 via `data-tap-min-h`), edge-to-edge with its neighbours (no dead gap) —
 * and the painted face is an inset `<span>`. Width is the row’s column share
 * (not a 44×44 square — phone columns are narrower). The visual gap is the
 * inset (`--pad-half-gap`: ≤4px gap until rows fit; 6–8px rules exist but do
 * not fire under `max-w-md` — see `[data-letter-pad]` in index.css).
 */
export function Keyboard({
  lang,
  usedWrong,
  usedCorrect,
  disabled,
  onKey,
  shakeKey,
}: {
  lang: PackLang
} & KeyState) {
  const pad = LETTER_PADS[lang]
  const cols = padColumns(pad)
  const state: KeyState = { usedWrong, usedCorrect, disabled, onKey, shakeKey }
  return (
    // Outer size container so @container rules can style [data-letter-pad]
    // (the pad itself cannot be both the container and the styled node).
    <div className="w-full min-w-0" data-letter-pad-cq>
      <div
        className="flex w-full min-w-0 flex-col overflow-hidden px-1 pt-1.5 pb-1"
        role="group"
        aria-label="Letter pad"
        data-letter-pad
        data-pad-cols={cols}
        data-tap-min-h="44"
        style={{ '--pad-cols': cols } as CSSProperties}
      >
        {pad.rows.map((row, ri) => (
          <KeyRow key={ri} row={row} {...state} />
        ))}
        {pad.accentStrip ? (
          <div
            role="group"
            aria-label="Accent keys"
            data-accent-strip
            className="mt-1 rounded-xl border border-line bg-cream-dark/60 px-0.5 pt-0.5"
          >
            <p
              aria-hidden="true"
              className="px-1.5 text-[10px] font-semibold uppercase leading-4 tracking-wider text-ink-muted"
            >
              {ACCENT_STRIP_LABEL}
            </p>
            <KeyRow row={pad.accentStrip} {...state} />
          </div>
        ) : null}
      </div>
    </div>
  )
}

function KeyRow({
  row,
  usedWrong,
  usedCorrect,
  disabled,
  onKey,
  shakeKey,
}: { row: string[] } & KeyState) {
  return (
    <div
      data-pad-row
      className="flex w-full min-w-0 flex-nowrap justify-center"
    >
      {row.map((key) => {
        const k = graphemeKey(key)
        const wrong = usedWrong.has(k)
        const correct = usedCorrect.has(k)
        const shaking = shakeKey === k
        return (
          <button
            key={key}
            type="button"
            data-hit-slop
            disabled={disabled || wrong || correct}
            onClick={() => onKey(key)}
            className={[
              'group flex h-12 min-h-11 min-w-0 max-w-[calc(100%/var(--pad-cols))] flex-1 basis-0 touch-manipulation select-none px-[var(--pad-half-gap)] py-[3px] motion-press focus-visible:outline-none',
              wrong || correct ? 'key-settled' : '',
              shaking ? 'motion-key-shake' : '',
            ].join(' ')}
          >
            <span
              className={[
                'flex min-w-0 flex-1 items-center justify-center rounded-lg text-base font-semibold motion-key-wrong-dim group-focus-visible:ring-2 group-focus-visible:ring-accent-fg',
                keyUsesUppercaseFace(key) ? 'uppercase' : 'normal-case',
                wrong
                  ? 'bg-wrong/70 text-ink'
                  : correct
                    ? 'bg-accent text-white'
                    : 'bg-raised border border-line text-ink group-hover:bg-cream-dark',
              ].join(' ')}
            >
              {key}
            </span>
          </button>
        )
      })}
    </div>
  )
}
