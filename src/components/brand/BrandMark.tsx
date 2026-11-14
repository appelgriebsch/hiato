import { PixelIcon } from '@/components/PixelIcon'
import { cn } from '@/lib/utils'

type Size = 'sm' | 'md' | 'lg'

const sizes: Record<Size, string> = {
  sm: 'h-7 w-7',
  md: 'h-8 w-8',
  lg: 'h-10 w-10',
}

/**
 * In-app Hiato mark — pixel "H · O" from docs/design/retro/assets/icons/mark.svg
 * (ADR 0052 decision 5: in-app only; public/brand and favicon files stay untouched).
 * Colours: accent with raised inner pixels.
 */
export function BrandMark({
  size = 'md',
  className = '',
  title = 'Hiato',
  alt,
}: {
  size?: Size
  className?: string
  title?: string
  /** Empty string marks the mark decorative when a wordmark is adjacent. */
  alt?: string
}) {
  const decorative = alt === ''
  return (
    <PixelIcon
      name="mark"
      size={32}
      className={cn(
        sizes[size],
        'shrink-0 select-none text-accent [--icon-2:var(--color-raised)]',
        className,
      )}
      {...(decorative
        ? {}
        : { role: 'img' as const, 'aria-label': alt ?? title, 'aria-hidden': false })}
    />
  )
}

export function BrandLockup({
  size = 'md',
  className = '',
}: {
  size?: Size
  className?: string
}) {
  return (
    <div className={cn('flex items-center gap-2', className)}>
      <BrandMark size={size} alt="" />
      <span className="text-pixel-title text-ink">Hiato</span>
    </div>
  )
}
