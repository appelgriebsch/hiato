# ADR 0043: EndCard "Practice this word" CTA — deep link, no pack schema change

- **Status**: Accepted
- **Date**: 2026-11-08 (amended 2026-11-09)
- **Deciders**: Andreas Gerlach
- **Supersedes**: none
- **Related issues**: #219

## Context

The EndCard already teaches the lemma via `LemmaTeach` (gloss, synonym chips, tap-to-speak per ADR 0037). A "learn more" add-on was considered in two forms: example sentences, or a practice deep link. Pack lemmas carry only `word`, `gloss?`, `synonyms?` (`src/packs/schema.ts`); adding example sentences means a pack schema change, curated data per pack, and per-pack license review (`NOTICE`, ADR 0029). The pocket already provides a retry path via `?mode=pocket&id=…` (ADR 0034, `src/lib/pocket-play.ts`).

## Decision

Ship the EndCard "Practice this word" CTA only. No pack schema change. On a **lost** daily round, the EndCard offers one primary-adjacent action, "Practice this word". It **replaces** "Save to pocket". Tap saves the lemma to the pocket (via `addToPocket`, idempotent) and navigates to the existing pocket play path (`pocketRetryHref`). A won daily round shows no action. Example sentences are deferred to a later pack add-on, not decided here.

## Options Considered

| Option | Pros | Cons |
| --- | --- | --- |
| Deep-link CTA only (chosen) | Reuses ADR 0034 pocket path; zero pack/schema/license surface; smallest complete change | No example sentence in v1 of this feature |
| Add `example?` to PackLemma | Richer teaching | Pack schema + curated data + license review per pack; touches `packs:check` and `NOTICE` |
| No EndCard change | Zero work | Gloss/synonyms/speech already cover the surface; item dropped entirely |

## Grill decisions (2026-11-09, Andreas)

1. **Loss only (1C).** The action shows on a daily loss only. `canPlayPocketEntry` keeps its post-win block (ADR 0018/0034 anti-spoiler). This overrides the earlier "win or lose" roadmap wording.
2. **Replace Save (2A).** "Practice this word" replaces "Save to pocket". One action; it also saves.
3. **Already saved (3B).** If the lemma is already in the pocket, show a short "Already saved" note, then open pocket play. No confirm.

## Consequences

- `shouldShowPocketSave` (`src/lib/pocket-save.ts`) becomes the gate for the new action; it stays `mode === 'daily' && !won`. Practice, endless and pocket EndCards stay action-free.
- Pocket full and lemma new: the existing inline replace-oldest confirm (ADR 0034, #83/#85) runs first. Cancel keeps the EndCard; confirm saves, then navigates. "Oldest" stays min `addedAt` per lang x CEFR slot (cap 5).
- `canPlayPocketEntry` is unchanged.
- Pocket play stays streak-immune: it never calls `recordDailyWin`.
- Copy and visuals for the action, the replace-oldest prompt and the "Already saved" note come from UX Uma's spec.
- Example sentences remain an open pack-level idea, to be decided separately with licensing.
