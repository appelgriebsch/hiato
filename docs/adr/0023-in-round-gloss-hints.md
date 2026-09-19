# ADR 0023: In-round learner hints under the puzzle

- Status: Accepted
- Date: 2026-09-19
- Deciders: Andreas Gerlach

## Context
G0 play screen showed gaps without enough learning support during the round. Post-reveal gloss alone is late for pedagogy. Andreas requested small hints below the word while guessing — synonyms (thesaurus-style) and/or a short dictionary explanation.

## Decision
On the word-guessing (play) screen, show a compact hint area under the gap word: short gloss and/or synonym chips. Hints must not print the answer lemma itself. Prefer gentle, level-appropriate wording. Pack schema should carry optional `gloss` / `synonyms` fields for v1 (EN gloss OK for all target langs unless later ADR says otherwise).

## Consequences
- UX Uma revises G0 play screen before re-accept.
- Impl Ivy / pack pipeline must populate gloss/synonyms (or graceful empty state).
- Spoiler risk: gloss must not contain the answer string; engine/UI should strip/forbid that.
- Distinct from the diacritic hint button (ADR 0015).
