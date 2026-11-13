# ADR 0051: Level check placement and data — dialog sheet on /language, advisory-only, no persistence, no streak writes

- **Status**: Accepted
- **Date**: 2026-11-13
- **Deciders**: Andreas Gerlach
- **Supersedes**: none
- **Related issues**: #227, #276, #277

## Context

The picker `/language` is a locked one-screen layout at 375px (#182) with a short-landscape two-column variant (#209) and e2e screenshots (`language-portrait.png`). Cookieless, production-only Cloudflare Web Analytics (ADR 0047) already counts page views per route, including `/language` — this satisfies the #227 dependency "privacy-first visit counts to see whether learners change level early". Streaks are per `lang|cefr` and only `recordDailyWin` on a daily win may write them (`src/lib/streaks.ts`); prefs are saved only by Continue → `setPrefs` (`src/lib/prefs.ts`).

## Decision

The check is a quiet secondary button ("Not sure of your level?") on `/language` that opens a house-pattern `<dialog>` sheet (the `PocketSheet` pattern: portal, focus trap and restore, Esc to close) — not a separate route and not an inline section. The sheet loads the chosen language's six level packs lazily on first open via `loadPack` (memory/localStorage cache-first) and has loading and error states; the picker stays usable throughout. "Use <level>" only preselects the CEFR tile (`setCefr`); Continue still saves prefs. The check writes nothing to localStorage, never imports streak code, and adds no analytics beacon, host, or event. "Whether learners change level early" is read from the existing `/language` page-view counts (ADR 0047).

## Options Considered

| Option | Pros | Cons |
| --- | --- | --- |
| Dialog sheet on /language (chosen) | Picker layout untouched; suggestion returns in the same frame as a preselected tile with the existing ✓ marker; house pattern already exists | No separate page-view count for check opens (not required by #227) |
| Separate `/level-check` route | Own page view in CF Web Analytics | Language and suggestion must pass via query/router state; an extra route for an optional check |
| Inline section on /language | Always visible | Breaks the locked one-screen 375px layout and the e2e snapshots |

## Consequences

- New `src/components/LevelCheckSheet.tsx`; small diff in `src/pages/Language.tsx`; guard tests assert the new modules never import `streaks` and write no storage (#277).
- The e2e `language-portrait.png` snapshot regenerates because of the new button; a new e2e flow covers open → answer → apply/ignore (#277).
- No CSP change (no new hosts), About "What we count" copy unchanged — no new data is counted.
