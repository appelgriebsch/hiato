import { useEffect, useRef, useState } from 'react'
import {
  LIVES_METAPHOR,
  type LivesMetaphor,
} from '@/brand/livesMetaphor'
import {
  LivesMetaphorIcon,
  livesAccentClass,
} from '@/brand/LivesIcons'
import { TOTAL_LIVES } from '@/engine'

/**
 * Lives row: six 24px pixel seeds (ADR 0025 + ADR 0052 §2). A lost life blinks
 * 3 times inside a 2px dashed danger outline, then becomes the outline seed.
 * The aria-live announcement is unchanged.
 */
export function Lives({
  remaining,
  total = TOTAL_LIVES,
  metaphor = LIVES_METAPHOR,
}: {
  remaining: number
  total?: number
  /** Override for demos; app default comes from LIVES_METAPHOR */
  metaphor?: LivesMetaphor
}) {
  const prev = useRef(remaining)
  const [depleting, setDepleting] = useState<number | null>(null)

  useEffect(() => {
    if (remaining < prev.current) {
      const reduceMotion = window.matchMedia(
        '(prefers-reduced-motion: reduce)',
      ).matches
      if (reduceMotion) {
        prev.current = remaining
        return
      }
      setDepleting(remaining)
      const t = window.setTimeout(() => setDepleting(null), 1500)
      prev.current = remaining
      return () => clearTimeout(t)
    }
    prev.current = remaining
  }, [remaining])

  const accent = livesAccentClass(metaphor)

  return (
    <div
      className="flex items-center gap-1"
      role="status"
      aria-live="polite"
      aria-label={`${remaining} lives remaining`}
    >
      {Array.from({ length: total }, (_, i) => {
        const alive = i < remaining
        const isDepleting = depleting === i
        return (
          <span
            key={i}
            className={[
              'inline-flex h-6 w-6 items-center justify-center',
              'transition-[opacity] duration-200',
              'motion-reduce:transition-none motion-reduce:duration-0',
              isDepleting
                ? `motion-life-deplete ${accent}`
                : alive
                  ? accent
                  : 'text-ink-muted',
            ].join(' ')}
            aria-hidden
          >
            <LivesMetaphorIcon metaphor={metaphor} filled={alive || isDepleting} />
          </span>
        )
      })}
    </div>
  )
}
