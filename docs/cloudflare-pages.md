# Cloudflare Pages — Bun ceremony

Do **not** rely on Cloudflare’s `bun.lock` autodetection. Pin Bun explicitly.

## Build settings

| Setting | Value |
|--------|--------|
| Build command | `bun install --frozen-lockfile && bun run packs:check && bun run build` |
| Build output directory | `dist` |
| Root directory | `/` (repo root) |

The build command lives in the Cloudflare Pages dashboard (it is not applied by merging this file). Edit **Production and Preview** on merge so both environments run `packs:check`. GitHub CI `build-test` also runs `packs:check`; a Pages-only rebuild would not. Do **not** run `scripts/expand-packs.ts` or call xAI on Pages.

## Environment variables

Set on **Production** and **Preview**:

| Name | Value |
|------|--------|
| `BUN_VERSION` | `1.4.2` |
| `SKIP_DEPENDENCY_INSTALL` | `true` |

`SKIP_DEPENDENCY_INSTALL=true` skips CF’s default install so the build command owns `bun install --frozen-lockfile`.

`packs:check` is the Hunspell / name / synonym / same-language-gloss gate (ADR 0030). The command lives in the Cloudflare Pages dashboard — edit **Production and Preview** on merge so a main deploy cannot publish packs that skipped GitHub `build-test`. Do **not** run `scripts/expand-packs.ts` or call xAI on Pages.

Learner pack JSON is revalidated (`Cache-Control: public, max-age=0, must-revalidate` on `/packs/*` in `public/_headers`).

## Lockfile

- Commit a single **`bun.lock`** (text format).
- Do **not** commit `package-lock.json` or `pnpm-lock.yaml`.
- Pin via `packageManager` in `package.json` and `.tool-versions`.

## Headers

`public/_headers` ships with the build. Tests in `src/deploy/harden.test.ts` lock the rules.

Cache:

- no-cache for `/`, `/index.html`, `sw.js`, `workbox-*.js`, `manifest.webmanifest`
- `public, max-age=0, must-revalidate` for `/packs/*`
- immutable long-cache for `/assets/*`

Security on `/*` (more specific cache rules still win for `Cache-Control`):

- `X-Content-Type-Options: nosniff`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `X-Frame-Options: DENY`
- `Permissions-Policy` with camera, microphone, geolocation, and payment disabled
- `Strict-Transport-Security: max-age=31536000; includeSubDomains`
- `Content-Security-Policy` locked to `'self'` (same-origin scripts, styles, fonts, workers; `frame-ancestors 'none'`; no `unsafe-inline` or `unsafe-eval`)

## Bindings

`wrangler.toml` is the Pages Functions binding source (ADR 0021). Top-level `[vars]` are production. `[env.preview.vars]` must override them. Pages only has Production and Preview environments; the preview env's `HIATO_STAGE` value is `staging`.

| Binding | Production | Preview |
| --- | --- | --- |
| `HIATO_STAGE` | `production` | `staging` |

Those two values are not equal. Do not run `bunx wrangler` inside this checkout; it rewrites `package.json` and `bun.lock`.

## Health stub

`functions/api/health.ts` → `GET /api/health`

- `200 { "ok": true, "stage": "production" | "staging" }` when `HIATO_STAGE` is that environment's binding
- `503 { "ok": false }` when the binding is missing or any other value

## Rollback (`hiato-production`)

Name: `hiato-production`. Project: `hiato`.

Cloudflare Pages rolls production back only to an earlier successful production deployment. Preview deployments are not valid rollback targets. The target is the newest successful production deployment older than the one currently serving (`selectRollbackTarget` in `src/deploy/harden.ts`). A newer production deployment is not a target. If no deployment is marked current, there is no target.

Dashboard: Pages project `hiato` → Deployments → previous successful production deployment → **Rollback to this deployment**.

API: `POST /accounts/{account_id}/pages/projects/hiato/deployments/{deployment_id}/rollback`

## Pack URLs

`functions/packs/[[path]].ts` is the **only** Pages guarantee that a missing `/packs/*` URL is **404** (not HTML). Cloudflare documents 404 rewrites in `_redirects` as unsupported; Functions skip `_redirects`, and the SPA rule `/* /index.html 200` would otherwise poison `hiato-packs`.

Do not exclude `/packs/*` from Functions. Existing `/packs/{lang}/{cefr}.json` files are still static assets when present. The Workbox runtime cache also refuses non-JSON 200s (`cacheWillUpdate`).

Assert on preview: `/packs/en/a1.json` → 200 JSON; a missing pack → 404 non-HTML.

## Stable share URLs (`/share?p=…`) — offline smoke (ADR 0036 / #110)

Client-only share deep links use the existing SPA shell. **No CSP change** and **no SW rewrite** beyond confirming the denylist does not block `/share`.

Smoke checklist (preview or local `vite preview` + installed PWA):

1. `public/_redirects` has `/* /index.html 200` — cold `/share?p=…` returns the app shell (200 HTML), not a Pages 404.
2. VitePWA `workbox.navigateFallback` is `index.html`; `navigateFallbackDenylist` lists `/api/`, `/packs/`, `og-banner.png`, and extensioned static files only. **Do not denylist `/share`.**
3. Installed PWA: open `/share?p=<valid-token>` offline after a prior visit — Share card hydrates; corrupt `p=` soft-fails to “Nothing to share yet.”
4. Confirm `/share` is **not** treated as invite-to-play and does **not** force the Language wall.

Unit coverage: `src/lib/share-url.test.ts` (“SUR-sw-pages”).
