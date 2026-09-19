# ADR 0003: Core loop — daily primary + streaks

- Status: Accepted
- Date: 2026-09-19
- Deciders: Andreas Gerlach

## Context
Game must feel fun and addictive without overloading learners.

## Decision
Daily challenge is primary; streaks are tracked; endless practice mode is secondary.

## Consequences
- Need deterministic daily word selection per language+CEFR+local date.
- Streak state stored locally (IndexedDB/localStorage) in v1.
- Endless mode reuses the same engine without the daily seed.
