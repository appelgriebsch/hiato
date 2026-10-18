# ADR 0041: Playwright checks for short-landscape layout

- Status: Accepted
- Date: 2026-10-18
- Deciders: Andreas Gerlach

## Context
ADR 0014 keeps unit tests on `bun:test`. Issue #209 also needs the five landscape viewports (and portrait) checked in a real browser: scroll, 44px targets, and the footer not covering the level grid. Static markup cannot see that.

## Decision
Add `@playwright/test` as a devDependency. `e2e/landscape.spec.ts` runs against `vite preview` (built `dist/`). CI installs Chromium and runs `bunx playwright test` after `bun run build` and `bun test`. Unit tests stay on `bun:test`.

## Consequences
- No Vitest. Playwright is e2e only.
- The job needs Chromium system libraries (`playwright install --with-deps`).
- Portrait screenshots are Playwright snapshots of this Linux browser, not the prod phone captures.
- The spec sets `prefers-reduced-motion: reduce` before navigation. Playwright's screenshot helper freezes CSS animations at the current frame, and the entrance classes use `animation-fill-mode: both`, so a mid-fade shot would fail the portrait baseline. The app already settles those classes under reduced motion.
