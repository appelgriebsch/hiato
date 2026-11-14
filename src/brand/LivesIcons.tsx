import type { SVGProps } from 'react'
import { PixelIcon } from '@/components/PixelIcon'
import type { LivesMetaphor } from './livesMetaphor'

type IconProps = SVGProps<SVGSVGElement> & { filled?: boolean }

/**
 * Lives stay seeds (ADR 0025), drawn as pixel seeds (ADR 0052 §4):
 * filled = accent-fg seed, used = ink-muted outline seed. There is no heart.
 */
export function SeedIcon({ filled = true, ...rest }: IconProps) {
  const name: 'seed' | 'seed-empty' = filled ? 'seed' : 'seed-empty'
  return <PixelIcon {...rest} name={name} size={24} />
}

export function LivesMetaphorIcon({
  metaphor,
  filled,
  ...rest
}: IconProps & { metaphor: LivesMetaphor }) {
  // Only 'seeds' ships (LIVES_METAPHOR); other metaphors fall back to the seed.
  void metaphor
  return <SeedIcon filled={filled} {...rest} />
}
