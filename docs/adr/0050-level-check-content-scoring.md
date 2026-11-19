# ADR 0050: Level check content and scoring — one pack word per CEFR level, seeded per day, highest-known suggestion

- **Status**: Accepted
- **Date**: 2026-11-13
- **Deciders**: Andreas Gerlach
- **Supersedes**: none
- **Related issues**: #227, #276, #277

## Context

Issue #227: new learners guess their CEFR level on Choose language & level; a wrong pick makes the first Daily too easy or too hard on day one. The check must be short and optional, suggest a level, and never touch the streak. Word packs already ship per language × CEFR level with lemmas (`word`, `gloss?`, `synonyms?`, `example?` in `src/packs/schema.ts`) and are cached client-side (ADR 0006); `pickDailyLemma` already picks one seeded lemma per `lang|cefr|dateKey` (`src/engine/daily.ts`). The app UI copy is English-only; pack content is in the target language.

## Decision

The level check shows one word from each level pack (A1–C2) of the chosen language, picked with the existing seeded `pickDailyLemma` so the check is stable per local day. The learner answers "know / don't know" per word. The word is shown alone — never its gloss, which would make the answer trivially yes. Six questions total. `suggestLevel` returns the highest level whose word was marked known (none known → A1, all known → C2). The suggestion is advisory only; the learner can always ignore it.

## Options Considered

| Option | Pros | Cons |
| --- | --- | --- |
| One pack word per level, seeded (chosen) | Zero new content, no new licensing; works for all 6 languages; offline via cached packs; reuses the seeded Daily pick | One word per level is noisy; self-reported "know" skews high — accepted because the suggestion is advisory and ignorable |
| CEFR can-do statements in English | Canonical framework wording; one text for all languages | New content to author and maintain; still self-reported |
| Can-do statements translated into each target language | Statements in the language being learned | New content ×6 plus licensing review; heaviest option |
| Mini placement round (play one round at a level) | Performance-based signal | Conflates gameplay with assessment; longer; risks confusion with the streak |
| Link to an external placement test | Certified accuracy | Leaves the app, not offline, privacy cost — against ADR 0047 spirit |

## Consequences

- New pure module `src/lib/level-check.ts`: `suggestLevel(known)` and `checkItems(packs, dateKey, lang)`, unit-tested (none → A1, gaps, all → C2, seeding stable per date key) in `src/lib/level-check.test.ts`.
- No pack schema change, no new content, no `packs:check` impact; every shipped level pack is non-empty, so sampling works at A1 through C2.
- Risk accepted: the suggestion is accurate to about ±1 level. The learner can always ignore it, which is an acceptance criterion of #227.

## Amendment 2026-11-19: level-check seed separate from the Daily

- **Status**: Accepted
- **Context**: Staging aed0b04 (Tessa, M1). `checkItems` reused `pickDailyLemma` with the Daily seed, so every level-check word was that day's Daily answer for its level — a spoiler.
- **Decision**: The level check picks with its own seed, `dailySeedKey(dateKey, lang, cefr) + '|level-check'`. If that index equals the Daily index and the pack has more than one lemma, it takes the next lemma. The pick stays stable per local day. `pickDailyLemma` and the Daily are unchanged.
- **Rejected**: salt only (a 1-in-n chance per level of still showing the Daily); excluding the Daily lemma by filtering and then re-seeding (same result, more code).
- **Consequences**: A level-check word never equals today's Daily for its level. Unit test pins this for all 6 languages × 6 levels.
