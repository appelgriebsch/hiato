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

## Addendum (2026-10-18): clock, key width, tiles

The daily word is `hash(local date | lang | cefr)`. Portrait snapshots include that word, so `e2e/landscape.spec.ts` pins `page.clock` to 2026-10-18 (EN A1 is ART) and `dailyWord()` uses the same timestamp. Short-land no-scroll is also checked on 2026-11-13 (long EN word) and 2026-10-20 (long PT word). Play overflow at 1024×600 and at portrait 375×667 is asserted only on the short-word date. Those sizes already overflow on main when the daily word is long; #209 requires no scrolling in short landscape only.

Letter keys are shorter than the 44px target in width. The height floor is 48px. The e2e asserts height ≥48 and width ≥24 on `[data-letter-pad] button`.

Measured widths, height 48, Chromium, safe-area insets 0:

| Viewport | EN width | PT width |
|---|---|---|
| 667×375 | 32.9 | 29.4–29.9 |
| 740×360 | 37 | 33.1–33.6 |
| 844×390 | 42.8 | 38.3–38.9 |
| 915×412 | 45.7 | 41–41.5 |

Uma accepts about 29px on the SE and about 35px on notched iPhones. 26.3px is a synthetic combination — 667×375 with simulated 47/47/21 notch insets — and does not match a real device. The same simulation gives EN keys 29.5px. One e2e case applies those insets through `Emulation.setSafeAreaInsetsOverride` and still requires the 24px floor. Real `env(safe-area-inset-*)` stays 0 in this Chromium unless that override is set.

Tiles are display-only. The tile text is not shrunk. One row capped at 44px is 30–41px for words of up to 8 letters, and 23.5–26.8px for words of 9–10 letters.

