import { cva, type VariantProps } from 'class-variance-authority'
import { forwardRef, type ButtonHTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

/**
 * Arcade buttons (ADR 0052 §5.1): min height 48px, Jersey 28px, square corners,
 * 2px outline + hard drop. Active is a cabinet press (translateY(4px), drop 2px).
 * Ghost stays Inter 600 15px with a 2px underline. Disabled: 45% opacity.
 */
const buttonVariants = cva(
  'motion-press inline-flex items-center justify-center gap-2 px-5 min-h-11 disabled:pointer-events-none disabled:opacity-45',
  {
    variants: {
      variant: {
        primary:
          'text-pixel-title px-frame px-drop bg-accent text-white hover:bg-accent-mid',
        secondary:
          'text-pixel-title border-2 border-accent-fg px-drop-only bg-accent-soft text-accent-fg hover:bg-helped',
        ghost:
          'font-sans text-[15px] font-semibold underline decoration-2 underline-offset-4 bg-transparent text-ink-muted hover:text-ink',
        outline:
          'text-pixel-title px-frame px-drop bg-raised text-ink hover:bg-cream-dark',
      },
      fullWidth: {
        true: 'w-full',
        false: '',
      },
    },
    defaultVariants: {
      variant: 'primary',
      fullWidth: false,
    },
  },
)

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  function Button(
    { className, variant, fullWidth, type = 'button', ...props },
    ref,
  ) {
    return (
      <button
        ref={ref}
        type={type}
        className={cn(buttonVariants({ variant, fullWidth }), className)}
        {...props}
      />
    )
  },
)
