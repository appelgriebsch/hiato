import { Badge } from '@/components/ui/badge'

export function StreakChip({ count }: { count: number }) {
  if (count <= 0) return null
  return (
    <Badge aria-label={`Streak ${count}`}>
      🔥 {count}
    </Badge>
  )
}
