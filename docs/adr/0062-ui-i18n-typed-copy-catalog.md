# ADR 0062: UI i18n — typed copy catalog, no i18n library (#302)

- **Status**: Proposed
- **Date**: 2026-11-27
- **Deciders**: Andreas Gerlach
- **Supersedes**: none (extends the #100 seam in `src/packs/labels.ts` / `src/packs/provenance.ts`)
- **Related issues**: #302. Seam from #100.

## Context

#302 asks for the full app UI in en/pt/de/es/fr/it. The acceptance criteria require i18n resources for all six locales and that no untranslated key falls through silently; `copy.test.ts` must cover every locale. The repo already localizes short fragments with plain `Record<PackLang, string>` tables plus an EN-fallback accessor (#100: `NO_HINT_COPY`, `SPEAK_LEMMA_ARIA`, `POS_LABELS`, provenance fragments). No i18n library is installed; the stack is Vite + TypeScript + React 19 + Bun, an offline-first PWA where bundle bytes matter.

## Decision

Hand-rolled typed catalog, extending the #100 pattern. `UILocale` reuses the six pack-language codes (`en/pt/de/es/fr/it`). One module `src/i18n/` holds one file per locale, each `satisfies Record<UiKey, string>`, so TypeScript fails the build when any locale misses a key. Lookup is a `t(locale, key, params?)` accessor with `{name}` placeholder interpolation; components bind it through a `useT()` hook. No new dependency.

## Options Considered

| Option | Pros | Cons |
| --- | --- | --- |
| A — typed hand-rolled catalog (chosen) | Compile-time key completeness per locale (the AC's "no silent fallthrough"); zero new dependencies; matches the existing #100 pattern; a few KB of static strings bundled whole | No ICU plurals; interpolation is a tiny hand-rolled `{name}` replace |
| B — i18next + react-i18next | Industry standard, ICU plurals, runtime fallback | Two new dependencies and bundle weight on an offline-first PWA; key checking is runtime-only, so a missing translation falls through unless extra config/tests are added |
| C — per-page copy files | Copy sits next to its component | Catalog is scattered; the per-locale parity test needs one catalog |

## Consequences

- `tsc -b` fails on a missing or extra key in any locale file; `copy.test.ts` additionally asserts per-locale parity, non-empty values, and identical interpolation placeholders across locales.
- Interpolation values are rendered as React text, never assigned to an HTML sink.
- The six catalogs ship in the main bundle (small, static, offline-safe); no lazy loading.
- Revisit if UI copy grows plural rules or rich text that `{name}` interpolation cannot express — that is when a real i18n library earns its dependency.
