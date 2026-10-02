# ADR 0036: Stable spoiler-safe share URLs

- Status: Accepted
- Date: 2026-10-02
- Deciders: Andreas Gerlach (via Product Priya)
- Epic: [#78](https://github.com/appelgriebsch/hiato/issues/78)
- References: ADR 0007 (Web Share + card; supersedes its "no stable share URLs" clause); ADR 0011 (Pages + Workers skeleton); ADR 0018 (endless anti-spoiler); PR/issue lineage for offline-ready PWA (#104).

## Context

ADR 0007 shipped Web Share + generated share card without stable URLs (reserved Workers/D1). Share payload today lives only in React Router `location.state`, so refresh and cold `/share` lose the card. Clipboard text pastes site origin only. Epic #78 adds guest-friendly durable URLs that complement the PNG card without accounts (#64 stays parked) and without breaking offline-first install (#104).

## Decision

1. **Thin v1 encoding:** Client-only `base64url(JSON)` of the existing allowlist (`SHARE_CARD_KEYS`: lang, cefr, streak, dateKey, wordLength, won, mode). **Never** encode lemma, gloss, or answer. Forgeable stats URLs are accepted (same honesty as ADR 0007 cards). No HMAC, no opaque D1 ids in v1.

2. **Path:** Ship **`/share?p=…`** first (existing route; lowest SPA/SW/`_redirects` risk). Defer vanity **`/s/:token`** until a later tracer.

3. **Surface:** Hydrate the **Share / result** surface only. Do **not** treat the URL as invite-to-play (`/play`) in v1. Missing or corrupt `p=` → soft fail to the existing empty Share UX ("Nothing to share yet"), not a hard error wall.

4. **Wire:** Keep PNG ShareCard / share-render. Append the stable URL to `formatShareText` and Web Share text so copy/share carries the deep link.

5. **Spoiler policy:** Daily shares may include `dateKey` + stats (Wordle-like; must not leak tomorrow's answer). Practice/endless shares use the same allowlist, never lemma, and **distinct copy** so they do not look like a daily. Pocket and teacher (#79) stay out of viral URL scope.

6. **Offline / CSP:** Rely on existing SPA fallback (`_redirects`, VitePWA navigateFallback). Do not denylist `/share`. Client-only URLs need **no CSP change**. Defer per-result Open Graph (Workers) — keep static `og-banner.png`.

7. **Out of #78 v1:** Accounts (#64), friend graphs, leaderboards, push, accent (#75), B2–C2 ceiling (#77), teacher (#79), HMAC, opaque server ids, `/s/:token` vanity, per-result OG.

## Consequences

- ADR 0007's "No stable share URLs" clause is superseded; Web Share + card and forgeable-card culture remain.
- Recipients can open a spoiler-safe Share view offline once the app shell is cached; no server session required.
- Impl must add encode/decode + hydrate + text-wire + spoiler/matrix tests + SW/Pages smoke; PNG path stays.
- Later vanity `/s/:token`, signed URLs, or OG Workers need a new decision or amend.
