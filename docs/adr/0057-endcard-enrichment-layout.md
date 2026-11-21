# ADR 0057: EndCard layout for POS + IPA + word family (post-finish only)

- **Status**: Accepted
- **Date**: 2026-11-19
- **Deciders**: Andreas Gerlach
- **Supersedes**: none
- **Related issues**: #299, EPIC #313, #314, #318

## Context

The EndCard teach block (`LemmaTeach` in `src/components/play/LemmaTeach.tsx`, rendered by `EndCard` in `src/pages/Play.tsx`) currently shows: result badge, gloss (Inter 18/600), "The word was", the word in Jersey 10 + tap-to-speak (ADR 0037), one example sentence in italic Inter (ADR 0049, A1–B2 only), the mute-switch note, and synonym chips (ADR 0023). Issue #299 adds POS, IPA and word family after finish. Sample screens were reviewed and approved in a comment on #299; source + PNGs live on branch `vibe/299-endcard-screens-10fdbf` under `docs/design/299-endcard-screens/`.

## Decision

Inside the teach card, directly under the word + speaker row:

1. **Meta row** (centered, wraps): POS as an accent chip — `px-frame`, `accent-soft` fill, `accent-fg` edge and text, pixel label (same style as the `Daily` badge), label localized via `POS_LABELS` in `src/packs/labels.ts`; IPA beside it in Inter 14px `ink-muted`, wrapped in slashes that are `aria-hidden` (the IPA glyphs fall back to the OS font: the self-hosted Inter subset stops at Latin-1, and ADR 0052 §3 keeps reading text out of the pixel font). The whole row is omitted when both fields are absent.
2. **Example sentence** stays where it is (italic Inter, `max-w-sm`), now also for C1/C2 packs (ADR 0056).
3. **Chip groups with labels**: "Synonyms" (filled `cream-dark` chips, as today) and "Word family" (outlined chips: `px-frame` with `--px-edge: var(--color-line)`, transparent fill). Filled vs outlined plus the labels are the non-colour cue (ADR 0052 §2). Labels are pixel-label text in `ink-faint`, English app chrome like "The word was". Groups are omitted when empty; family caps at 3 chips (`FAMILY_MAX`).
4. **CEFR tag** stays in the stats card (`PT · A2`) — not duplicated into the meta row on a 390px screen.
5. **Anti-spoiler unchanged and structural**: all of POS / IPA / family / example render only inside `EndCard`, which mounts only when `finished` is set. In-round UI never receives the fields; e2e asserts this.
6. Responsive: portrait verified at 390×844 @2x with all fields (actions stay in view via the existing `scrollActionsIntoView`, #209); short-landscape keeps the two-column EndCard with the teach card scrollable (`short-land:overflow-y-auto`); dark mode uses the existing token swap. Contrast pairs used already pass `docs/design/retro/contrast.json` (accent-soft/accent-fg 6.03:1; line/raised 4.50:1 non-text).

## Options Considered

| Option | Pros | Cons |
| --- | --- | --- |
| **Meta row under the word + labeled chip groups (chosen)** | Matches approved screens; scannable; non-colour cue via outline | Two new UI strings ("Synonyms", "Word family") |
| Same, but synonyms stay unlabeled | Smaller diff | Two chip styles without labels are ambiguous |
| CEFR tag also in the meta row | Full 7ESL parity | Duplicates the stats-card tag on narrow screens — rejected |
| POS/IPA above the word | — | Crowds the pixel-word hero; rejected |

## Consequences

- `LemmaTeach` gains `pos`/`ipa`/`family` props; `EndCard` passes them from the pack lemma (daily/practice) or the `DailyRecord` (replay) or the pack join (pocket).
- New UI strings: "Synonyms", "Word family" (English chrome).
- e2e `lemma-extras.spec.ts` covers: absent in-round, present after win/lose/replay, pocket join, short-land, dark, actions visible at 390×844.
- Contrast audit re-run on the new elements as part of #319.
