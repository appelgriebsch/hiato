# Decisions — pack hint ceiling

Date: 2026-09-25. Grilling on the request that glosses and synonym chips in `public/packs` stay understandable for the learner who picked that pack. Facts about graded lists are in [controlled-defining-vocabulary.md](controlled-defining-vocabulary.md).

## Hint ceiling

**Chosen:** For an A1, A2, or B1 entry, every gloss content word and every synonym chip must sit at that pack’s band or an easier band.

**Why:** An A2 player has to be able to read the hint for the A2 word. Learner dictionaries define with easier words than the headword (Johnson; Longman 2,000-word core; Oxford 3000 used for every OALD definition). Easier words in the hint serve that.

**Rejected:** Same band only — that would forbid A1 words inside an A2 hint. One shared easy core for every band — that would make C2 hints as easy as A2 hints. B2–C2 packs are out of this rewrite; players at those bands already have a wide vocabulary.

## What “too hard” means in the checker

**Chosen:** On A1–B1 packs only, `packs:check` fails a hint when a folded token is a lemma this language already ships in a strictly higher pack (A2 for an A1 hint, through C2). English also fails when the easiest CEFR-J (A1–B2) or Octanove (C1–C2) tag for that headword is above the pack band. A token on none of those lists does not fail by itself. Folding uses the Hunspell dictionaries the pack check already loads. B2–C2 packs are not subject to this failure.

**Why:** German, Spanish, and Portuguese have no open commercial-use A1–C2 lemma list. ADR 0029 already forbids ingesting Goethe Wortlisten, Instituto Cervantes PCIC, CAPLE lemma lists, the English Vocabulary Profile, Oxford 3000/5000, and CEFRLex. The packs themselves are the level assignment the app publishes. Absence from CEFR-J or Octanove is not “above the top band.”

**Rejected:** A frequency-rank cutoff as a CEFR grade. Generator instructions with no automatic failure. Applying the new failure to B2–C2, which would force a rewrite of packs this decision leaves unchanged.

## Which packs change

**Chosen:** Rewrite glosses and synonym chips in the twelve A1–B1 packs (`en`, `de`, `es`, `pt`). Leave lemma lists unchanged. Leave B2–C2 glosses and synonyms unchanged. The play screen stays the hint strip it already is.

**Why:** The comprehension gap is widest at A1–B1. Above B1 the player is expected to have a wide vocabulary, so those hints stay as shipped.

## Synonyms above the ceiling

**Chosen:** Drop a chip that fails the ceiling. Replace it with an in-ceiling chip when one exists. If none exists, ship the gloss with no chip for that slot. Do not put a harder chip back.

**Why:** A harder synonym is the hint an A1–A2 player cannot use. The play screen already allows a gloss with an empty synonym row.

**Note for the plan:** A1–B1 `packs:check` already fails synonym coverage under 80% (`SYNONYM_COVERAGE_FLOOR` in `scripts/synonym-chips.ts`, applied to `a1`/`a2`/`b1` in `scripts/packs-check-lib.ts`). An exact-token scan on 2026-09-25, dropping chips that contain a higher-pack lemma, left every A1–B1 pack at or above 85% (lowest: `es/a1` 85.8%). The rewrite keeps that floor. It meets the floor with in-ceiling chips, not by restoring harder ones.

## Review of unlisted words

**Chosen:** Model rewrite, then the automatic check, then a sampled read of each of the twelve packs (a few dozen entries per pack) before the change is called done.

**Why:** Most gloss words are neither hangman answers nor CEFR-J headwords, so the checker will not see them. A full read of about 4,800 entries is a dictionary edit this effort will not take on. A rewrite with no read leaves words such as “unexpected” or “damage” in place when the model misses.

**Rejected:** No sampled read. A line-by-line read of every A1–B1 gloss and synonym.

## Checker mechanism (expert consult, 2026-09-25)

The grilling note said folding would call the Hunspell dictionaries already loaded by `packs:check`. The consult checked `nspell@2.1.5`: it has no stem API, affixed surfaces do not keep the dictionary headword, and the shipped `.dic` files have no `st:` stem field. Calling `nspell` from the ceiling pass would also miss `scripts/data/hunspell-verdicts.json` and rewrite that file, which CI rejects.

**Chosen:** `packs:check` stays read-only. A local generator commits two small files: a headword-to-easiest-band map for English (built from the gitignored CEFR-J and Octanove files; easiest tag wins, including when both lists contain the headword), and a stem cache. The stem cache resolves `en`/`de`/`es` surfaces through `word_form` → `lemma` in the local wordhoard database, and resolves regular affixed forms for every pack language by replaying the affix rules. It does not store `cefr_estimate`. `packs:check` reads the caches and fails closed if they are missing or their stamp does not match. It does not load `nspell` or the database, and it does not write either cache. A token fails only when its easiest candidate band is above the pack. A lemma that already sits in this band passes even if a grandfathered copy also sits higher. A token with no candidate does not fail.

**Why:** CI and the Pages build both run `packs:check` and must not download word lists or dirty `hunspell-verdicts.json`. Wordhoard is already the licensed DE/ES/EN form table. Portuguese is not in that database, so Portuguese irregulars that are their own dictionary headwords fold only when the surface itself is the higher lemma. The sampled read is the backstop for those.

**Rejected:** Live `nspell` lookups inside `packs:check`. Surface `foldKey` only, with no stem cache (misses `scared` / `ging`). Treating any higher-pack hit as failure when the same lemma is also in the current band.
