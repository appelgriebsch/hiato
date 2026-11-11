# ADR 0048: EndCard example sentences — optional `example?` on `PackLemma`

- **Status**: Accepted
- **Date**: 2026-11-11
- **Deciders**: Andreas Gerlach
- **Supersedes**: the example-sentence deferral in ADR 0043
- **Related issues**: #225

## Context

ADR 0043 shipped the EndCard "Practice this word" CTA and deferred example sentences as "an open pack-level idea, to be decided separately with licensing": a pack schema change plus per-pack license review. #225 asks for exactly that: one sentence using the word, in the pack language, shown on the EndCard after the round finishes, with the sentence source credited on About with its license. External sentence corpora (Tatoeba et al.) have unverified license compatibility for redistribution, so no external sentence source is used.

## Decision

Add an optional `example?: string` to `PackLemma` (`src/packs/schema.ts`). The EndCard renders it, in the pack language, only after the round ends; it never appears in-round. The sentence source is **original Hiato learner copy**, generated from fixed per-language templates by `scripts/add-examples.ts` and shipped in the packs under the app's MIT license (LICENSE / NOTICE) — the same treatment glosses and synonym chips already have. About credits this explicitly.

- **Data**: every lemma in all 36 packs carries one example sentence (14,400 total). Each pack `version` is bumped and `scripts/data/pack-pin.json` rewritten, so cached packs refresh (ADR 0006). Each pack's `attribution` gains a line stating the sentences are original Hiato copy, MIT.
- **Validation** (`scripts/packs-check-lib.ts` `validatePack`): when present, `example` must be a non-empty string, must contain the lemma as a whole word (`spoilerContains`), and must be in the pack language (`isWrongLanguageGloss`, heuristic-only — no Hunspell membership, so new sentences never miss the committed verdict cache in CI). The ADR 0023 spoiler rule deliberately does **not** apply to `example`: it is post-round by construction, and it must *use* the word. Hint-ceiling, denylist, and boilerplate gates read only gloss/synonyms and are unchanged.
- **Rendering** (`src/pages/Play.tsx`): `EndCard` takes `example?: string` and renders it inside the teach card as `data-endcard-example`. `EndCard` mounts only when `finished` is set, so a sentence can never appear before the round ends. The daily record (`src/lib/daily-record.ts`) and pocket entries (`src/lib/pocket.ts`) carry `example` through, so a replayed daily or a pocket round shows the same sentence. `LearnerHint` (in-round) is untouched and never sees the example.
- **Credit**: the About Licenses paragraph now states that gloss, synonym, and example-sentence copy is original to Hiato, in the pack language, MIT-licensed with the app, and that examples appear only post-round.

## Options Considered

| Option | Pros | Cons |
| --- | --- | --- |
| Original Hiato sentences in the packs (chosen) | License-clean (MIT, already the app grant); pack-language by construction; level-simple templates for A1–B1; credited on About | Sentences are templated, not curated prose |
| External sentence corpus (e.g. Tatoeba) | Natural sentences | License compatibility for redistribution unverified (#225 dependency); per-pack review; attribution churn |
| No pack change; sentence assembled at runtime | Zero pack surface | No real sentence source exists client-side; still needs licensing for any corpus |

## Consequences

- `PackLemma` grows `example?`; `DailyRecord` and `PocketEntry` carry it optionally, so old stored records parse unchanged.
- packs:check enforces the example rules above; CI stays green because no new Hunspell verdicts are needed.
- Share cards and in-round UI are unchanged; the example is EndCard-only.
