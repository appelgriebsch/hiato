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
    <Badge aria-label={`Streak ${count}`} pulse={pulse}>
      {count}
    </Badge>
  )
}
