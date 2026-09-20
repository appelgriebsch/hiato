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
      setDepleting(remaining)
      const t = window.setTimeout(() => setDepleting(null), 320)
      prev.current = remaining
      return () => clearTimeout(t)
    }
    prev.current = remaining
  }, [remaining])

  const accent = livesAccentClass(metaphor)

  return (
    <div
      className="flex items-center gap-1"
      aria-label={`${remaining} of ${total} lives remaining`}
    >
      {Array.from({ length: total }, (_, i) => {
        const alive = i < remaining
        const isDepleting = depleting === i
        return (
          <span
            key={i}
            className={[
              'inline-flex h-5 w-5 items-center justify-center',
              'transition-[opacity,filter,transform] duration-200',
              isDepleting
                ? `motion-life-deplete ${accent}`
                : alive
                  ? `opacity-100 ${accent}`
                  : 'opacity-40 text-ink-faint',
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
