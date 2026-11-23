# ADR 0060: PT pack QA (#362) — chip language gate, broken-chip repair, meta-lemma policy, PT POS fill

- **Status**: Proposed
- **Date**: 2026-11-23
- **Deciders**: Andreas Gerlach
- **Supersedes**: none (sharpens ADR 0023 synonym chips, ADR 0055 POS/extras, ADR 0058 append-only slots)
- **Related issues**: #362 (this PR), #332 (PT grow PR under QA), EPIC #327, ADR 0058, ADR 0030 (pack-language copy), ADR 0055/#339 (gated Mistral POS fill)

## Context

Independent QA of the grown PT packs (#332) found: all 3,629 grown PT lemmas shipped without `pos` (blanket `pos-exempt.txt` lines); wrong-language / English / broken synonym chips (`BEBIDA→"drink"`, `MALAS→"valises"`, `JORNALISTA→"REPORTER"`, `DOZE→["[]"]`, `DENTE→["["]`, numerals `7`/`20`, multi-word and typo chips); 27 `pt/b1` placeholder glosses of the shape `um/uma … que …`; and meta/loanword lemmas (`pt/b2` WALL with an "em inglês" gloss, `pt/c2` HIS with an English-grammar example, `pt/a1` FBI), plus a suggestive SEIOS example. `packs:check` was green because chips were never language-gated and PT had no POS source.

## Decision

1. **Chip language gate, pt first.** `scripts/synonym-chips.ts` gains `CHIP_LANG_GATE_LANGS = {pt}`. For gate languages, `invalidSynonymChipReason` additionally rejects (a) letter-less chips (`[]`, `[`, `7`, `20` — stringified empty arrays from the synonym model, numerals) for **every** language, and (b) chips whose every letter token is not a word of the pack language per `isWordOfLang` — for pt that consults **both** `dictionary-pt-pt` and `dictionary-pt` (either accepts, plus the loanword allowlist; the Natura pt-PT dict does not list standalone function words like `por`, so an all-dicts AND would be a false-negative machine and is not used). `packs:check` (`validatePack`) enforces the same rule whenever Hunspell membership is active, and generation (`expand-packs.ts` `cleanSynonyms`, `synonym-generate.ts` via an optional membership predicate) applies it before anything reaches the caches, so check and generation agree. Other languages join the gate set as their QA issues land. Phrase chips (e.g. `ao lado`) stay valid when all tokens are pack-language words — multi-word chips are an established pattern in all six languages.
2. **Generator-level broken-chip repair.** `synonym-generate.ts` `asStringArray` now drops letter-less array elements (a model answer of `["[]"]` becomes `[]` = unique referent) in all languages.
3. **PT POS filled, not exempted.** No licensed PT POS source exists (FrequencyWords `pt_50k` has no pos column; wordhoard v0.1.0 has no pt), so the 3,629 grown PT lemmas that shipped without `pos` are filled via the existing #339 gated Mistral tag+verify fallback (`bun run packs:pos --fill-exempt`): tag and independent verify must agree on a valid `PackPos`; filled tags are recorded as `pos` entries in `lemma-extras-gate.json`. 3,557 agreed and were filled; 72 disagreed and stay exempt (fail-closed by design). `build-lemma-pos.ts` no longer writes `pos-exempt.txt` lines for lemmas with a current passing pos gate entry, so filled lemmas leave the exemption list (5,990 → 3,629 → 72 pt lines).
4. **Meta lemmas replaced in their own slots** (ADR 0058 append-only; the CI slot guard fails any removal/reorder, a same-slot replacement passes): `pt/a1` FBI → PORTA, `pt/b2` WALL → DIETA, `pt/c2` HIS → CHALEIRA, each an in-band FrequencyWords pt word, fold-unique, Hunspell-valid, with a PT gloss. Established loanwords stay: DETECTIVE (re-glossed to the investigator sense), MISS (example replaced with a generic gated sentence), SHOW, DEALER. DEALER/CHACINA keep their factual glosses (C2 register; neither is a profane/violent/slur/person-name item per the AGENTS.md content policy); DEALER's contradicting chips are replaced with `traficante`. The SEIOS example is replaced with the gated clinical sentence "O médico examina os seios da paciente."
5. **Placeholder glosses repaired.** The 27 `um/uma … que …` `pt/b1` glosses are regenerated through the same Mistral gloss gate (`glossRejected` plus a `…` rejection) into `gloss-cache/pt.json` and the packs.
6. **Extras.** `lemma-extras.ts` gains `--lang=` so the wiktextract + Mistral-fallback IPA/family run can target pt (`bun run packs:extras` → `--lang=pt`); `recordChecksums` keeps committed checksum entries for languages not processed. New PT lemmas get gated `ipa`/`family` entries in `lemma-extras-gate.json`.

## Options Considered

| Option | Pros | Cons |
| --- | --- | --- |
| A — pt-scoped chip gate now, others later (chosen) | #362 scope; other languages' chips have their own QA follow-ups and floors (80% on A1–B1) that a sudden global membership gate would break | Gate is per-language opt-in until each QA issue lands |
| B — global chip membership gate in this PR | Uniform | Would flag ~700 chips across en/de/es/fr/it and break several A1–B1 coverage floors; cross-language cleanup is its own epic |
| C — ship PT without POS + ADR | No API calls | EndCards would show no POS for 60% of PT lemmas while every other language shows it; the #339 gated fill already exists and is licensed-clean (original Mistral copy) |
| D — drop WALL/HIS/FBI | Cleanest content | Fails the CI slot guard (words after the removed slot shift); same-slot replacement is the AGENTS.md-sanctioned mechanism |

## Consequences

- `packs:check` fails on any letter-less chip in any pack and on any non-PT-word chip token in pt packs; CI stays green because `hunspell-verdicts.json` is regenerated and committed (the new chip lookups are cache misses locally, hits in CI).
- `pos-exempt.txt` shrinks to (near) zero pt lines once `--fill-exempt` lands; `lemma-extras-gate.json` gains ~3.6k `pt|…|pos` entries plus `ipa`/`family` for the grown lemmas.
- PT pack `version`s bump and `pack-pin.json` is regenerated; same-slot replacements keep the CI slot guard green.
- Revisit if: another language's QA lands (add it to `CHIP_LANG_GATE_LANGS`), or a licensed PT POS source appears (then `posSourceInfo('pt', …)` returns it and the Mistral fill becomes unnecessary).
