# ADR 0007: Achievement sharing — Web Share + card

- Status: Accepted (partially superseded: "No stable share URLs" → ADR 0036, 2026-10-02)
- Date: 2026-09-19
- Deciders: Andreas Gerlach

## Context
Share with friends without accounts. Stable URLs need Workers/D1.

## Decision
v1: Web Share API + generated share card (image and/or clipboard text). No accounts. No stable share URLs (see ADR 0036). No leaderboards.

## Consequences
- Share cards are forgeable; accept for v1.
- iOS/Android share quirks; provide clipboard/download fallback.
- Thin `src/api/` and Workers skeleton reserved for a later URL/leaderboard phase (see ADR 0011).
- Stable share URLs: see ADR 0036 (supersedes the "No stable share URLs" clause above).
