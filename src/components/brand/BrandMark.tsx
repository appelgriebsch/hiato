import { cn } from '@/lib/utils'

type Size = 'sm' | 'md' | 'lg'

const sizes: Record<Size, string> = {
  sm: 'h-7 w-7',
  md: 'h-8 w-8',
  lg: 'h-10 w-10',
}

/** In-app Hiato mark — linguistic gap (H · · O). Uses public SVG. */
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
  return (
    <img
      src="/brand/hiato-mark.svg"
      alt={alt ?? title}
      width={32}
      height={32}
      className={cn(sizes[size], 'shrink-0 select-none', className)}
      draggable={false}
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
      <span className="text-[15px] font-semibold tracking-tight text-ink">Hiato</span>
    </div>
  )
}
