import type { HTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

/** Arcade card (ADR 0052 §5.2): raised fill, 2px edge outline, hard 4px 6px drop. */
export function Card({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('bg-raised px-frame px-drop-card p-5', className)}
      {...props}
    />
  )
}
