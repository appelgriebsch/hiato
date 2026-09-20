# ADR 0025: Lives metaphor — seeds (not hearts)

- Status: Accepted
- Date: 2026-09-20
- Deciders: Andreas Gerlach

## Context
G0/T6 used heart icons for remaining lives. Andreas asked for a different metaphor aligned with learning.

## Decision
Represent lives as **seeds** (remaining = intact seed; depleted = empty/wilted/spent seed). Six lives unchanged (ADR 0016).

## Consequences
- UX Uma T6 polish + Impl Ivy production UI use seed icons.
- PWA/logo work is separate (logo mark + install icons).
- Copy/ARIA: prefer accessible name “lives remaining” with seed visuals.
