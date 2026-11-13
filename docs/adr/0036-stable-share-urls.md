# ADR 0036: Stable spoiler-safe share URLs

- Status: Accepted (amended 2026-11-13, #226 — invite-to-play on daily share links)
- Date: 2026-10-02 (amended 2026-11-13)
- Deciders: Andreas Gerlach (via Product Priya)
- Epic: [#78](https://github.com/appelgriebsch/hiato/issues/78)
- Related issues: [#226](https://github.com/appelgriebsch/hiato/issues/226)
- References: ADR 0007 (Web Share + card; supersedes its "no stable share URLs" clause); ADR 0011 (Pages + Workers skeleton); ADR 0018 (Practice anti-spoiler); PR/issue lineage for offline-ready PWA (#104).

## Context

ADR 0007 shipped Web Share + generated share card without stable URLs (reserved Workers/D1). Share payload today lives only in React Router `location.state`, so refresh and cold `/share` lose the card. Clipboard text pastes site origin only. Epic #78 adds guest-friendly durable URLs that complement the PNG card without accounts (#64 stays parked) and without breaking offline-first install (#104).

## Decision

1. **Thin v1 encoding:** Client-only `base64url(JSON)` of the existing allowlist (`SHARE_CARD_KEYS`: lang, cefr, streak, dateKey, wordLength, won, mode). **Never** encode lemma, gloss, or answer. Forgeable stats URLs are accepted (same honesty as ADR 0007 cards). No HMAC, no opaque D1 ids in v1.

2. **Path:** Ship **`/share?p=…`** first (existing route; lowest SPA/SW/`_redirects` risk). Defer vanity **`/s/:token`** until a later tracer.

3. **Surface:** Hydrate the **Share / result** surface only. Do **not** treat the URL as invite-to-play (`/play`) in v1. Missing or corrupt `p=` → soft fail to the existing empty Share UX ("Nothing to share yet"), not a hard error wall. *Amended 2026-11-13 (#226): daily payloads do offer invite-to-play — see Amendment below. Practice payloads still do not.*

4. **Wire:** Keep PNG ShareCard / share-render. Append the stable URL to `formatShareText` and Web Share text so copy/share carries the deep link.

5. **Spoiler policy:** Daily shares may include `dateKey` + stats (Wordle-like; must not leak tomorrow's answer). Practice shares use the same allowlist, never lemma, and **distinct copy** so they do not look like a daily. Pocket and teacher (#79) stay out of viral URL scope.

6. **Offline / CSP:** Rely on existing SPA fallback (`_redirects`, VitePWA navigateFallback). Do not denylist `/share`. Client-only URLs need **no CSP change**. Defer per-result Open Graph (Workers) — keep static `og-banner.png`.

7. **Out of #78 v1:** Accounts (#64), friend graphs, leaderboards, push, accent (#75), B2–C2 ceiling (#77), teacher (#79), HMAC, opaque server ids, `/s/:token` vanity, per-result OG.

## Amendment (2026-11-13, #226) — invite-to-play on daily share links

Andreas approved reversing the v1 deferral of invite-to-play. This amends Decision 3 for **daily** payloads only; every other clause of this ADR stands.

### Amended decision

1. **Daily share cards offer invite-to-play.** When `/share?p=…` hydrates a payload with `mode: 'daily'`, the Share surface shows one primary CTA, "Play today's Daily · {LANG} {CEFR}" (`LANG_CODES`/`CEFR_CODES`). Practice payloads keep their distinct copy and get **no** play CTA — a Practice share is not today's Daily word (ADR 0018).
2. **Consent is the tap, never the open.** On tap only, the app runs `precacheSelectedLanguage(lang, cefr)`; on success it writes `hiato.prefs` via `setPrefs` and navigates to `/play?mode=daily`. On precache failure it shows an inline error and stays on the Share card. No prefs write and no navigation happen without the tap, and none before the pack load succeeds.
3. **The recipient plays their own today.** Play computes the device-local `dateKey` itself (ADR 0004). The token's `dateKey` stays display-only and is never used for word selection. An already-completed daily in that lang×CEFR shows the existing result card.
4. **Spoiler policy unchanged.** The token allowlist (`SHARE_CARD_KEYS`) still never carries lemma, gloss, or answer, and forgeable stats URLs stay accepted. The invite can only set a validated lang×CEFR pair (`isPackLang`/`isPackCefr`).

### Options Considered

| Option | Pros | Cons |
| --- | --- | --- |
| Client-only CTA on `/share`, prefs written on tap (chosen) | Reuses the Language-page pattern (`precacheSelectedLanguage` → `setPrefs` → `/play?mode=daily`); zero token/route/server change; consent is explicit | Switches the recipient's stored lang×CEFR (reversible via `/language`) |
| `/play?lang=&cefr=` override params, prefs untouched | Keeps prefs stable | Splits streak/history/pocket/daily state from prefs; violates "choice is set" |
| New `/invite` route or server-side invite | Cleaner URL semantics | New SW/`_redirects` surface; ADR 0036 v1 is client-only by decision |

### Consequences of the amendment

- Growth loop: every daily share can become the recipient's first game in that language and level (#226).
- Implementation is client-only: invite helper + CTA on the Share page + unit/copy tests. No token-format change, no new route, no `Play`/Workers/Pages change.
- The recipient's Home/streak view follows the new prefs; reversible via `/language`.

## Consequences

- ADR 0007's "No stable share URLs" clause is superseded; Web Share + card and forgeable-card culture remain.
- Recipients can open a spoiler-safe Share view offline once the app shell is cached; no server session required.
- Impl must add encode/decode + hydrate + text-wire + spoiler/matrix tests + SW/Pages smoke; PNG path stays.
- Later vanity `/s/:token`, signed URLs, or OG Workers need a new decision or amend.
