# ADR 0046: Streak freeze — earn 1 per 7 consecutive wins, cap 2, auto-consume at midnight

- **Status**: Accepted
- **Date**: 2026-11-08
- **Deciders**: Andreas Gerlach
- **Supersedes**: none; amends ADR 0003/0004 streak semantics (a freeze covers exactly one missed local day)
- **Related issues**: tracer issue for streak freeze (see PR body)

## Context

Streaks (`src/lib/streaks.ts`) clear at the local midnight after a missed day (`visibleStreak` / `applyMidnightBreak`). One busy day wipes the count. Competitors sell streak protection; Hiato wants a guest-local equivalent. Options: auto-consume at the midnight break vs a manual "use freeze" button, and various earn rules.

## Decision

`StreakState` gains `freezes: number` (parse fallback 0 for existing stored state). A daily win that lands the streak on a multiple of 7 grants one freeze, capped at 2. When `applyMidnightBreak` would zero a live streak and `freezes > 0`, it consumes one freeze instead: the count is kept and `lastWinDate` moves to the previous local day, so the streak survives exactly one missed local day. The StreakChip shows the freeze count when it is above zero. Freezes are guest-local like the streak itself; D1 sync (ADR 0033) is out of scope here.

## Options Considered

| Option | Pros | Cons |
| --- | --- | --- |
| 1 per 7 wins, cap 2, auto-consume (chosen) | No extra UI to mis-tap; predictable economy; smallest change to midnight logic | Learner cannot choose which day to protect |
| Manual use button | Learner agency | More UI, same stored effect, mis-tap risk |
| Cap 1, earn per 14 wins | More conservative | Feels stingy at low streaks |

## Consequences

- `streaks.ts` pure functions change (`recordDailyWin`, `applyMidnightBreak`) with parse migration; `streaks.test.ts` gains cases for earn, cap, consume, and survive-one-missed-day.
- StreakChip renders the freeze count; no other surface changes.
- A freeze covers one missed local day only; two consecutive missed days still break the streak.
