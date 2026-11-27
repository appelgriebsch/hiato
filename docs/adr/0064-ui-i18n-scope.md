# ADR 0064: UI i18n scope — interface copy only, Pack content stays in the Pack language (#302)

- **Status**: Proposed
- **Date**: 2026-11-27
- **Deciders**: Andreas Gerlach
- **Supersedes**: none (follows ADR 0030, sharpens the #100 seam)
- **Related issues**: #302

## Context

#302 localizes the app UI, but the app mixes three kinds of text: UI chrome (buttons, headings, aria-labels, status messages), Pack content (lemma, Gloss, Synonym chips, example sentences — always in the Pack language per ADR 0030), and share artifacts (the share-card canvas image and the share payload text, which travel with the deep link). The acceptance criteria scope #302 to UI strings.

## Decision

Localize all user-facing UI copy in `src/pages/**` and `src/components/**` — visible text, buttons, links, aria-labels, and status/alert messages — into the six locales of ADR 0062. Do not localize: Pack content (lemma, Gloss, Synonym chips stay in the Pack language, ADR 0030), the per-Pack-language labels already in `src/packs/labels.ts` (`NO_HINT_COPY`, `SPEAK_LEMMA_ARIA`, `POS_LABELS`), the provenance caption (stays in the Pack language per #100 — it describes the Pack's sources and licenses), the share-card canvas text and share payload text (they travel with the link), and the brand "Hiato" plus the PWA manifest name/description.

## Options Considered

| Option | Pros | Cons |
| --- | --- | --- |
| A — all UI copy, not Pack content or share artifacts (chosen) | Matches the AC exactly; pack pipelines and share-link semantics untouched | Share text stays English-shaped for non-EN packs |
| B — visible text only, aria-labels stay English | Smaller translation surface | Screen-reader users get English; fails the accessibility bar |
| C — also localize the share payload text | Recipients see localized text | The payload is content shared via a link; localizing it per UI locale changes what a cold open renders; out of scope |
| D — localize Pack content too | One language everywhere | Forbidden by ADR 0030; the puzzle teaches in the Pack language |

## Consequences

- `packs:check`, the pack pipelines, and the denylist gates are unaffected; UI i18n never touches `public/packs/`.
- Speech stays bound to the Pack language (ADR 0037), not the UI locale.
- The provenance caption keeps its per-Pack-language localization from #100, independent of the UI locale.
- Revisit share-artifact localization as its own ticket if cold-open recipients ask for it.
