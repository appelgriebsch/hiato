# ADR 0032: Optional social login via Clerk

- Status: Accepted
- Date: 2026-09-28
- Deciders: Andreas Gerlach
- Supersedes: “no accounts” parts of `docs/draft-plan.md` and `docs/final-overview.md` (v1 product copy). Does **not** supersede ADR 0008 (no leaderboards).
- Amends: ADR 0011 (Pages Functions grow beyond health for auth/session); ADR 0021 (fixed staging OAuth host + preview secrets); CSP / SW notes in `docs/cloudflare-pages.md`.

## Context

Hiato is guest-first and offline-capable. Streaks live in `localStorage` (`src/lib/streaks.ts`). Learners want optional cross-device streak continuity without making auth a gate to play. Grill-me 2026-09-28 locked Clerk + Apple / Google / X, soft CTAs, no email in UI, IdP avatar URL only, GDPR delete path, and canonical auth origins.

## Decision

1. **Identity provider:** Clerk. Social IdPs only: **Apple, Google, X**. No password/email-first UI. Do not collect or display email beyond what the IdP stores; **no email in Hiato UI**.
2. **Avatar:** IdP profile image URL only (Clerk user object). No R2 avatar upload in v1. Prefer **no D1 profile copy** — session/client reads Clerk user (display name / image URL as needed).
3. **Play never awaits auth.** Guest / offline `localStorage` remains source of record until the learner optionally signs in. Soft CTA only: Settings, post-daily-win, and when visible streak ≥ 3.
4. **Sign-out** keeps local streaks (localStorage unchanged as offline cache). After a successful claim/merge, localStorage remains an **offline cache of the claimed account** (grill 4B), not a second SoR.
5. **Origins:** Canonical production auth origin `https://hiato.appelgriebsch.org`. Fixed staging OAuth host (e.g. `staging.hiato.pages.dev` or equivalent stable alias) — not per-PR preview URLs for IdP redirect allowlists.
6. **Server:** Pages Functions verify Clerk session on `/api/auth/*` (and streak APIs in ADR 0033). SW already denylists `/api/` navigations; do **not** runtime-cache authenticated APIs. CSP may widen for Clerk scripts/frames/connect (update `public/_headers` + harden tests).
7. **GDPR:** On account delete — wipe D1 wins for `user_id` first, then delete Clerk user. Handle Clerk `user.deleted` webhook with retries/idempotency.

## Consequences

- New Clerk apps / secrets on Production and Preview (Pages secrets separate). Staging OAuth host must be registered with Apple/Google/X + Clerk.
- Client session plumbing (Clerk React or equivalent) behind soft CTAs; guest path unchanged.
- Impl must ship privacy/About copy covering optional account, IdPs, streak sync, and deletion.
- Streak persistence schema and merge rules are ADR 0033.
