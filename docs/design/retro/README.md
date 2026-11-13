# Retro 80s arcade look: design source

This folder holds UX Uma's locked design for the retro look (ADR 0050).

- `spec.md` is the spec. It is the source of truth for tokens, type, icons, components, motion, sound and accessibility.
- `assets/retro-theme.css` holds the token values to copy into `src/index.css`.
- `assets/icons/*.svg` holds the 13 pixel icons (16×16 grid, rects only).
- `contrast.md` and `contrast.json` hold the computed WCAG ratios. `src/theme.test.ts` takes its pair rows from `contrast.json`.
- `mock/*.png` are the mockups at @2x. `mock/overview.png` shows all 13.

The spec also mentions `fonts/`, `tools/` and the mock HTML source. They are not copied here. Get the fonts from `@fontsource/jersey-10` (latin and latin-ext, weight 400).

Implementation: #269 (look), then #270 (share card) and #271 (sound).
