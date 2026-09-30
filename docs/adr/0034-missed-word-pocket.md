# ADR 0034: Missed-word pocket — local retry queue

- Status: Accepted
- Date: 2026-09-30
- Deciders: Andreas Gerlach
- Amends: ADR 0003 (core loop gains a **tertiary** local path: missed-word pocket sits after daily primary and endless secondary; pocket never affects streaks). Affirms ADR 0008 (no leaderboards / no social miss comparison). Nuances ADR 0018: when picking *other* pocket words, still exclude today’s daily lemma; **same-day pocket retry of the lost daily word itself is explicitly allowed** when that word is already in the pocket. Does **not** amend ADR 0032 / 0033 — pocket never touches Clerk, D1, or claimed streaks (#64 / #76 boundary).

## Context

Hiato is ritual-only today: one daily per `lang|cefr` plus optional endless practice (ADR 0003). After a daily miss the learner sees the lemma once, then waits until tomorrow; there is no light local retry path short of Anki/SRS. Epic [#76](https://github.com/appelgriebsch/hiato/issues/76) proposes an on-device “few words to retry” pocket — local only, no accounts.

Avery/Sage lean recommendation (pre–grill-me) suggested: cap **3** per lang×CEFR; optional EndCard CTA after **hint-used wins**; **practice/endless loses** eligible for Save; optional **soft TTL** (“this week”). Grill-me 2026-09-30 (Product Priya / Andreas) **locked a stricter ritual-aligned plan** that changes those four points (see Decision + Consequences). Technical storage shape from the lean spike remains valid.

## Decision

1. **What it is:** A guest-local, capped retry queue of missed lemmas. Tertiary play path after daily (primary) and endless (secondary). Not SRS, not Leitner, not a replacement for endless.

2. **Eligibility (Save):** **Daily loses only.** Practice and endless loses are **not** eligible. Opt-in only — never auto-add on lose. **No** hint-used-win Save CTA in v1.

3. **Cap:** **5** entries per `lang×CEFR` slot (not 3). When the slot is full and the learner Saves another word → **replace-oldest confirm** (explicit confirm before dropping the oldest entry).

4. **Retention:** Cap + manual Remove only. **No soft TTL** / no automatic week expiry in v1.

5. **Storage:** `localStorage` key `hiato.pocket`, schema version `v:1`. Entry id: `` `${lang}|${cefr}|${lemmaIdentity(word)}` ``. Persist display fields needed for gloss-only UI (e.g. gloss, lang, cefr, addedAt); do not key on pack array index.

6. **Play path:** Hangman retry via `?mode=pocket` (or equivalent). Reuses the existing round engine. **Never** calls `recordDailyWin` / never writes streak or D1 win facts. Pocket win → remove from queue; fail-in-pocket → keep; learner may **manual Remove**.

7. **ADR 0018 nuance:** When selecting pocket words other than today’s daily, continue to exclude today’s daily lemma so pocket cannot spoil an unplayed/unlost daily. **Same-day pocket retry of the lost daily word is allowed** when that word is in the pocket (learner already saw/missed it).

8. **Surfaces (product):** Home shows `Pocket(n)` when `n > 0`. EndCard shows Save on **daily lose** only. Pocket list is **gloss-only** (hide lemma) so the list itself does not re-spoil spelling.

9. **UI shell (UX Uma locked 2026-09-30):** **Bottom sheet**, not a `/pocket` page. One sheet; triggers = Home `Pocket(n)` when `n > 0` + optional “View pocket” after Save; sheet contents = gloss list + Remove + Retry; play exits the sheet into the existing session UI; no primary-nav Pocket item; no empty-state chip; skip `/pocket` for v1 (throwaway route later only if deep-link needs it). Product rules above (gloss-only, Save on daily lose, replace-oldest confirm, manual Remove) stay fixed.

10. **Hard boundary:** Pocket **never** touches streaks, Clerk, or D1 (#64). Affirms ADR 0008. Distinct from ADR 0032 / 0033 sync surfaces.

## Consequences

- New client module sibling to `prefs` / `streaks` / `daily-record` (`hiato.pocket`); unit-testable id/cap/replace-oldest helpers.
- EndCard and Home gain pocket CTAs; practice/endless EndCards stay Save-free in v1.
- Lean deltas vs Avery/Sage (document for Priya / tracers): cap **5** not 3; **no** hint-used win CTA; practice loses **ineligible**; **no** soft TTL.
- Same-day retry of a lost daily via pocket is a deliberate exception to the spirit of ADR 0018’s anti-spoiler rule; other pocket picks still honor 0018.
- Uma locked bottom sheet (not `/pocket`); impl must not invent a primary-nav or empty-state chip that bypasses gloss-only / confirm rules.
- No cloud migration path in this ADR; clearing site data wipes the pocket (same guest posture as other local keys).
- Tracer children should slice store → Save on daily lose → pocket play → Home badge → full-queue confirm, without coupling to #64.
