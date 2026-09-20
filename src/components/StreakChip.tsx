import { Badge } from '@/components/ui/badge'

export function StreakChip({ count }: { count: number }) {
  return (
    <Badge aria-label={`Streak ${count}`}>
      🔥 {count}
    </Badge>
  )
}
