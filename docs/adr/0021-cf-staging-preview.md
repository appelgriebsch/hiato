# ADR 0021: Cloudflare staging — preview deployments

- Status: Accepted
- Date: 2026-09-19
- Deciders: Andreas Gerlach

## Context
Need staging without heavy dual-project ops.

## Decision
One Cloudflare Pages project. Branch preview deployments act as staging. Worker/Pages Functions preview bindings must not equal production bindings.

## Consequences
- No separate `hiato-staging` project in v1.
- Staging is done on branches (Andreas clarification).
