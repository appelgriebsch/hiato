# ADR 0044: Pocket spaced review — fixed 1/3/7-day ladder, due-first surfaces

- **Status**: Accepted
- **Date**: 2026-11-08 (amended 2026-11-09)
- **Deciders**: Andreas Gerlach
- **Supersedes**: none; amends ADR 0034 ("not SRS" becomes "light local scheduling on top of the pocket")
- **Related issues**: #220, #219

## Context

The pocket (ADR 0034) is a capped retry queue: win removes the entry, fail keeps it, entries carry only `addedAt`. Learners re-meet missed words only by manual retry. A spaced-review layer was considered: fixed interval ladder vs Leitner boxes, and PocketSheet surfacing vs Practice-only surfacing. Pocket cap stays 5 per `lang|cefr` slot, so per-entry state must stay tiny.

## Decision

Add a fixed ladder to pocket entries: stages 0/1/2 with intervals 1, 3, 7 days. `PocketEntry` gains `stage: 0|1|2` and `dueAt: number` (ms epoch). A pocket fail advances the stage (cap 2) and sets `dueAt` to now plus N local calendar days (wall-clock time kept); a pocket win still removes the entry (existing `pocketOutcomeOnFinish`). Entries missing the new fields migrate on read: `stage 0`, `dueAt` = `addedAt` plus 1 local calendar day (wall-clock time kept). Due entries sort first in the PocketSheet and show a "Due" badge, and the Practice EndCard offers due pocket entries (see grill decision 2). Pocket remains streak-immune and never calls `recordDailyWin` (ADR 0018/0034 boundaries unchanged).

## Options Considered

| Option | Pros | Cons |
| --- | --- | --- |
| Fixed 1/3/7 ladder + PocketSheet badge (chosen) | Tiny state at cap 5; predictable; visible to the learner | Less adaptive than Leitner |
| Leitner boxes (5 stages) | Adaptive | More per-entry state; little gain at cap 5 |
| Due-first in Practice only | Less UI work | Due words invisible until Practice is opened |

## Grill decisions (2026-11-09, Andreas)

1. **Only a due play moves the ladder (1A).** A pocket loss advances the stage (cap 2) and sets the next due day only when the entry was due at play start. An early loss (for example right after the #219 "Practice this word" action) keeps `stage` and `dueAt` unchanged, so the 1-day review still happens. A win removes the entry, early or due.
2. **Practice offers, does not force (2B). Placement on the Practice EndCard (Q2A).** When the current `lang|cefr` slot has due entries, the Practice EndCard shows one opt-in secondary action, "Review N due pocket word(s)", above "Next word". It opens pocket play on the first due entry. Practice is otherwise unchanged, and nothing swaps automatically.
3. **One word per round (1A thin).** The PocketSheet "Review due words (N)" action and the Practice offer each open one due word. There is no review queue, progress line or summary in this ADR's scope.
4. **Replace-oldest stays by `addedAt` (3A)**, even when that entry is due.

## Solution-engineer decisions (2026-11-09, not grilled)

- **Local-day due rule.** `isDue(entry, today)` is `localDateKey(dueAt) <= today`, the same device-local day key as the daily. A word is due for the whole calendar day, not from the clock time it was saved. Ladder math, per Andreas's decision on 2026-11-09, is `dueAt` = now plus N local calendar days (wall-clock time kept), so DST never shifts the due day.
- **New saves** (Save or the #219 action) get `stage 0`, `dueAt` = now plus 1 local calendar day (wall-clock time kept).
- **Sheet order.** Due entries first, then not-due entries, each by `dueAt` ascending, ties by `id`.
- **No notifications.** Push reminders are not planned.
- **Storage.** `POCKET_VERSION` 1 to 2. v1 parses and migrates (`stage 0`, `dueAt` = `addedAt` plus 1 local calendar day). Repair writes v2. v>2 keeps the existing future-version fallback.

## Consequences

- `src/lib/pocket.ts` / `pocket-play.ts` gain pure, unit-tested helpers (`isDue`, due-first ordering, migration); schema version bumps in `POCKET_VERSION` with a parse fallback.
- PocketSheet and the Practice picker consume the ordering; no engine change.
- Clearing site data still wipes scheduling (same guest posture as ADR 0034).
