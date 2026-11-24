# ADR 0061: Shared pack QA (#366) — slur denylist, name-list gate, chip gate, EU Portuguese

- **Status**: Proposed
- **Date**: 2026-11-24
- **Deciders**: Andreas Gerlach
- **Supersedes**: none (sharpens ADR 0023, ADR 0028, ADR 0040, ADR 0058, ADR 0060)
- **Related issues**: #366. Does not close #335, #357, #358, #359, #360, or #361.

## Context

Ask Avery's recheck at `8c94bdc` still found slurs and vulgar insults in grown slots, person-name lemmas whose glosses were invented common nouns (so the old "name list AND person-name gloss" rule let them ship), synonym chips that repeat the lemma under a different spelling (`LAß`/`LASS`, `GRÜSSE`/`Grüße`) or that are not words (`3º`, `CO2`), and a set of European-Portuguese findings (places, pre-AO1990 spelling, accentless misspellings, a few wrong glosses and chips). Slots 0–399 cannot move (ADR 0058). Production stays at `8c94bdc`; this change does not deploy.

## Decision

1. **Slur and vulgar-insult denylist.** Ten language-scoped lines were added to `lemma-denylist.txt` (`en GOOK`, `pt BOCHES`, `fr POUFFIASSE`, `it INVERTITO`, `it BATTONA`, `de FLITTCHEN`, `de FETTSACK`, `es FOLLADOR`, `es LAMECULOS`, `de DRECKSACK`). Matching is `spellingKey`, so case and German `ß`/`SS` fold. `validatePack` already rejects a denylisted lemma; the new lines plus a regression test are the CI guard. Each hit is replaced in its own slot. The curated profanity list LDNOOBW is not imported: it would not stay small and reviewable, and the existing paradigm patterns already cover the families Hiato bans.

2. **Name list, every language.** `okLemma` / gloss rejection / FR-IT `accept` no longer skip `fr` and `it`. A lemma on `lemma-names.txt` fails `packs:check` with `person-name list` whatever the gloss says. Homographs that are real common words stay only with a reasoned line in `lemma-names-allow.txt` (`lang WORD # reason`). The allowlist holds (a) every name-list lemma already in slots 0–399, because those slots cannot change, and (b) grown name-list lemmas that are not proper-name headwords. A proper-name headword is a dictionary entry whose matching lines are all capitalized (pt-PT: `CAT=np` and no citation line). German is never treated as proper-name-by-capital, because `dictionary-de` capitalizes nouns. Absent-from-dictionary name-list stems (for example some FR/IT common nouns hunspell accepts only by affix) stay, with that reason on the allowlist. New lemmas are never name-listed and never proper-name headwords. Places, people, brands, and abbreviations called out for PT are appended to `lemma-names.txt`, except `BRA`, `PENCE`, and `LAS`, which are ordinary words in other pack languages and are replaced in the PT pack only. Adding `GPS` and `DVD` also replaces the grown ES slots of those abbreviations, because they are capitalized-only headwords.

3. **Chips.** `CHIP_LANG_GATE_LANGS` is every pack language that has a Hunspell dictionary. A chip fails when `spellingKey` equals the lemma, or when it contains a number (`3º`, `CO2`, `O₂`) or no letter. Underscore chips stay. The `GRÜSSE` and `LAß` lemmas are not retagged or rebanded (#335, #357); only the self-chip is removed.

4. **European Portuguese, AO1990.** The app is pt-PT. Citation forms come from `dictionary-pt-pt` (a headword, not an inflected `[$infinitive$…]` line). Accentless misspellings `NOTICIAS`, `CLINICA`, and `ULTIMA` are replaced and dropped from the accent-pair allowlist. The nine `-MOS` pairs (`FALAMOS`/`FALÁMOS`, and the same pattern for acabar, chegar, gostar, levar, passar, pensar, procurar, voltar) stay: they are EU present versus pretérito, not spelling duplicates, and several unaccented forms sit in slots 0–399. `COLECÇÃO` is replaced by a different in-band word because `COLEÇÃO` already occupies `pt/c1` slot 288. Off-band inflected or clitic rows named in #366 (`SABONETE`, `CALMAS`, `CELEBRA`, `OBSERVOU`, `MORDA`, `LHO`, `LHOS`, and the place/brand rows) are replaced in their own slots. `CHEF` and `ASCENDER` are re-glossed. The wrong chips on `MATEM`, `COSTELAS`, `ASAS`, `SOUBER`, `TERCEIRO`, and `CARBONO` are fixed or removed. `ESTARÁS` / `FIZEMOS` / `TIVER` stay.

5. **German info rows.** `BERUF` and `BIBLIOTHEK` are replaced in their slots with in-band words. `NOCHMAL` keeps its adverb POS; the gloss is `erneut.`

Replacements are same-slot (ADR 0058). Pack lengths are unchanged. Every changed pack bumps `version` and `pack-pin.json` is regenerated. New PT lemmas are `pos-exempt` (no licensed PT POS source). Other new lemmas take a content POS from wordhoard or CEFR-J, corrected when that source tag is not the real content POS and the right tag is one of noun, verb, adjective, or adverb.

## Options Considered

| Option | Pros | Cons |
| --- | --- | --- |
| A — allowlist for base slots and common-stem homographs (chosen) | Slots 0–399 stay; real words such as `ROSA` and `VENTO` keep shipping; a listed name with an invented gloss still fails | A literal "no name-listed lemma ships" is true only after the allowlist exemption |
| B — delete every name-list hit | Matches the sentence of the acceptance criterion literally | Rewrites slots 0–399 and deletes common nouns; forbidden by ADR 0058 |
| C — seed LDNOOBW into the denylist | Wider profanity net | Not small or reviewable; out of scope for the ten listed items |
| D — drop one member of each `-MOS` pair | One spelling per pair | They are different tenses, and some sit in slots 0–399 |

## Consequences

- `packs:check` fails CI if any of the 36 packs ships a denylisted lemma or a name-listed lemma that is not on `lemma-names-allow.txt`.
- Chip membership now runs for en, de, es, fr, and it as well as pt. `hunspell-verdicts.json` is regenerated when `packs:check` sees new lemmas or chip tokens.
- A1–A2 replacement lemmas are the next unused frequency stems that clear the hint ceiling. Where the original A1 cut is already packed with real words, the replacement can sit slightly above that cut. It is never taken from a later index window.
- Revisit if a licensed PT POS source appears, or if #335 changes the `GRÜSSE` lemma.
