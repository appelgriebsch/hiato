# Hiato — final solution overview

Date: 2026-09-19
Status: Plan locked (handoff gate pending Andreas)

## STE-100 summary

Hiato is a mobile web app for language learners.
The app installs as a PWA and works offline after the selected language packs load.
The player selects a language (English, Portuguese, German, or Spanish) and a CEFR level (A1, A2, or B1).
The app shows a word with gaps.
The player fills letters.
The player has 6 lives.
Accent letters are separate keys.
After two misses on an accent cell, the player may tap a hint button to reveal that accent.
The main mode is a daily challenge that resets at local midnight.
The app tracks streaks.
Endless practice is available and does not use today's daily word.
The player can share a result card with friends (Web Share or clipboard).
There are no accounts and no leaderboards in v1.
Word packs include license text.
Portuguese packs may use CC-BY-SA sources with attribution.
The stack is Vite, TypeScript, React, Zustand, shadcn/ui, Tailwind, and Bun.
Tests use bun:test.
Hosting is Cloudflare Pages with a small Workers API stub.
Branch previews are staging.
A merge to main is production.
UX Uma builds a clickable prototype before coding starts.
Impl Ivy implements after Andreas accepts the prototype and chooses handoff.

## Architecture

See mermaid in chat delivery.

## Tracer tickets

- **G0** — UX Uma: clickable mobile prototype (onboarding → lang/CEFR → daily play → result → share mock). Acceptance per ADR 0019.
- **T1** — Scaffold `hiato` private repo: Vite/React/shadcn/PWA prompt updates, Bun pin + CF Pages Bun build vars, Workers/Pages Functions health + `src/api/` seam, `_headers` for sw/manifest, empty shell installable. Smoke: SW headers, health 200, named rollback note.
- **T2** — Pack schema + EN A1 pack committed + `packs:check` + pure `src/engine/` + custom board/pad + **daily** EN A1 round playable offline.
- **T3** — Lang/CEFR (A1–B1) select, selected-lang SW precache/purge, DE/ES/PT packs v0, About/licenses (incl. CC-BY-SA).
- **T4** — Streaks, endless (anti-spoiler), 6 lives, diacritic hint button semantics.
- **T5** — Results + Web Share/clipboard share card with self-hosted OFL fonts.
- **T6** — Uma polish pass (motion, onboarding feel) only.
- **H1** — Deploy Drew: prod harden (headers, preview≠prod Worker bindings, Bun pin verified, rollback).

## Rejected approaches

- Full auth/leaderboards/stable share URLs in v1
- Next/Remix SSR, Capacitor native
- Precache all languages at install
- Silent service-worker autoUpdate
- Bun lockfile autodetection without explicit Pages config
