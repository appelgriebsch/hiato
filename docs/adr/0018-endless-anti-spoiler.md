# ADR 0018: Endless mode — exclude today's daily

- Status: Accepted
- Date: 2026-09-19
- Deciders: Andreas Gerlach

## Context
Playing endless before/after daily could spoil the daily word.

## Decision
Endless practice never selects today's daily word for the active language+CEFR.

## Consequences
- Daily seed computation shared; endless filter excludes that lemma for local date.
