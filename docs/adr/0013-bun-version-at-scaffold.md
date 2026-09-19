# ADR 0013: BUN_VERSION — pin at scaffold

- Status: Accepted
- Date: 2026-09-19
- Deciders: Andreas Gerlach

## Context
Cloudflare Pages requires an exact `BUN_VERSION` env var when using Bun with `SKIP_DEPENDENCY_INSTALL=true`.

## Decision
Pin `BUN_VERSION` to the exact `bun --version` from the first scaffold/build machine; document in ADR 0002 appendix and repo README.

## Consequences
- No version chosen in chat; must be set before first Pages deploy.
- Preview and Production both get the same pin.
