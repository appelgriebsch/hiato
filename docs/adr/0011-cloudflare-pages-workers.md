# ADR 0011: Hosting — Cloudflare Pages + Workers skeleton

- Status: Accepted
- Date: 2026-09-19
- Deciders: Andreas Gerlach

## Context
Likely Cloudflare hosting. Share URLs/leaderboards may come later; Andreas wants Workers from the start.

## Decision
Deploy static PWA on Cloudflare Pages. Include a minimal Workers (or Pages Functions) skeleton and a thin `src/api/` client seam from day one, even if v1 share path stays client-only.

## Consequences
- Slightly more repo/CI surface than Pages-only.
- Enables later stable share URLs without a rewrite.
- `_headers`: no-cache for `sw.js` and web manifest; immutable hashed assets.
- Bun build must be explicitly configured on Pages.
