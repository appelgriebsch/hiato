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

## Amendment (2026-11-11): grill locks and UX for #221

Status: Accepted. Deciders: Andreas Gerlach. UX: UX Uma.

- **Recorded modes (Q1 B).** Daily and Practice rounds are recorded. Pocket rounds are not: a Pocket round retries a missed word and would count it twice. `mode` is `'daily' | 'practice'`.
- **Surface (Q2 B).** Stats opens as a native `<dialog>` sheet from Home, reusing the PocketSheet pattern. No new route, no About link. The Home button reads plain `Stats` (no count); its `aria-label` gives the round count (`Stats, 24 rounds`). It shows only when the current slot has at least one entry.
- **Prefill wins (Q3 B).** An A1/A2 round whose vowel help reveals the whole word at load is recorded as a win with 6 lives left.
- **Scope (Q4 A).** Stats shows the current language × CEFR slot only. No slot picker.
- **Grid (Q5 A, relabelled).** Heading `Wins by lives left`; rows `6, 5, 4, 3, 2, 1, Lost`. Labels use lives left, matching Play ("N lives remaining") and the headline average. The data is unchanged: lives used = `TOTAL_LIVES − livesLeft`. This replaces the earlier "lives-used grid" wording.
- **Headline.** Win rate as an integer percent; average lives left on wins with one decimal, or `No wins yet` when there are no wins (never `NaN`).
- **No backfill (Q6 A).** `hiato.history` starts empty; `hiato.daily` is not migrated.
- **Idempotence.** A Daily entry is written at most once per `dateKey` per slot, so re-opening "View today's result" does not double-count.
- **Storage.** `hiato.history` = `{ v: 1, slots: { 'lang|cefr': Entry[] } }`, 50 per slot, oldest evicted; invalid data parses to empty. History never changes streaks, freezes, the Pocket ladder or analytics.
- **Accessibility.** Text uses `ink` / `ink-muted` only, never `ink-faint` (#229). Bars are `ink` on a `line` track with visible counts and `role="img"` text. Short-landscape (ADR 0041): Pocket and Stats both fit in the Home aside at 844×390, checked by e2e.
