import type { SVGProps } from 'react'
import { PIXEL_ICONS, type PixelIconName } from '@/brand/pixel-icons'

/**
 * Pixel icon on a 16×16 grid (ADR 0052 §4): SVG <rect> runs with
 * shape-rendering="crispEdges", fill currentColor; rects flagged in the data
 * use var(--icon-2, currentColor) as the second colour.
 * Icons are aria-hidden; the control (or its role="img" wrapper) carries the name.
 */
export function PixelIcon({
  name,
  size = 16,
  className,
  ...rest
}: {
  name: PixelIconName
  size?: number
} & Omit<SVGProps<SVGSVGElement>, 'name' | 'children'>) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      shapeRendering="crispEdges"
      aria-hidden="true"
      focusable="false"
      className={className}
      {...rest}
    >
      {PIXEL_ICONS[name].map((r, i) => (
        <rect
          key={i}
          x={r.x}
          y={r.y}
          width={r.w}
          height={r.h}
          fill={r.c === '2' ? 'var(--icon-2, currentColor)' : 'currentColor'}
        />
      ))}
    </svg>
  )
}
