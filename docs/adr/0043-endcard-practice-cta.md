# ADR 0043: EndCard "Practice this word" CTA — deep link, no pack schema change

- **Status**: Accepted
- **Date**: 2026-11-08
- **Deciders**: Andreas Gerlach
- **Supersedes**: none
- **Related issues**: tracer issue for the EndCard practice CTA (see PR body)

## Context

The EndCard already teaches the lemma via `LemmaTeach` (gloss, synonym chips, tap-to-speak per ADR 0037). A "learn more" add-on was considered in two forms: example sentences, or a practice deep link. Pack lemmas carry only `word`, `gloss?`, `synonyms?` (`src/packs/schema.ts`); adding example sentences means a pack schema change, curated data per pack, and per-pack license review (`NOTICE`, ADR 0029). The pocket already provides a retry path via `?mode=pocket&id=…` (ADR 0034, `src/lib/pocket-play.ts`).

## Decision

Ship the EndCard "Practice this word" CTA only. No pack schema change. On a finished daily round, the EndCard offers one primary-adjacent action: save the lemma to the pocket (if not already there, via `addPocketEntry`) and navigate to the existing pocket play path. Example sentences are deferred to a later pack add-on, not decided here.

## Options Considered

| Option | Pros | Cons |
| --- | --- | --- |
| Deep-link CTA only (chosen) | Reuses ADR 0034 pocket path; zero pack/schema/license surface; smallest complete change | No example sentence in v1 of this feature |
| Add `example?` to PackLemma | Richer teaching | Pack schema + curated data + license review per pack; touches `packs:check` and `NOTICE` |
| No EndCard change | Zero work | Gloss/synonyms/speech already cover the surface; item dropped entirely |

## Consequences

- `EndCard` in `src/pages/Play.tsx` gains the CTA on daily rounds; behavior on win/lose follows ADR 0034 eligibility (Save path is daily-only; the CTA navigates to pocket play which is streak-immune).
- Pocket cap replace-oldest confirm (ADR 0034, #83/#85) applies when the slot is full.
- Example sentences remain an open pack-level idea, to be decided separately with licensing.
