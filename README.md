# Hiato

Mobile-first offline language word-guess PWA for learners (EN / PT / DE / ES, CEFR A1–B1).

## Status

Plan locked 2026-09-19. Architecture Decision Records live in `docs/adr/`.

Critical path: **G0** UX prototype → **T1** scaffold → **T2** playable daily EN A1 → … → **H1** prod harden.

## Stack (locked)

Vite + TypeScript + React + Zustand + shadcn/ui + Tailwind + Bun + `bun:test` + `vite-plugin-pwa` (`registerType: 'prompt'`).

Hosting: Cloudflare Pages + Pages Functions `/api/health` stub. Branch previews = staging. Merge to `main` = production.

## Local development

Requires **Bun 1.4.2** (see `packageManager` / `.tool-versions`).

```bash
bun install
bun run dev          # http://localhost:5173
bun run build        # → dist/
bun run preview
bun test             # optional smoke
```

Production-parity install:

```bash
bun install --frozen-lockfile && bun run build
```

## Cloudflare Pages

See [`docs/cloudflare-pages.md`](docs/cloudflare-pages.md). Summary:

- **Build command:** `bun install --frozen-lockfile && bun run build`
- **Output directory:** `dist`
- **Env (Production + Preview):** `BUN_VERSION=1.4.2`, `SKIP_DEPENDENCY_INSTALL=true`
- Commit **`bun.lock` only** — no npm/pnpm lockfiles

## License notes

Word packs ship with per-source attribution. Portuguese packs may use CC-BY-SA sources.

## Docs

- `docs/adr/` — ADRs 0001–0024
- `docs/final-overview.md` — STE overview + tracer list
- `docs/cloudflare-pages.md` — CF Pages Bun ceremony
