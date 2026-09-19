# ADR 0013: BUN_VERSION — pin at scaffold

- Status: Accepted
- Date: 2026-09-19
- Deciders: Andreas Gerlach

## Context
Cloudflare Pages requires an exact `BUN_VERSION` env var when using Bun with `SKIP_DEPENDENCY_INSTALL=true`.

## Decision
Pin `BUN_VERSION=1.4.2` from the T1 scaffold machine (`bun --version`); document in ADR 0002 appendix and repo README. Same pin on Production and Preview.

## Consequences
- Preview and Production both use `BUN_VERSION=1.4.2`.
- Bump via ADR update + `packageManager` / `.tool-versions` when intentionally upgrading Bun.
