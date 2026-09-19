# Cloudflare Pages — Bun ceremony

Do **not** rely on Cloudflare’s `bun.lock` autodetection. Pin Bun explicitly.

## Build settings

| Setting | Value |
|--------|--------|
| Build command | `bun install --frozen-lockfile && bun run build` |
| Build output directory | `dist` |
| Root directory | `/` (repo root) |

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
