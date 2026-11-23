# ADR 0059: Offensive-content guards — ß/SS denylist fold, all text-field scans, repo policy

- **Status**: Proposed
- **Date**: 2026-11-23
- **Deciders**: Andreas Gerlach
- **Supersedes**: none (sharpens the denylist machinery behind ADR 0040 and issue #212)
- **Related issues**: #363 (this PR), EPIC #327 / ADR 0058 grow PRs #329–#334, #346 (spellingKey)

## Context

Validation of the ADR 0058 grow PRs showed three denylist-intended German lemmas shipping (`de/a1` ERSCHIEßEN, `de/a2` SCHEIßKERL, `de/c1` SCHEIßHAUS, plus `de/c2` SCHEIßBULL): the denylist stored only `SS`/`ẞ` forms while `nfcUpper` preserves `ß`, so `ERSCHIEßEN` matched neither the `ERSCHIESSEN` entry nor any pattern stem. `packs:check` scanned only lemmas and gloss tokens, and synonym chips / family members / example sentences were not scanned with the exempt-aware gloss semantics. The repo had no written policy that profane, violent, slur, and person-name words are never valid pack items.

## Decision

1. **ß/SS fold at the key level.** Every denylist key — exact entries, pattern stems and suffixes, allow and gloss-exempt entries — and every matcher input goes through `spellingKey` (`nfcUpper` + `ß`/`ẞ`→`SS`) in `scripts/lemma-denylist.ts`. Whole-lemma matching, language scoping, and the allow/exempt lists are unchanged; only the spelling comparison folds. Unit tests assert that every exact entry denies its `ß`/`SS` variant and vice versa, and that every pattern line with an `SS` stem matches its `ß` variant. The `de SCHEISS(…)` pattern gains the `BULL` suffix (SCHEISSBULL); the redundant `de SCHEIß(…)` line is removed because the fold makes it subsumed.
2. **All text fields scanned in `packs:check`.** Lemma (unchanged), gloss tokens (`isDeniedGlossToken`), synonym chips and family members (new `isDeniedTextToken`: every exact category counts, gloss-exempt homographs lifted), and example sentences (`isDeniedGlossToken`, own lemma skipped) are all checked in `validatePack`; `synonym-chips.ts` uses the same semantics so generation and check agree. `de ASS` joins `lemma-denylist-gloss-exempt.txt` (Präteritum of *essen*), so `aß` in DE examples stays allowed while EN `ass` stays denied.
3. **Repo policy note.** Root `AGENTS.md` states that profane, violent, slur, and person-name-as-content words are not valid pack items at any CEFR level, that the denylist files are the enforcement point, and that exceptions need a reasoned allowlist entry; it also defines the always-on `## Expert: lexicography-linguistics` for ask-the-expert. README links to it.
4. **Shipped violations replaced in-slot.** Per ADR 0058 append-only slot rules, the four DE lemmas above are replaced in their own slots (WACHEN, NOCHMAL, BERUF, BIBLIOTHEK) with version bumps and a refreshed `scripts/data/pack-pin.json`; denied keys are purged from `gloss-cache`/`synonym-cache`; `hunspell-verdicts.json` is regenerated (its stamp hashes `lemma-denylist.ts`, so the cache invalidates by design and is rebuilt idempotently).

## Options Considered

| Option | Pros | Cons |
| --- | --- | --- |
| A — fold ß/ẞ→SS via `spellingKey` in all keys and matchers (chosen) | One root-cause fix; every consumer (check + generation pipelines) inherits it; no denylist data duplication | Folds cross-language too (a hypothetical non-DE `ß` word would compare equal to its SS form — only German uses ß, so no real collision) |
| B — add the ß form of every SS entry to the data files | No code change | Duplicates every SS entry and its conjugations forever; easy to miss the next one (exactly what shipped here) |
| C — scan only lemmas, keep text fields unscanned | Smallest diff | Leaves chips/family/examples unguarded — the gap this ADR closes |

## Consequences

- `isDeniedLemma`/`matchesDeniedPattern`/`isDeniedGlossToken` now deny both spellings; `nfcUpper` stays for non-denylist keys (gate keys, fold keys) where ß must be preserved.
- `packs:check` fails on profanity/slur in gloss/synonyms/family/example of any pack, with exempt-list support; CI stays green (slot guard passes because replacements are same-slot).
- The membership stamp hashes `lemma-denylist.ts`, so this change invalidates `hunspell-verdicts.json` once; the regenerated cache is deterministic and committed.
- Revisit if: a future language orthography makes ß/SS folding unsafe, or the expert section in `AGENTS.md` should move to a linked definition file.
