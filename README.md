# Hiato

Mobile-first offline language word-guess PWA for learners (EN / PT / DE / ES, CEFR A1–C2).

## Status

Plan locked 2026-09-19. Architecture Decision Records live in `docs/adr/`.

Critical path: **G0** UX prototype → **T1** scaffold → **T2** playable daily EN A1 → **T3** langs → **T4** streaks → **T5** share card (this branch) → **T6** polish → **H1** prod harden.

```bash
bun run packs:check   # pack schema + spoiler rule
```

## Stack (locked)

Vite + TypeScript + React + Zustand + shadcn/ui + Tailwind + Bun + `bun:test` + `vite-plugin-pwa` (`registerType: 'prompt'`).

Hosting: Cloudflare Pages + Pages Functions `/api/health` stub. Branch previews = staging. Merge to `main` = production.

## Local development

Requires **Bun 1.4.2** (see `packageManager` / `.tool-versions`).

```bash
bun install --frozen-lockfile
bun run dev          # http://localhost:5173
bun run build        # → dist/
bun run preview
bun test             # optional smoke
```

Production-parity install / build:

```bash
bun install --frozen-lockfile && bun run packs:check && bun run build
```

## Cloudflare Pages

See [`docs/cloudflare-pages.md`](docs/cloudflare-pages.md). Summary:

- **Build command:** `bun install --frozen-lockfile && bun run packs:check && bun run build`
- **Output directory:** `dist`
- **Env (Production + Preview):** `BUN_VERSION=1.4.2`, `SKIP_DEPENDENCY_INSTALL=true`
- Commit **`bun.lock`** only; no npm/pnpm lockfiles

## License notes

Word packs ship with per-source attribution (license bands in `src/packs/licenses.ts` / `NOTICE`). Portuguese packs are CC-BY-SA at all levels; EN C1/C2 and DE/ES B2–C2 are CC-BY-SA; EN B2 is CEFR-J citation / CC0 (not share-alike).

UI and share-card typeface is self-hosted **Inter** (SIL Open Font License 1.1) — see `NOTICE` and `public/fonts/LICENSE.txt`. Share cards never load Google Fonts or a remote font CDN (ADR 0020).

## Docs

- `docs/adr/` — ADRs 0001–0024
- `docs/final-overview.md` — STE overview + tracer list
- `docs/cloudflare-pages.md` — CF Pages Bun ceremony
