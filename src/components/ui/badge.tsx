import type { HTMLAttributes, ReactNode } from 'react'
import { cn } from '@/lib/utils'

const tones = {
  neutral: 'bg-cream-dark text-ink-muted',
  accent: 'bg-accent-soft text-accent',
  warm: 'bg-danger-soft text-danger',
} as const

export function Badge({
  children,
  tone = 'neutral',
  className,
  ...props
}: {
  children: ReactNode
  tone?: keyof typeof tones
} & HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium',
        tones[tone],
        className,
      )}
      {...props}
    >
      {children}
    </span>
  )
}
