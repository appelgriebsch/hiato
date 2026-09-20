# Cloudflare Pages — Bun ceremony

Do **not** rely on Cloudflare’s `bun.lock` autodetection. Pin Bun explicitly.

## Build settings

| Setting | Value |
|--------|--------|
| Build command | `bun install --frozen-lockfile && bun run packs:check && bun run build` |
| Build output directory | `dist` |
| Root directory | `/` (repo root) |

Apply the build command in the Cloudflare Pages dashboard (it is not in-repo). Preview and production should both run `packs:check` so a bad pack cannot deploy.

## Environment variables

Set on **Production** and **Preview**:

| Name | Value |
|------|--------|
| `BUN_VERSION` | `1.4.2` |
| `SKIP_DEPENDENCY_INSTALL` | `true` |

`SKIP_DEPENDENCY_INSTALL=true` skips CF’s default install so the build command owns `bun install --frozen-lockfile`.

## Lockfile

- Commit a single **`bun.lock`** (text format).
- Do **not** commit `package-lock.json` or `pnpm-lock.yaml`.
- Pin via `packageManager` in `package.json` and `.tool-versions`.

## Headers

`public/_headers` ships with the build:

- no-cache for `/`, `/index.html`, `sw.js`, `workbox-*.js`, `manifest.webmanifest`
- immutable long-cache for `/assets/*`

## Health stub

`functions/api/health.ts` → `GET /api/health` → `200 { "ok": true }`

## Pack URLs

`public/_redirects` lists `/packs/* → 404` **above** the SPA `/* /index.html 200` rewrite so a missing pack cannot return HTML 200 (Workbox `hiato-packs` caches 200). Existing `/packs/{lang}/{cefr}.json` files are still static assets.

Cloudflare Pages does not support 404 *rewrites* in `_redirects`, so `functions/packs/[[path]].ts` also serves JSON as-is and returns **404** for misses (Functions skip `_redirects`).
