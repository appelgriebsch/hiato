import type { SVGProps } from 'react'
import type { LivesMetaphor } from './livesMetaphor'

type IconProps = SVGProps<SVGSVGElement> & { filled?: boolean }

const base = {
  width: 18,
  height: 18,
  viewBox: '0 0 24 24',
  fill: 'none',
  xmlns: 'http://www.w3.org/2000/svg',
  'aria-hidden': true as const,
}

export function HeartIcon({ filled = true, ...rest }: IconProps) {
  return (
    <svg {...base} {...rest}>
      <path
        d="M12 20.4s-6.8-4.2-9.1-7.7C1.2 10.4 1.6 7 4.2 5.5c2-.1 3.7 1 4.8 2.6 1.1-1.6 2.8-2.7 4.8-2.6 2.6 1.5 3 4.9 1.3 7.2C18.8 16.2 12 20.4 12 20.4z"
        fill={filled ? 'currentColor' : 'none'}
        stroke="currentColor"
        strokeWidth={filled ? 0 : 1.75}
        opacity={filled ? 1 : 0.45}
      />
    </svg>
  )
}

export function StarIcon({ filled = true, ...rest }: IconProps) {
  return (
    <svg {...base} {...rest}>
      <path
        d="M12 3.2l2.2 5.1 5.5.5-4.2 3.7 1.3 5.4L12 15.4 7.2 17.9l1.3-5.4-4.2-3.7 5.5-.5L12 3.2z"
        fill={filled ? 'currentColor' : 'none'}
        stroke="currentColor"
        strokeWidth={1.6}
        strokeLinejoin="round"
        opacity={filled ? 1 : 0.4}
      />
    </svg>
  )
}

export function InkIcon({ filled = true, ...rest }: IconProps) {
  return (
    <svg {...base} {...rest}>
      <path
        d="M12 3.5c2.8 3.6 6 7.2 6 11a6 6 0 1 1-12 0c0-3.8 3.2-7.4 6-11z"
        fill={filled ? 'currentColor' : 'none'}
        stroke="currentColor"
        strokeWidth={1.7}
        strokeLinejoin="round"
        opacity={filled ? 1 : 0.4}
      />
      {filled && <circle cx="10.2" cy="14.2" r="1.1" fill="#f7f6f3" opacity="0.55" />}
    </svg>
  )
}

/** Seed — filled = plump seed; empty = outline ghost */
export function SeedIcon({ filled = true, ...rest }: IconProps) {
  return (
    <svg {...base} {...rest}>
      <path
        d="M12 3.8c3.2 2.2 5.4 5.6 5.4 9.2 0 3.4-2.4 6.2-5.4 6.2S6.6 16.4 6.6 13c0-3.6 2.2-7 5.4-9.2z"
        fill={filled ? 'currentColor' : 'none'}
        stroke="currentColor"
        strokeWidth={1.7}
        strokeLinejoin="round"
        opacity={filled ? 1 : 0.38}
      />
      {/* subtle hilum / center line */}
      <path
        d="M12 7.2v8.8"
        stroke={filled ? '#f7f6f3' : 'currentColor'}
        strokeWidth={1.2}
        strokeLinecap="round"
        opacity={filled ? 0.45 : 0.25}
      />
    </svg>
  )
}

export function ChalkIcon({ filled = true, ...rest }: IconProps) {
  return (
    <svg {...base} {...rest}>
      <rect
        x="8.2"
        y="4"
        width="7.6"
        height="16"
        rx="2.2"
        transform="rotate(-18 12 12)"
        fill={filled ? 'currentColor' : 'none'}
        stroke="currentColor"
        strokeWidth={1.6}
        opacity={filled ? 1 : 0.4}
      />
      {filled && (
        <path d="M9.5 17.8l5.2-1.7" stroke="#f7f6f3" strokeWidth="1.2" strokeLinecap="round" opacity="0.5" />
      )}
    </svg>
  )
}

export function TileIcon({ filled = true, ...rest }: IconProps) {
  return (
    <svg {...base} {...rest}>
      <rect
        x="4.5"
        y="4.5"
        width="15"
        height="15"
        rx="3"
        fill={filled ? 'currentColor' : 'none'}
        stroke="currentColor"
        strokeWidth={1.7}
        opacity={filled ? 1 : 0.4}
        strokeDasharray={filled ? undefined : '3 2'}
      />
      {filled && (
        <path
          d="M9 9.2v5.6M15 9.2v5.6M9 12h6"
          stroke="#f7f6f3"
          strokeWidth="1.5"
          strokeLinecap="round"
          opacity="0.7"
        />
      )}
    </svg>
  )
}

export function LivesMetaphorIcon({
  metaphor,
  filled,
  ...rest
}: IconProps & { metaphor: LivesMetaphor }) {
  switch (metaphor) {
    case 'stars':
      return <StarIcon filled={filled} {...rest} />
    case 'ink':
      return <InkIcon filled={filled} {...rest} />
    case 'seeds':
      return <SeedIcon filled={filled} {...rest} />
    case 'chalk':
      return <ChalkIcon filled={filled} {...rest} />
    case 'tiles':
      return <TileIcon filled={filled} {...rest} />
    case 'hearts':
    default:
      return <HeartIcon filled={filled} {...rest} />
  }
}

/** Accent color class for filled icons per metaphor */
export function livesAccentClass(metaphor: LivesMetaphor): string {
  switch (metaphor) {
    case 'seeds':
      return 'text-accent'
    case 'stars':
      return 'text-accent-mid'
    case 'ink':
      return 'text-ink'
    case 'chalk':
      return 'text-ink-muted'
    case 'tiles':
      return 'text-accent'
    case 'hearts':
    default:
      return 'text-danger'
  }
}
