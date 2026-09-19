# ADR 0004: Daily challenge timezone — device local

- Status: Accepted
- Date: 2026-09-19
- Deciders: Andreas Gerlach

## Context
Daily challenges need a day boundary. Cross-zone “same puzzle” is not required for v1.

## Decision
Use device-local midnight for the daily boundary.

## Consequences
- Simple offline behavior; no server clock.
- Friends in different zones may get different dailies.
- Travel can shift the day boundary; accept for v1.
