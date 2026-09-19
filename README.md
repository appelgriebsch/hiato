# Hiato

Mobile-first offline language word-guess PWA for learners (EN / PT / DE / ES, CEFR A1–B1).

## Status

Plan locked 2026-09-19. Architecture Decision Records live in `docs/adr/`.

Critical path: **G0** UX prototype → **T1** scaffold → **T2** playable daily EN A1 → … → **H1** prod harden.

## Stack (locked)

Vite + TypeScript + React + Zustand + shadcn/ui + Tailwind + Bun + `bun:test` + `vite-plugin-pwa` (prompt updates).

Hosting: Cloudflare Pages + Workers `/api/health` stub. Branch previews = staging. Merge to `main` = production.

## License notes

Word packs ship with per-source attribution. Portuguese packs may use CC-BY-SA sources.

## Docs

- `docs/adr/` — ADRs 0001–0022
- `docs/final-overview.md` — STE overview + tracer list
