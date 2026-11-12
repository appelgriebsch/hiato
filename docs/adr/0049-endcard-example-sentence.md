# ADR 0049: EndCard example sentence — `example?` pack field, render after finish only, pilot scope

- **Status**: Accepted
- **Date**: 2026-11-11
- **Deciders**: Andreas Gerlach
- **Supersedes**: none
- **Related issues**: #225, #246, #247, #248

## Context

The EndCard (`src/pages/Play.tsx`) teaches the lemma after a round via `LemmaTeach` (gloss, synonym chips, tap-to-speak per ADR 0037). Issue #225: show one sentence using the word, in the pack language, after finish — never before the round ends. Pack lemmas carry `word`, `gloss?`, `synonyms?` (`src/packs/schema.ts`). The pack JSON is client-side; the anti-spoiler rule is about the UI, so the guarantee must be structural: the example is only ever read into the EndCard, which `Play.tsx` renders only when `finished` is set.

## Decision

1. **Schema.** `PackLemma` gains optional `example?: string` — one sentence, in `pack.lang` (ADR 0030), must contain the lemma as a whole Unicode word (opposite of the gloss spoiler rule, ADR 0023), length-capped. `validatePack` (`scripts/packs-check-lib.ts`) enforces presence-of-lemma, language, and length; the level gate lives in the pipeline (ADR 0048).
2. **Render.** The EndCard passes `example` into the teach block and renders exactly one sentence in the pack language. `<EndCard>` mounts only when `finished` is truthy (`Play.tsx`), so a sentence can never appear before the round ends. In-round UI (`LearnerHint`, `LetterGrid`, keyboard) never receives `example`. `DailyRecord` carries `example` so the already-played replay shows it too.
3. **Scope.** Pilot: EN + DE A1–B1 packs get examples first (#247), then the 24 A1–B2 packs (#248). C1/C2 packs ship no `example` on purpose; the EndCard shows no sentence for them (point 2).

## Amendment (2026-11-12, Andreas)

Point 3 is narrowed from "all 36 packs" to the 24 A1–B2 packs. The 12 C1/C2 packs have no example sentences on purpose. This matches the shipped data at `248b588` and the amended #248.

## Options Considered

| Option | Pros | Cons |
| --- | --- | --- |
| Optional `example?` on the lemma (chosen) | Zero cost for lemmas without a sentence; matches `gloss?`/`synonyms?` pattern | Pack schema change, the thing ADR 0043 avoided — accepted now that the feature is real |
| Separate per-pack sentence file | Keeps lemma JSON small | Second fetch/cache path for a 1:1 field; more moving parts |
| Deep link to external dictionary | No data | Not offline, not free, leaves the app — against the issue's value |

## Consequences

- `Play.tsx` EndCard and `LemmaTeach` (or the teach card) render the sentence; `daily-record.ts` stores it; `packs:check` validates it.
- Unit tests: schema validation, EndCard shows the sentence after finish and never in-round. e2e in #248.
- Share card is unaffected (it already shows the word post-finish).
