import type { HTMLAttributes, ReactNode } from 'react'
import { cn } from '@/lib/utils'

/**
 * Pixel badges (ADR 0052 §5.8): Jersey 18.67px, square corners, 2px outline in
 * the tone colour (via --px-edge on .px-frame).
 */
const tones = {
  neutral: 'bg-cream-dark text-ink-muted [--px-edge:var(--color-ink-muted)]',
  accent: 'bg-accent-soft text-accent-fg [--px-edge:var(--color-accent-fg)]',
  warm: 'bg-danger-soft text-danger [--px-edge:var(--color-danger)]',
} as const

export function Badge({
  children,
  tone = 'neutral',
  pulse = false,
  className,
  ...props
}: {
  children: ReactNode
  tone?: keyof typeof tones
  pulse?: boolean
} & HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      className={cn(
        'text-pixel-label px-frame inline-flex items-center gap-1 px-2.5 py-1',
        tones[tone],
        pulse ? 'motion-streak-pulse' : '',
        className,
      )}
      {...props}
    >
      {children}
    </span>
  )
}
