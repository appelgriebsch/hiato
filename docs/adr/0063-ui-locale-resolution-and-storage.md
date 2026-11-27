# ADR 0063: UI locale resolution and storage — never touches Pack prefs (#302)

- **Status**: Proposed
- **Date**: 2026-11-27
- **Deciders**: Andreas Gerlach
- **Supersedes**: none
- **Related issues**: #302

## Context

The UI language must be selectable in About or follow the device locale (acceptance criterion of #302), and it must never change the Pack language or the CEFR level. Pack prefs live in `localStorage['hiato.prefs']` (`{ lang, cefr }`, `src/lib/prefs.ts`); the sound setting shows the repo pattern for a separate versioned key with a subscribe helper (`src/lib/sound.ts`).

## Decision

The UI locale is a separate, versioned key `hiato.ui-locale` = `{ v: 1, locale: UILocale | null }`, where `null` means "System". Resolution order: stored override → first `navigator.languages` entry whose language prefix matches one of the six supported codes (`pt-BR` → `pt`) → `en` when nothing matches. One module, `src/lib/ui-locale.ts`, owns the state (`getUiLocale` / `setUiLocale` / `subscribeUiLocale`, same shape as `sound.ts`), and a `useUiLocale()` hook reads it via `useSyncExternalStore` so storage events sync other tabs. About gets an "Interface language" picker with a "System" entry plus the six languages in native names (`LANG_LABELS`). An effect syncs `document.documentElement.lang` to the resolved UI locale.

## Options Considered

| Option | Pros | Cons |
| --- | --- | --- |
| A — device default + About picker with System reset (chosen) | Meets both arms of the AC; learner can undo a manual choice | Slightly more UI than a bare picker |
| B — About picker only, English default | One explicit control | Ignores the device locale the AC allows |
| C — device locale only, no picker | Smallest code | No way to override the device locale |
| D — store the UI locale inside `hiato.prefs` | One key | Couples UI language to Pack language/CEFR; violates the AC's "never changes the Pack language or CEFR level" |

## Consequences

- `hiato.prefs` is never read or written by the UI-locale path; a test asserts `setUiLocale` leaves `hiato.prefs` unchanged.
- Existing users with no stored key resolve from their device locale, so the interface may appear localized on first load — that is the feature; English stays the fallback.
- e2e specs keep passing because the default test browser locale resolves to `en`; one new spec covers the About switch.
- Storage reads are validated at the boundary (`{ v: 1, … }` plus a known locale), so a corrupt key falls back to System.
