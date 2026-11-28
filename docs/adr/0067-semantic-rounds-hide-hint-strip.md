# ADR 0067: Semantic rounds hide the Hint strip until the round ends

- **Status**: Proposed
- **Date**: 2026-11-28
- **Deciders**: Andreas Gerlach
- **Supersedes**: none (ADR 0023 stays in force for Letters)
- **Related issues**: #306, #414
- **References**: ADR 0023 (in-round Hint strip, Letters); ADR 0018 (Practice excludes today's Daily); ADR 0036 (stable spoiler-safe share URLs); ADR 0043 (EndCard CTA hierarchy)

## Context

Letters shows a Hint strip under the puzzle word during the round: a short Gloss and/or Synonym chips in the Pack language (ADR 0023). The strip never prints the answer lemma. In Letters the learner builds the word from letters, so the strip supports the guess without making the letter work unnecessary.

Semantic mode (#306, EPIC #414) is a different game. The learner guesses by meaning, and the game ranks every guess by closeness in meaning to the answer. The Gloss is a definition of the answer. Synonym chips are words close in meaning to the answer. Both carry the same information that the ranked guess list is designed to reveal step by step. The #306 acceptance criteria say that no Gloss or answer is shown before the round ends (anti-spoiler rule, ADR 0018/0023 pattern).

The Gloss is still useful for learning. It is also used at build time as input text for the word vectors (S1 of EPIC #414), but the learner does not see it in that role.

## Decision

In a Semantic round (Daily, Practice and Pocket), the app does not render the Hint strip (Gloss and Synonym chips) until the round ends. The round ends on a win or on Give up / Reveal. The EndCard then shows the Gloss and the Synonym chips, as in Letters (ADR 0043). Letters keeps its Hint strip unchanged.

In-round help in Semantic comes from the rank list and from the "Show a closer word" action, which shows a single word row and no Gloss or chips. The Share card shows no Gloss and no answer (ADR 0036).

## Options Considered

| Option | Pros | Cons |
| --- | --- | --- |
| A: hide the whole Hint strip until the round ends (chosen) | Matches the #306 acceptance criteria; the ranked list stays the only source of closeness information; one rule for all Semantic round types; easy to test (no strip in the DOM before the end) | Less in-round support for learners who do not know a word; the Gloss teaches only after the round |
| B: show the Gloss only | Supports learners at a low level; keeps chips hidden | A definition narrows the answer strongly and reduces the value of the rank list |
| C: show Synonym chips only | Gives a vocabulary cue in the Pack language | Chips are words close in meaning to the answer and would act as direct guesses |
| D: same Hint strip as Letters | One shared component; same behaviour in both modes | Gives the same information as the rank list at the start of the round |

## Consequences

- The Semantic Play screen has no Hint strip. A test checks that no Gloss text and no Synonym chip are in the DOM before the round ends.
- The Semantic EndCard keeps the Gloss and the Synonym chips, so the learning content is shown after the round.
- Letters, ADR 0023 and the Pack schema (`gloss`, `synonyms`) do not change.
- Learners who need more support in a round use the "Show a closer word" action. Its rules (cost, pool, availability) are part of S4 of EPIC #414, not of this ADR.
- Revisit this decision if staging feedback shows that learners stop playing because they lack support in the round. The staging pilot gives no Production counts (ADR 0047), so the evidence would come from direct feedback.
