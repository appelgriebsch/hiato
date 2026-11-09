# ADR 0045: Local stats page — ring buffer of last 50 results plus aggregates

- **Status**: Accepted
- **Date**: 2026-11-08
- **Deciders**: Andreas Gerlach
- **Supersedes**: none
- **Related issues**: tracer issue for the stats page (see PR body)

## Context

`hiato.daily` (`src/lib/daily-record.ts`) keeps only the latest record per `lang|cefr` slot; the StreakChip shows the current streak. There is no local win history, so no stats page. Storing full unlimited history risks localStorage quota growth; accounts/server stats are out of scope (ADR 0008).

## Decision

Add a new guest-local key `hiato.history`: per `lang|cefr` slot, a ring buffer of the last 50 round results `{ dateKey, won, livesLeft, mode }`, written where daily results are persisted (and optionally for practice rounds with `mode` set). Aggregates — win rate, average lives left on wins, and a lives-used distribution grid per slot — are computed on read. A Stats screen (narrow-viewport Drawer/Sheet pattern per the locked UI shell conventions) reads the ring buffer; empty state when there is no history.

## Options Considered

| Option | Pros | Cons |
| --- | --- | --- |
| Ring buffer 50 + on-read aggregates (chosen) | Bounded storage; supports a Wordle-style distribution grid; fits the localStorage lib pattern | Loses results older than 50 per slot |
| Aggregate counters only | Smallest storage | No distribution grid; averages only |
| Unlimited history | Complete | Unbounded localStorage growth |

## Consequences

- New module `src/lib/history.ts` sibling to `daily-record.ts` / `streaks.ts`: pure parse/validate/evict/write helpers, `bun:test` coverage for eviction and aggregate math.
- One write call added at the daily persist site; practice recording is optional and must stay streak-immune.
- Stats are per lang×CEFR and guest-local; clearing site data wipes them.
