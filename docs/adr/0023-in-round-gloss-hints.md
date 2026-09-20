# ADR 0023: In-round learner hints under the puzzle

- Status: Accepted (amended)
- Date: 2026-09-19
- Deciders: Andreas Gerlach

## Context
G0 play screen needed learning support during the round. Andreas requested small hints below the word while guessing — synonyms and/or a short dictionary explanation. On review he required those hints to be in the **same language** as the puzzle word (so learners see L2 alternatives), not English-only glosses.

## Decision
On the word-guessing (play) screen, show a compact hint area under the gap word: short gloss and/or synonym chips **in the selected target language** (EN→EN, DE→DE, ES→ES, PT→PT). Hints must not print the answer lemma itself. Pack schema: optional `gloss` / `synonyms` in the pack language. Shipped `gloss` must be in `pack.lang` (ADR 0030). Graceful empty state if missing.

## Consequences
- UX Uma revises G0: same-language mock copy; diacritic hint (ADR 0015) must be functional in the prototype.
- Impl Ivy / pack pipeline populate same-language gloss/synonyms.
- Spoiler risk: gloss/synonyms must not contain the answer string.
- Distinct from the diacritic hint button (ADR 0015).
- Pack JSON gloss language is a hard invariant (ADR 0030), not only a play-screen preference.
