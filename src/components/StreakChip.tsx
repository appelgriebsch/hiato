import { PixelIcon } from '@/components/PixelIcon'
import { Badge } from '@/components/ui/badge'

/**
 * Streak chip (ADR 0052 §5.8): raised fill, 2px line outline, notched corners.
 * The flame icon replaces the old fire emoji (coin with a danger core); the
 * freeze icon replaces the snowflake. role="img" + aria-label are unchanged.
 */
export function StreakChip({
  count,
  freezes = 0,
  pulse = false,
}: {
  count: number
  freezes?: number
  pulse?: boolean
}) {
  if (count <= 0) return null
  const held = Number.isFinite(freezes) ? Math.max(0, Math.floor(freezes)) : 0
  const label =
    held > 0
      ? `Streak ${count}, ${held} ${held === 1 ? 'freeze' : 'freezes'}`
      : `Streak ${count}`
  return (
    <Badge
      role="img"
      aria-label={label}
      pulse={pulse}
      className="bg-raised text-ink [--px-edge:var(--color-line)]"
    >
      <PixelIcon
        name="flame"
        size={16}
        className="text-coin [--icon-2:var(--color-danger)]"
      />
      <span className="text-pixel-title">{count}</span>
      {held > 0 ? (
        <>
          <PixelIcon name="freeze" size={16} className="text-ink-muted" />
          <span className="text-pixel-title">{held}</span>
        </>
      ) : null}
    </Badge>
  )
}
