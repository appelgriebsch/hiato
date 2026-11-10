import { Badge } from '@/components/ui/badge'

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
    <Badge aria-label={label} pulse={pulse}>
      <span aria-hidden="true">🔥</span>
      {count}
      {held > 0 ? (
        <>
          <span aria-hidden="true">❄️</span>
          {held}
        </>
      ) : null}
    </Badge>
  )
}
