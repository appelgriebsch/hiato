# ADR 0007: Achievement sharing — Web Share + card

- Status: Accepted
- Date: 2026-09-19
- Deciders: Andreas Gerlach

## Context
Share with friends without accounts. Stable URLs need Workers/D1.

## Decision
v1: Web Share API + generated share card (image and/or clipboard text). No accounts. No stable share URLs. No leaderboards.

## Consequences
- Share cards are forgeable; accept for v1.
- iOS/Android share quirks; provide clipboard/download fallback.
- Thin `src/api/` and Workers skeleton reserved for a later URL/leaderboard phase (see ADR 0011).
