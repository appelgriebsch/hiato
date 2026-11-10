# ADR 0018: Practice — exclude today's daily

- Status: Accepted
- Date: 2026-09-19
- Deciders: Andreas Gerlach

## Context
Playing Practice before or after the daily could spoil the daily word.

## Decision
Practice never selects today's daily word for the active language+CEFR.

## Consequences
- Daily seed computation shared; the Practice filter excludes that lemma for local date.
