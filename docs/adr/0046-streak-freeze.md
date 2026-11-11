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
- A freeze covers one missed local day per midnight check. A gap of two or more missed days seen in one check still breaks the streak.

## Amendment (2026-11-09): match shipped behaviour

Status: Accepted. Docs-only; no code change.

- **Daily opens chain freezes.** Each open runs the midnight check (`ensureStreakPersisted`). A spent freeze moves `lastWinDate` to yesterday. So a learner with 2 freezes who opens the app on the first missed day and again on the second missed day spends both freezes, and the streak survives two missed days (`streaks.test.ts`, "opening the app each day with 2 freezes covers two missed days"). Two missed days with no open in between still break the streak; the freezes are kept.
- **Leftover freezes stay stored and hidden.** When the streak breaks with freezes held, `freezes` stays in storage. StreakChip renders nothing at count 0, so the freezes are hidden. They show again after the next daily win restarts the streak.
- Product acceptance "two missed days still break it" now reads: two missed days break it unless the learner opened the app on the first missed day and held 2 freezes.
