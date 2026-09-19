# Cloudflare Pages — Bun ceremony

Do **not** rely on Cloudflare’s `bun.lock` autodetection. Pin Bun explicitly.

## Build settings

| Setting | Value |
|--------|--------|
| Build command | `cat bun.lock.p0 bun.lock.p1 bun.lock.p2 bun.lock.p3 > bun.lock && bun install --frozen-lockfile && bun run build` |
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

- Commit **`bun.lock.p0`…`p3`** (assembled to `bun.lock` in the build command).
- Do **not** commit `package-lock.json` or `pnpm-lock.yaml`.
- Pin via `packageManager` in `package.json` and `.tool-versions`.

## Headers

`public/_headers` ships with the build:

- no-cache for `sw.js`, `workbox-*.js`, `manifest.webmanifest`
- immutable long-cache for `/assets/*`

## Health stub

`functions/api/health.ts` → `GET /api/health` → `200 { "ok": true }`

## Lockfile split (temporary)

`bun.lock` is stored as `bun.lock.p0`…`p3` and assembled at the start of the CF build command. This is a temporary workaround for GitHub API payload limits when landing the lock via MCP. Prefer consolidating back to a single committed `bun.lock` when practical; until then keep the assemble prefix in the build command.
