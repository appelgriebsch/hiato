import { clsx, type ClassValue } from 'clsx'
import { extendTailwindMerge } from 'tailwind-merge'

// text-pixel-* is a font size. The default merger files every text-* it does
// not know as a colour, so text-white / text-ink dropped the pixel size.
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      'font-size': [
        { text: ['pixel-stat', 'pixel-display', 'pixel-title', 'pixel-label', 'pixel-value'] },
      ],
    },
  },
})

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
