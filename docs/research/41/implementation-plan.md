# Implementation plan — OS light/dark appearance

Date: 2026-09-22

The in-app UI follows `prefers-color-scheme` only. Dark appearance is a warm inverse of cream/ink. Share PNG stays cream/ink. Brand assets stay as they are.

Research: `docs/research/41/css-pwa-system-theme.md`
Decisions: `docs/research/41/decisions.md`

Experts consulted (Consultant, current workspace): `web-frontend-expert`, `ui-ux-expert`, `bun-expert`, `ci-cd-expert`. No expert for Cloudflare Pages; Pages intersection is headers/manifest only.

## Summary

Hiato is a cream/ink light shell (Tailwind v4 `@theme` in `src/index.css`, shadcn new-york with `cssVariables: false`). Surfaces use `bg-cream` **and** hardcoded `bg-white`. PWA `theme_color` and `index.html` theme-color are `#f7f6f3`. Canvas share hex is frozen in `src/lib/share-render.ts`. Prefs store only `lang` + `cefr`. CSP forbids inline script and style.

Work is CSS-only: remap token roles under `@media (prefers-color-scheme: dark)`, add `raised` and `accent-fg`, replace white surfaces, set first-paint metas. No JS theme store. No CI/workflow/wrangler change.

## Step-by-step

### 1. Tokens, first paint, chrome, contrast tests

1. In `src/index.css` `@theme` (top-level only), add `--color-raised: #ffffff` and `--color-accent-fg: #3d6b55`.
2. On `:root`, set `color-scheme: light dark`. Keep `body { background: var(--color-cream); color: var(--color-ink); }`.
3. After `@theme`, add unlayered:

   ```css
   @media (prefers-color-scheme: dark) {
     :root { /* hex from decisions.md */ }
   }
   ```

   Do not nest `@theme`. Do not remap `--color-white`. Do not add `bg-cream dark:bg-ink`.
4. Dark counterpart for `.motion-share-card:hover` shadow (`rgba(0,0,0,0.5)`), still honor `prefers-reduced-motion`.
5. `.text-kicker` uses `var(--color-accent-fg)`.
6. `index.html`:
   - `<meta name="color-scheme" content="light dark">`
   - `<meta name="theme-color" media="(prefers-color-scheme: dark)" content="#1c1b19">` **first**
   - existing unconditioned cream `theme-color` **last** (fallback)
   - keep `apple-mobile-web-app-status-bar-style` `default`
7. Leave `vite.config.ts` manifest `theme_color` / `background_color` `#f7f6f3`. Do not enable `pwaAssets`. Do not add `color_scheme_dark`.
8. Tests (bun:test, no new libs):
   - Parse `src/index.css`: every remapped color has a dark `:root` value; `@theme` is not nested under the media query.
   - WCAG 2.2 contrast helper on hex pairs for both palettes (4.5:1 text, 3:1 UI).
   - `src/deploy/harden.test.ts`: dual `theme-color`, `color-scheme` meta, CSP still without `unsafe-inline`, no inline `<script>`/`<style>` in `index.html`.
   - `copy.test.ts` still asserts `bg-cream`.
   - `prefs.test.ts`: extra `theme` key in JSON is ignored; return stays `{ lang, cefr }`.

Demo: on dark OS emulation, Home/Layout shell is warm dark; primary sage + white buttons unchanged; white cards still exist until step 2.

### 2. Raised surfaces, accent-fg, share split

Replace **surface** `bg-white` / `from-white` / `bg-white/50` / `bg-white/80` with `bg-raised` (and `/50` `/80` where needed):

- `src/components/ui/button.tsx` outline, `card.tsx`
- `src/components/ui/toast.tsx` → `bg-ink text-cream` (invert as a unit)
- `src/components/play/Keyboard.tsx` idle keys; wrong keys `text-ink` not `text-white`; correct keys stay `bg-accent text-white`
- `src/components/play/LetterGrid.tsx` empty cells
- `src/components/play/LearnerHint.tsx` (drop ink-tinted `shadow-[rgba(28,27,25,…)]` or use a dark-safe shadow)
- `src/pages/Play.tsx` result panel
- `src/pages/Language.tsx` unselected radios
- `src/components/PwaPrompt.tsx`
- `src/components/ShareCard.tsx` gradient and inner white → raised + `accent-soft`

Text that is sage **on a surface** (links, selected CEFR, secondary button `text-accent`, Home/About accent copy) uses `text-accent-fg`. Do not change `text-white` on `bg-accent` fills.

Share page: keep canvas path hex in `src/lib/share-render.ts`. Add caption that the saved image stays cream. Tests lock those hex constants and assert `share-render.ts` has no `prefers-color-scheme` / `matchMedia`.

Brand mark: no chip unless QA at 28–32px on Play looks sparse; then `rounded-lg` frozen cream (`#f7f6f3`, not remapped `bg-cream`). LivesIcons keep hardcoded `#f7f6f3` highlights.

Optional in this slice: 2px `accent-fg` focus ring on buttons/radios (3:1).

Demo: Language, Play (grid/keyboard/hint/result), Share on-screen card, PwaPrompt, About cards — no white islands. Export PNG still cream. Live OS toggle without reload.

## Challenges and mitigations

| Risk | Mitigation |
| --- | --- |
| Mixing `dark:` utilities with remapped tokens (inverse-inverse) | One strategy: remap. `dark:` only for a frozen brand chip. |
| Sage fill vs sage text cannot share one hex | `--color-accent` stays `#3d6b55`; `--color-accent-fg` for type. |
| Toast `bg-ink text-white` becomes light-on-light | `bg-ink text-cream`. |
| Shadows bound to remapped ink become light glows | Keep shadow RGB dark; rewrite ShareCard hover. |
| Cream splash then dark UI | Accepted v1; manifest stays one cream color. |
| `theme-color` `media` not Baseline | Tree order: dark media first, cream last. |
| CSP + class FOUC script | Stay CSS-only. |
| `copy.test.ts` / class asserts | Keep `bg-cream`; swap `bg-white` asserts to `bg-raised` where they exist. |
| Users think Share save is “wrong” | Caption: saved image stays cream. |

## Tests and validation

- bun:test token parse + contrast + harden metas + prefs ignore `theme` + share-render hex freeze.
- `bun run build` then `bun test` (existing CI). Optional: compiled `dist/assets/*.css` contains the dark media query (skip if `dist/` missing locally).
- Browser: DevTools `prefers-color-scheme` light/dark while on Home, Language, Play, Share; toggle without reload. Contrast on title, muted, accent links, selected radio, keys, toast. Cold load on dark OS (no cream flash after CSS). iOS Add to Home Screen status bar `default`. Android installed PWA chrome vs splash. Share PNG vs on-screen card.

No new CI job. No wrangler change. Do not run `bunx wrangler` in this checkout.
