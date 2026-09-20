# ADR 0030: Pack gloss is always in the pack language

Learner packs are L2 hangman: the puzzle word is German in a DE pack, Portuguese in a PT pack, and so on. Andreas required the short dictionary `gloss` on each lemma to be in that **same pack language** — never English as a fallback when generating or topping up DE/ES/PT entries.

## Decision

`lemmas[].gloss` is written in `pack.lang` (EN→EN, DE→DE, ES→ES, PT→PT). English is not a substitute for missing L2 copy. Expand (xAI) must prompt and accept only same-language glosses; `packs:check` fails a pack that ships English-shaped or English-majority glosses in DE/ES/PT. Synonym chips stay same-language as well (ADR 0023).

## Considered options

- **English glosses for every language** — easier for generators, but the play-screen hint would teach L1 English instead of L2. Rejected.
- **English only when L2 generation fails** — that is how new lemmas leaked English copy into DE/ES/PT packs (the expand prompt even asked for "a/an/the …" / "to …" frames). Rejected; leave the lemma out or retry until the gloss is in-language.

## Consequences

- Play hints under the grid (ADR 0023) show L2 explanations because the JSON already is L2.
- Gloss cache entries that are English for a non-EN lemma are treated as missing and regenerated.
