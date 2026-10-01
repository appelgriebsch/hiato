# ADR 0035: Think-in-L2 gloss as brand presentation

- Status: Accepted
- Date: 2026-10-01
- Deciders: Andreas Gerlach (via Product Priya); post-finish LearnerHint: UX Uma
- Epic: [#74](https://github.com/appelgriebsch/hiato/issues/74)
- References: ADR 0023 (in-round gloss/synonym hints); ADR 0030 (gloss always in pack language). Does **not** amend 0023 or 0030 — presentation and surface scope only.

## Context

Hiato already ships same-language gloss and synonym chips under the puzzle (ADR 0023, ADR 0030). Competitors lead with translation or L1 definitions. Epic #74 elevates the L2 gloss as the visible teach moment so "think in L2" reads as brand, not a buried chip.

Pack data quality for B2–C2 and any ceiling rewrite (#77) stay separate. This ADR locks presentation and v1 surfaces only.

## Decision

1. **Surfaces (v1):** Brand the L2 gloss on **EndCard** and the in-round **hint strip** only. Share-card copy is later. No Settings schooling. No Home or About one-liner in #74.

2. **EndCard hierarchy:** Elevate the gloss as the **teach headline**. Reveal the lemma, but it is not the sole hero. Show synonym chips when they fit a lean layout.

3. **Empty gloss:** If gloss is missing, **silent omit**. Do not show faint empty copy.

4. **Post-finish LearnerHint:** **Hide** the strip after a solve when EndCard is showing (UX Uma, 2026-10-01). EndCard is the brand climax. The strip's job is in-progress only. Still hide when EndCard omits an empty gloss. Do not keep or hybrid unless the strip later carries non-gloss content.

5. **Out of #74:** No `alreadyPlayed` or pocket synonym restore. No pack rewrite or B2–C2 token-quality gate. Ship #74 **before** #77; do not block on ceiling work.

6. **Acceptance:** UX checklist plus copy audit. **No** analytics requirement for #74.

7. **ADR hygiene:** New short ADR only. Do not fold this into ADR 0023 or 0030.

## Consequences

- EndCard and hint-strip UI change; share, Settings, Home, and About stay untouched in #74.
- Empty-gloss EndCards show lemma (and chips if present) without placeholder gloss text.
- After finish, only EndCard shows the teach moment; mid-round strip stays for play.
- Impl can land without waiting on #77 / B2–C2 gloss quality.
- Acceptance is checklist- and copy-based until analytics exist.
