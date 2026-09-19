import { cva, type VariantProps } from 'class-variance-authority'
import type { ButtonHTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 rounded-xl px-5 min-h-11 text-[15px] font-medium transition-all disabled:pointer-events-none disabled:opacity-45',
  {
    variants: {
      variant: {
        primary:
          'bg-accent text-white hover:bg-accent-mid active:scale-[0.98] shadow-sm',
        secondary:
          'bg-accent-soft text-accent hover:bg-helped active:scale-[0.98]',
        ghost:
          'bg-transparent text-ink-muted hover:bg-cream-dark active:scale-[0.98]',
        outline:
          'bg-white border border-line text-ink hover:bg-cream-dark active:scale-[0.98]',
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

export function Button({
  className,
  variant,
  fullWidth,
  type = 'button',
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={cn(buttonVariants({ variant, fullWidth }), className)}
      {...props}
    />
  )
}
