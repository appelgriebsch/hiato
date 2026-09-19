# ADR 0006: Word pack loading — selected language precache

- Status: Accepted
- Date: 2026-09-19
- Deciders: Andreas Gerlach

## Context
Four languages × CEFR levels can bloat the install if all are precached.

## Decision
Precache packs for the user’s selected language. Other languages download on demand when selected. Packs live as versioned JSON under `public/packs/{lang}/{cefr}.json`.

## Consequences
- Smaller first install; offline for non-selected languages requires a prior online switch.
- Service worker must cache fetched packs; updates via vite-plugin-pwa prompt (not silent autoUpdate).
