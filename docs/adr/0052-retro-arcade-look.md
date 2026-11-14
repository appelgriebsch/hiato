# ADR 0052: Retro 80s arcade look replaces the current look

- **Status**: Proposed
- **Date**: 2026-11-13
- **Deciders**: Andreas Gerlach
- **Supersedes**: none (amends the visual values of ADR 0004 and ADR 0020; keeps ADR 0025)
- **Related issues**: #229, retro slices #269, #270, #271
- **Design source**: `docs/design/retro/spec.md` (UX Uma, locked 2026-11-13)

## Context

Andreas wants Hiato to look like an 80s arcade word game ("Cartridge & CRT"). Hiato is a learning tool first, so glosses, hints and accents must stay easy to read. The current look is a set of `@theme` tokens in `src/index.css`, pinned by `src/theme.test.ts`. Features, flows, routes and copy do not change.

## Decision

1. **Replace, not theme.** Retro replaces the current look in light ("Cartridge") and dark ("CRT night"). There is no toggle, no "Classic" option and no `data-theme`. The old token values are retired. Every token keeps its name. Six tokens are added: `edge`, `shadow`, `focus`, `coin`, `spark`, `scan`. `ink-faint` takes the `ink-muted` value (#229).
2. **Lives stay seeds** (ADR 0025), drawn as pixel seeds. There are no hearts.
3. **Sound cues, off by default.** A "Sound effects" switch on About controls them. It is stored in the guest-local key `hiato.sound` (`{ "v": 1, "on": boolean }`). Missing or invalid storage means Off. Cues use Web Audio oscillators only: no audio files, no autoplay, and never the only signal.
4. **The share card is retro** on the Share page and in the saved PNG. The saved PNG always uses the light palette. The share text is unchanged.
5. **The pixel logo is in-app only.** The favicon, PWA and app icons, apple-touch icon, OG banner and manifest icons do not change.
6. **Type.** Jersey 10 (SIL OFL 1.1) for short pixel labels, letters and numbers, never below 18.67px. Inter stays for all sentences. Jersey 10 is self-hosted under `public/fonts` and credited on About like Inter.
7. **Copy.** The only new strings are the Sound card ("Sound effects"; "Short arcade beeps for letters, misses and results. Everything also shows on screen."; "Off"/"On") and the Jersey 10 Typeface card. Andreas approved them on 2026-11-13.

## Options Considered

| Option | Pros | Cons |
| --- | --- | --- |
| Replace the look via token values (chosen) | One look to test and maintain; the existing token names carry it | Old look is gone; all visual baselines change |
| Opt-in retro theme | Users keep a choice | Two palettes to test, a new preference, more CSS; Andreas rejected it |
| Pixel font for all text | Strongest retro feel | Glosses and accents become hard to read; fails the learning goal |

## Consequences

- `src/index.css` and `src/theme.test.ts` change. The ADR 0041 Playwright baselines are regenerated.
- No new runtime dependencies. The precache grows by at most 32 KB.
- Sound adds one new local key and one module (`src/lib/sound.ts`).
- The work ships in three slices: the look, then the share card and sound in either order.
