# ADR 0033: D1 streak sync and guest→account merge

- Status: Accepted
- Date: 2026-09-28
- Deciders: Andreas Gerlach
- Amends: ADR 0003 (v1 “streak state stored locally only” → local remains SoR for guests; signed-in users sync immutable win facts to D1). Affirms ADR 0004 (client supplies device-local `YYYY-MM-DD`). Affirms ADR 0008 (client-authored wins OK while no leaderboards). Amends ADR 0021 / wrangler bindings (two D1s, same binding name `DB`).

## Context

`StreakState` in `src/lib/streaks.ts` is a **projection**: `{ count, lastWinDate }` per `lang|cefr` slot, derived from consecutive daily wins and midnight break rules (`visibleStreak`, `nextStreakOnWin`). Syncing LWW on `count` would merge wrongly across gaps. Grill-me locked: immutable daily-win facts, grow-only set union / domain merge, always-confirm merge sheet, EU D1 day one, one shared preview D1, migrations via pinned Wrangler in CI.

## Decision

1. **Source of truth (signed-in):** Immutable daily-win facts in Cloudflare D1. Primary key: `(user_id, lang, cefr, local_date)`. Inserts are idempotent; never update a win row to “un-win.”
2. **Projection:** Server and client derive `StreakState` the same way as `streaks.ts` (grow-only set of dates → consecutive count ending at `last_win_date`; never sum across a gap).
3. **Client date:** Per ADR 0004, the client authors `local_date` as device-local `YYYY-MM-DD`. No server clock for day boundary in v1.
4. **Guest→account:** Always show an explicit **merge review sheet**, then **domain-merge** per lang+CEFR: prefer higher visible streak; tie-break later `last_win_date`; **never** sum streaks across a gap. After merge, keep localStorage as offline cache of the claimed account.
5. **Infrastructure:** Create D1 with **EU jurisdiction** day one. Two databases, same binding name `DB`: production D1 + **one shared preview D1**. Pages Production vs Preview secrets/bindings differ (ADR 0021). Apply schema migrations with **pinned Wrangler in CI** (do not run unbound `bunx wrangler` in the checkout — it rewrites lockfiles).
6. **APIs (Pages Functions):** Authenticated sync — report win(s), pull facts / projected streaks, merge-preview + merge-commit. Session via Clerk (ADR 0032). No leaderboards (ADR 0008); client-authored wins acceptable until that changes.
7. **Deletion:** GDPR path deletes all D1 win rows for `user_id` before Clerk user delete (ADR 0032 webhook).

## Consequences

- Schema + migration files land in-repo; CI applies to prod and shared preview D1.
- Merge UI is mandatory on first claim when local and remote both have streak data for any slot.
- Sign-out does not clear local cache (ADR 0032); re-sign-in may re-merge if local diverged offline — still via confirm sheet when needed.
- Future leaderboards would require anti-cheat / server validation beyond this ADR.
