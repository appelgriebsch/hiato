# ADR 0015: Soft diacritic hint — player-triggered button

- Status: Accepted
- Date: 2026-09-19
- Deciders: Andreas Gerlach

## Context
After misses on diacritic cells, learners need a soft assist without auto-spoiling.

## Decision
After two counted misses while an unrevealed diacritic remains, enable a hint button. The player chooses to spend it; it reveals that one diacritic grapheme.

While an unrevealed diacritic remains, the miss counter counts (a) an ASCII-base match of a hidden diacritic (N vs Ñ, E vs É) or (b) any diacritic-grapheme miss (Á/Ó while Ñ remains). Do not count unrelated plain ASCII (X, Z). Exact hits are not misses.

## Consequences
- Not auto-reveal; not random other diacritics.
- Hint availability and spend must be clear in UI (Uma G0).
- The counter is accent/base misses, not any miss: unrelated ASCII does not unlock the hint.
- ES A1 staging (8100ff7): counting only (a) left the hint dark after two accent-key misses when the remaining diacritic did not share that base (Ñ vs Á/Ó); (b) covers that pad.
