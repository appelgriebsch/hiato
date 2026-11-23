# Semantic mode prototype (#306)

Sample screenshots for a prototype of
[#306](https://github.com/appelgriebsch/hiato/issues/306) — *Semantic mode:
CEFR-levelled guess-by-meaning (research spike first)*.

Static, self-contained prototype in the locked retro design (ADR 0052): one
`index.html`, no build step, tokens and pixel utilities copied 1:1 from
`src/index.css`, icons inlined from `docs/design/retro/assets/icons/`, fonts
from `public/fonts/`.

## Screens

Open `index.html?s=<screen>` (served from the repo root, e.g. `bunx vite`):

| `s=` | What it shows |
|---|---|
| `home` | Home with the existing Daily card plus the pilot **Semantic Daily · EN B1** card (Pilot · #306 badge, Offline ready chip) |
| `round` | Fresh semantic round: clue card with today's meaning, POS + "no letters shown" chips, 6 seed lives, guess field, EN letter pad |
| `progress` | Mid-round: guess rows with proximity bars (LEAVE 87% Hot, DESERT 64% Warm, QUIT 21% Cold), lives lost, status line |
| `endcard` | Win EndCard: word revealed (ABANDON), gloss, synonym chips, example sentence, POS/IPA, family chips, guess history, share CTA |
| `share` | Spoiler-free share card: proximity squares only, never the answer |

## Shots

`shoot.mjs` serves the repo root on loopback and captures `shots/*.png`
(Playwright, @2x): mobile 390×844 light+dark, desktop 1280×800, short-landscape
844×390 for the round.

```
bun docs/design/semantic-prototype/shoot.mjs
```

| File | State |
|---|---|
| `shots/home-mobile-light.png` / `-dark` | Home, pilot card |
| `shots/home-desktop-light.png` | Home, desktop |
| `shots/round-mobile-light.png` | Round start, mobile |
| `shots/round-landscape-light.png` | Round, short-landscape two-column |
| `shots/round-desktop-light.png` | Round, desktop |
| `shots/progress-mobile-light.png` / `-dark` | Mid-round proximity feedback |
| `shots/endcard-mobile-light.png` | Win EndCard |
| `shots/share-mobile-light.png` / `share-desktop-light.png` | Spoiler-free share card |

## Design decisions (prototype)

- **Clue = the Pack gloss.** ADR 0023 already guarantees a gloss never contains
  the target word, so showing it in-round cannot spoil the answer string. The
  anti-spoiler rule from #306 is applied to the **answer, its letters/length,
  synonyms, example, POS/IPA/family** — all hidden until the round ends, and
  never on the share card (ADR 0018/0036 pattern). No letter tiles in-round:
  the mode trains meaning, not letters.
- **Feedback = semantic proximity per guess** (hot/warm/cold bar + %), one
  life per wrong guess (6 lives, ADR 0016), like the existing round loop.
- **Data is production-like**: seeded pilot word from `public/packs/en/b1.json`
  (ABANDON — gloss, synonyms, example, POS, IPA, family), date 2026-11-19,
  streak 12 + 1 freeze.

## Deliberately stubbed / out of scope

- **Proximity values are hand-picked** (`PROX` map in `index.html`). Real
  per-Pack embeddings are the #306 research spike against the ADR 0026
  offline cache budget — not built here.
- One pilot Pack only (EN B1), one seeded daily word (ADR 0003 pattern). No
  language/level picker changes, no persistence, no streak writes, no SW
  caching, no Playwright e2e — those follow the go/no-go note.
- Share card is a static mock; no Web Share / PNG export yet.

## Next steps (per #306 acceptance criteria)

1. Embedding-size spike vs ADR 0026 / SW cache budget → written go/no-go note.
2. If go: wire one Pack (EN B1) with the seeded daily semantic word.
3. Keep the anti-spoiler rule and spoiler-free share card as prototyped.
4. Offline once Pack + embeddings are cached; `bun test` + Playwright coverage.
