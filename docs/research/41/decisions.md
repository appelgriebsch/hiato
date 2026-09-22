# Decisions — system light/dark theme

Date: 2026-09-22
Source: brainstorm grilling for OS-dependent light/dark appearance.

## OS appearance only

**Chosen:** The in-app UI follows `prefers-color-scheme` only. No Light / Dark / System control, and no theme field in `hiato.prefs`.

**Why:** The request is system-theme dependent. CSS media in the bundled stylesheet first-paints with the OS and does not need an inline `head` script. Current Pages CSP (`script-src 'self'`; `style-src 'self'`) would block that script.

**Rejected:** In-app override stored in localStorage (needs class strategy + blocking script or CSP change).

## Share PNG stays cream/ink

**Chosen:** Exported share images from `src/lib/share-render.ts` keep the existing cream/ink hex palette. The on-screen `ShareCard` follows the OS.

**Why:** The PNG leaves the app. A dark bitmap in a light Messages/WhatsApp thread reads as a screenshot, not a brand card.

**Rejected:** Painting the PNG from the current OS appearance at export time.

## Existing brand mark and icons

**Chosen:** Keep `public/brand/*` and PWA PNG icons as they are (sage on cream tiles). Do not ship a dark-tuned mark or dual maskable set in this effort.

**Why:** The mark already reads as a badge. Dual assets add splash/PWA work for little v1 gain. If the mark fails contrast on the dark shell, wrap it in a cream chip rather than new artwork.

**Rejected:** Separate dark mark / icon set.

## Warm inverse palette

**Chosen:** Dark appearance is a warm inverse of cream/ink (deep warm gray surface, light ink). Sage accent stays; lightness is retuned so text meets WCAG 2.2 AA 4.5:1 and UI components 3:1.

**Why:** Same product character as the current cream shell.

**Rejected:** True-black OLED; cool slate.

## CSS token remap (not class strategy)

**Chosen:** Keep Tailwind v4’s default `dark:` (`prefers-color-scheme`). Reassign `--color-*` on `:root` inside `@media (prefers-color-scheme: dark)`. Add `--color-raised` (cards/keys) and `--color-accent-fg` (sage text/links). Do not remap Tailwind `white`. Do not nest `@theme` under the media query.

**Why:** Existing `bg-cream` / `text-ink` utilities flip with the OS. `text-white` on sage fills must stay light-on-accent. Class-on-`html` plus a blocking `head` script is blocked by CSP (`script-src 'self'`).

**Rejected:** `dark:bg-ink` on every class; `@custom-variant dark` class strategy; `next-themes`; remapping `--color-white`.

## First paint and PWA chrome

**Chosen:** `<meta name="color-scheme" content="light dark">` plus `color-scheme: light dark` on `:root`. Dual `<meta name="theme-color">`: dark + `media="(prefers-color-scheme: dark)"` first in tree order, unconditioned cream last. Manifest `theme_color` / `background_color` stay `#f7f6f3`. Keep `apple-mobile-web-app-status-bar-style` `default`. Do not ship WD `color_scheme_dark` (vite-plugin-pwa 1.3.0 types have no such member).

**Why:** HTML `theme-color` without `media` always matches; if cream is first, the dark meta never wins. Splash may stay cream until CSS loads.

**Rejected:** Inline `head` script; `black` / `black-translucent` status bar; plugin bump for `color_scheme_dark`.

## Dark hex (warm inverse)

From the UI consult. Light values stay as in `src/index.css` `@theme`.

| Role | Token | Dark |
| --- | --- | --- |
| surface | `--color-cream` | `#1c1b19` |
| raised | `--color-raised` | `#2a2824` (light: `#ffffff`) |
| wash / hover | `--color-cream-dark` | `#24221e` |
| ink | `--color-ink` | `#f3f1ec` |
| ink-muted | `--color-ink-muted` | `#b8b4aa` |
| ink-faint | `--color-ink-faint` | `#a8a49a` |
| line | `--color-line` | `#6a655c` |
| accent fill | `--color-accent` | `#3d6b55` (unchanged) |
| accent text | `--color-accent-fg` | `#8fbfa3` (light: `#3d6b55`) |
| accent-soft | `--color-accent-soft` | `#24352c` |
| accent-mid | `--color-accent-mid` | `#4e7d64` |
| helped | `--color-helped` | `#2f4538` |
| danger | `--color-danger` | `#e09288` |
| danger-soft | `--color-danger-soft` | `#3a2a28` |
| wrong | `--color-wrong` | `#5a564e` |

Contrast must meet WCAG 2.2 AA: text 4.5:1, UI 3:1. `ink-faint` as caption is classified in tests (do not silently drop below 4.5:1 for body text).
