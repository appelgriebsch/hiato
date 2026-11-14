import { BrandMark } from '@/components/brand/BrandMark'
import { PixelIcon } from '@/components/PixelIcon'
import { letterCountLabel } from '@/engine'
import {
  shareCardCefrLabel,
  shareCardKicker,
  shareCardLangLabel,
  shareCardOutcome,
  type ShareCardPayload,
} from '@/lib/share-card'

/**
 * Retro share card (ADR 0052 §5.10): stripe, pixel mark, Jersey wordmark,
 * kicker, framed score panel (labels ink-muted, values Jersey), a hidden-letter
 * tile row that never shows the answer, the outcome badge (✓ drawn as
 * check.svg, the string itself stays as visually hidden text) and the footer.
 * Follows light or dark via tokens; the saved PNG is always light.
 */
export function ShareCard(payload: ShareCardPayload) {
  const outcome = shareCardOutcome(payload)
  const visibleOutcome = payload.won ? outcome.replace('✓', '').trim() : outcome
  const level = shareCardCefrLabel(payload.cefr)
  // Code at value size, name underneath. One value-size line overflows the half-width cell.
  const levelLines = level.split(' · ')
  return (
    <div
      id="hiato-share-card"
      className="motion-share-card px-frame px-drop-card mx-auto w-full max-w-sm shrink-0 overflow-hidden bg-raised"
    >
      <div className="px-stripe" aria-hidden="true" />
      <div className="px-6 pt-6 pb-2 text-center">
        <div className="mb-2.5 flex justify-center">
          <BrandMark size="sm" alt="" />
        </div>
        <div className="text-pixel-display text-accent-fg">Hiato</div>
        <p className="mt-1 text-sm text-ink-muted">{shareCardKicker(payload)}</p>
      </div>
      <div className="px-frame mx-6 my-4 grid min-w-0 grid-cols-2 gap-3 bg-raised p-4 text-left [--px-edge:var(--color-line)]">
        <div className="min-w-0">
          <div className="text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-muted">
            Language
          </div>
          <div className="text-pixel-value whitespace-nowrap text-ink">{shareCardLangLabel(payload.lang)}</div>
        </div>
        <div className="min-w-0">
          <div className="text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-muted">
            Level
          </div>
          {levelLines.length === 2 ? (
            <div className="text-ink">
              <div className="text-pixel-value leading-none">{levelLines[0]}</div>
              {/* break-words lands later in the Tailwind sheet and would cancel anywhere. */}
              <div className="text-pixel-label leading-none tracking-normal break-words ![overflow-wrap:anywhere]">
                {levelLines[1]}
              </div>
            </div>
          ) : (
            <div className="text-pixel-value whitespace-nowrap text-ink">{level}</div>
          )}
        </div>
        <div className="min-w-0">
          <div className="text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-muted">
            Streak
          </div>
          <div className="text-pixel-value flex items-center gap-1 whitespace-nowrap text-ink">
            <PixelIcon
              name="flame"
              size={18}
              className="text-coin [--icon-2:var(--color-danger)]"
            />
            {payload.streak}
          </div>
        </div>
        <div className="min-w-0">
          <div className="text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-muted">
            Date
          </div>
          <div className="text-pixel-value whitespace-nowrap text-ink">{payload.dateKey}</div>
        </div>
      </div>
      <div className="flex flex-wrap justify-center gap-2 px-6" aria-hidden="true">
        {Array.from({ length: payload.wordLength }, (_, i) => (
          <span
            key={i}
            className="tile-hidden flex h-11 w-11 shrink-0 items-center justify-center bg-raised text-lg text-ink-muted"
          >
            ·
          </span>
        ))}
      </div>
      <div className="px-6 pt-5 pb-6 text-center">
        {payload.won ? (
          <span className="text-pixel-label px-frame inline-flex items-center gap-1.5 bg-accent-soft px-4 py-2 text-accent-fg [--px-edge:var(--color-accent-fg)]">
            <span className="sr-only">{outcome}</span>
            <PixelIcon name="check" size={16} aria-hidden="true" />
            <span aria-hidden="true">
              {visibleOutcome} · {letterCountLabel(payload.wordLength)}
            </span>
          </span>
        ) : (
          <span className="text-pixel-label px-frame inline-flex items-center gap-1.5 bg-raised px-4 py-2 text-ink [--px-edge:var(--color-line)]">
            {outcome} · {letterCountLabel(payload.wordLength)}
          </span>
        )}
        <p className="mt-3 text-xs text-ink-muted">Answer hidden — come play yours</p>
      </div>
    </div>
  )
}
