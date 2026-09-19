# ADR 0002: Package manager — Bun

- Status: Accepted
- Date: 2026-09-19
- Deciders: Andreas Gerlach

## Context
Cloudflare Pages will host the app. Specialist advice preferred pnpm/npm because Bun lockfile autodetection on CF Pages can be unreliable.

## Decision
Use Bun explicitly as package manager and runtime for local/CI scripts.

## Consequences
- Faster local DX; must configure Cloudflare Pages build image/commands for Bun explicitly (no reliance on autodetection).
- Pin Bun version in repo (`packageManager` and/or `.tool-versions`).
- Risk: CI/Pages misconfig → broken deploys; mitigate via Deploy Drew review at handoff.

## Appendix — Cloudflare Pages Bun pin (from Bun Bobby / Ask Avery)

Build command:
`bun install --frozen-lockfile && bun run build`

Build output directory: `dist`

Environment variables (Production **and** Preview):
- `BUN_VERSION=<exact output of bun --version>`
- `SKIP_DEPENDENCY_INSTALL=true`

Lockfile policy:
- Commit text `bun.lock` only
- Do not commit `package-lock.json` or `pnpm-lock.yaml`
- Never rely on Cloudflare bun.lock autodetection

Exact `BUN_VERSION` string still pending Andreas (or first scaffold machine).

