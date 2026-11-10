# ADR 0047: Cookieless Cloudflare Web Analytics, Production only

- **Status**: Accepted
- **Date**: 2026-11-09
- **Deciders**: Andreas Gerlach (approved cookieless Cloudflare Web Analytics on Production, 9 Nov 2026)
- **Supersedes**: none
- **Related issues**: #224

## Context

There is no usage data at all, so every Reach number on the roadmap is an estimate. We want daily visits and page views per screen on Production, without cookies, accounts, device storage, or anything that identifies a learner. Staging (branch preview deployments) must not report. One build artifact is deployed to both Production and Preview (ADR 0022/0042), so build-time gating cannot distinguish the environments; the runtime stage binding `HIATO_STAGE` (ADR 0021) is the only signal that differs, exposed by `/api/health`.

## Decision

Load the cookieless Cloudflare Web Analytics beacon (`https://static.cloudflareinsights.com/beacon.min.js`) from the client, only when `/api/health` reports `stage: "production"` and a site token is configured:

- `src/lib/analytics.ts` reads the site token from the build-time define `__HIATO_WEB_ANALYTICS_TOKEN__`, which `vite.config.ts` bakes from the `WEB_ANALYTICS_TOKEN` environment variable (a GitHub Actions variable, not committed; the token is public by design). An unset/empty variable keeps the beacon off on every environment. `initAnalytics()` runs once from `src/main.tsx`: it calls the existing `getHealth()`, and only on `production` with a non-empty token does it inject `<script defer src=".../beacon.min.js" data-cf-beacon='{"token":"..."}'>`. Any health failure (offline, staging 503 path) injects nothing, so offline plays are not counted. Note: CI builds once and ships the same `dist` to Production and Preview (ADR 0022), so the baked token is present in staging's bundle too — harmless, because the runtime stage gate still prevents the beacon from loading there.
- The beacon's built-in SPA tracking (History API `pushState`/`popstate`) reports each client-side route (`/`, `/language`, `/play`, `/share`, `/about`) as a page view, giving per-screen counts with no extra code.
- CSP (`public/_headers` `/*` and `PAGES_SECURITY_HEADERS` in `src/deploy/harden.ts`, kept equal by test) gains exactly two hosts: `script-src` allows `https://static.cloudflareinsights.com` (host, not path — Cloudflare serves versioned paths) and `connect-src` allows `https://cloudflareinsights.com` (manual snippet posts cross-origin to `/cdn-cgi/rum`). The CSP applies to both environments, which is harmless: on staging no beacon script is ever injected.
- The About page states what is counted: production-only, cookieless visits and page views per screen; no cookies, no device storage for tracking, nothing identifying; staging and offline play are not counted.

## Options Considered

| Option | Pros | Cons |
| --- | --- | --- |
| Client injects beacon only when `/api/health` says production (chosen) | Reuses the existing stage binding and health endpoint; `_routes.json` and the SPA fallback stay untouched; offline naturally uncounted | One extra same-origin fetch per load; beacon loads a moment after page load |
| Pages Function rewrites `index.html` on production | Beacon present in first HTML | Client routes (`/play`, `/share`, ...) are served by the `_redirects` SPA fallback and never pass a Function unless `_routes.json` includes `/*`, which breaks the documented Functions-vs-SPA invariants |
| Cloudflare dashboard auto-injection (edge) | Zero code | Cannot distinguish Production from Preview deployments; would count staging |
| Build-time gating via env var | None | The same `dist` artifact ships to Production and Preview (ADR 0022), so the flag is identical in both |
| Self-hosted beacon copy | Version pinning | Loses Cloudflare updates; hash-rot risk; extra bytes in the SW scope |

## Consequences

- Andreas adds the hiato site in the Cloudflare dashboard (Web Analytics, manual snippet) and sets the token as the `WEB_ANALYTICS_TOKEN` GitHub Actions repository variable (Settings → Secrets and variables → Actions → Variables); the deploy build bakes it into the bundle. Until it is set, the beacon stays off everywhere, so nothing is counted anywhere.
- `analytics.test.ts` covers: production+token injects once, staging/health-error/empty-token inject nothing, and the shipped CSP contains both beacon hosts. `harden.test.ts` locks the CSP additions. `copy.test.ts` locks the About wording.
- No cookies are introduced anywhere; `Permissions-Policy`, HSTS, and the rest of the `/*` security set are unchanged.
- Per-screen numbers appear in the Cloudflare Web Analytics dashboard per page path; weekly players per language/level still require reading the dashboard (share/play URLs carry no language in the path), which is out of scope for the beacon.
- E2E: the full-page About screenshot (`about-portrait.png`) changes because of the new privacy card; regenerate snapshots when running Playwright.
