import { Badge } from '@/components/ui/badge'

export function StreakChip({
  count,
  pulse = false,
}: {
  count: number
  pulse?: boolean
}) {
  if (count <= 0) return null
  return (
    <Badge aria-label={`Streak ${count}, fire`} pulse={pulse}>
      <span aria-hidden="true">🔥</span>
      {count}
    </Badge>
  )
}
