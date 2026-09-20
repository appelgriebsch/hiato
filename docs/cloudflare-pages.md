# Cloudflare Pages — Bun ceremony

Do **not** rely on Cloudflare’s `bun.lock` autodetection. Pin Bun explicitly.

## Build settings

| Setting | Value |
|--------|--------|
| Build command | `bun install --frozen-lockfile && bun run packs:check && bun run build` |
| Build output directory | `dist` |
| Root directory | `/` (repo root) |

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

`public/_headers` ships with the build:

- no-cache for `/`, `/index.html`, `sw.js`, `workbox-*.js`, `manifest.webmanifest`
- immutable long-cache for `/assets/*`

## Health stub

`functions/api/health.ts` → `GET /api/health` → `200 { "ok": true }`
