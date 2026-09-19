# ADR 0022: Production promote — merge to main

- Status: Accepted
- Date: 2026-09-19
- Deciders: Andreas Gerlach

## Context
Need a clear promote policy aligned with branch previews as staging.

## Decision
Merge to `main` deploys production. Feature/staging work happens on branches via preview deployments.

## Consequences
- Protect `main`; PR required recommended.
- Manual dashboard promote not primary path.
