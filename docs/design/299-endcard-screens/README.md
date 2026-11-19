# #299 EndCard enrichment — sample screens

Static prototype screens for [issue #299](https://github.com/appelgriebsch/hiato/issues/299)
(EndCard enrichment: POS + word family (+ IPA), example sentences for C1/C2 Packs).

- `*.png` — rendered screens at @2x (390×844 portrait unless noted; `05` is 900×420 short-landscape).
- `style.css` / `render.ts` — the prototype source: hand-mirrored ADR 0052 tokens/components
  from `src/index.css`, real pack lemmas (PT A2 `CARTÃO`, EN C1 `EXUDE`, EN C2 `ENVISAGE`),
  rendered with headless Chromium. Fonts are the self-hosted ones from `public/fonts/`
  plus a system fallback for IPA glyphs; not committed here.

| File | Screen |
|---|---|
| `overview.png` | Contact sheet of all six |
| `01-win-pt-a2.png` | Win · PT A2 · light — POS chip + IPA + example + synonyms + word family |
| `02-loss-en-c1.png` | Loss · EN C1 · light — new C1 example sentence |
| `03-win-en-c2-dark.png` | Win · EN C2 · dark theme |
| `04-in-round-pt-a2.png` | In-round — anti-spoiler proof (no POS/IPA/family/example before finish) |
| `05-win-pt-a2-short-land.png` | Win · short-landscape — two-column EndCard |
| `06-loss-en-c1-legacy.png` | Loss · EN C1 · current production (no new fields yet) |
