import { cva, type VariantProps } from 'class-variance-authority'
import { forwardRef, type ButtonHTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

const buttonVariants = cva(
  'motion-press inline-flex items-center justify-center gap-2 rounded-xl px-5 min-h-11 text-[15px] font-medium disabled:pointer-events-none disabled:opacity-45',
  {
    variants: {
      variant: {
        primary:
          'bg-accent text-white hover:bg-accent-mid shadow-sm',
        secondary:
          'bg-accent-soft text-accent-fg hover:bg-helped',
        ghost:
          'bg-transparent text-ink-muted hover:bg-cream-dark',
        outline:
          'bg-raised border border-line text-ink hover:bg-cream-dark',
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
