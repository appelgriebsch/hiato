# ADR 0066: Gloss/example scans — patterns denied, exact violence words stay allowed (#374)

- **Status**: Proposed
- **Date**: 2026-11-27
- **Deciders**: Andreas Gerlach
- **Supersedes**: none (clarifies ADR 0059 §2 and the AGENTS.md pack content policy wording)
- **Related issues**: #374

## Context

AGENTS.md states that violent words are not valid pack items "not inside glosses … or example sentences". In code, `isDeniedGlossToken` (gloss and example tokens) counts exact hits only for the `profanity` and `slur` categories (`GLOSS_CATEGORIES`), while `isDeniedTextToken` (synonym chips, family members) counts every exact category. The violence category has 207 **global** exact entries that include pack-language translations (BLUT, TOD, SANGRE, MUERTE, ARMA, MORTE, SANGUE, VIOLENTA…). A scan of the 36 shipped packs (2026-11-27) shows 1,859 gloss/example tokens match those entries — e.g. the IT gloss of VAMPIRE legitimately says "sangue". Adding `violence` to `GLOSS_CATEGORIES` would fail all of them.

## Decision

Keep the gloss/example scan categories as they are: exact hits count for profanity and slur only (with `lemma-denylist-gloss-exempt.txt` homographs lifted); **pattern hits count for every category** — so the new violence stem patterns of ADR 0065 are automatically denied inside gloss and example tokens (e.g. a gloss containing a TÖTUNGS-compound), while a single pack-language concept word (sangue, Blut) stays allowed in a gloss, because glosses are pack-language definitions. Chips and family members keep counting every exact category via `isDeniedTextToken`. AGENTS.md's policy wording is clarified to match: violence is banned as a lemma, chip, family member, and as a pattern-matched compound inside any text field; a single violence concept word inside a gloss is allowed by design.

## Options Considered

| Option | Pros | Cons |
| --- | --- | --- |
| A — patterns denied in glosses, exacts stay allowed (chosen) | Matches the shipped reality (0 false failures); compounds in glosses still caught once ADR 0065 patterns exist; AGENTS.md clarified | A gloss can name the concept in a single word ("sangue") — accepted: it is the definition, not violent content |
| B — add violence to GLOSS_CATEGORIES | Literal reading of the policy sentence | 1,859 shipped tokens fail; would need mass exemption/rewrite of legitimate glosses |
| C — leave scans and wording untouched | Smallest diff | Written policy and enforcement disagree; the #374 gap in text fields stays undocumented |

## Consequences

- No pack content changes from this ADR; `packs:check` behavior for glosses/examples is unchanged except for the new ADR 0065 patterns, which are denied there automatically.
- AGENTS.md wording is amended in the same PR so policy text and enforcement agree.
- Revisit if a gloss ships an actual violent phrase — the pattern scan plus review catches compounds; single concept words in definitions remain allowed by design.
