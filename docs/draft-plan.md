# Draft implementation plan — language word-guess PWA

Working title: **hiato** (private GitHub repo)
Date: 2026-09-19
Status: Draft for Ask Avery Plan review

## Goal
Mobile-first offline-installable PWA: CEFR-leveled word guessing (gap fill / soft hangman) for EN, PT, DE, ES. Daily + streaks primary; endless practice secondary. Share achievements via Web Share card. Host on Cloudflare Pages with Workers skeleton.

## Locked decisions (ADRs 0001–0012)
- Vite + TS + React + Zustand + shadcn + Tailwind; Bun; vite-plugin-pwa (prompt updates)
- Daily local-midnight; accents distinct + soft diacritic hint; NFC/grapheme clusters
- Precache selected language packs; lazy other languages
- Web Share + card; no accounts; no leaderboards v1
- PT curated open sources; CC-BY-SA attribution OK
- UX Uma prototype before Impl Ivy
- CF Pages + `src/api/` skeleton; private repo (name TBD)

## Architecture (lean)
```
[PWA React client]
  ├── game engine (pure TS): gap mask, lives, daily seed, streaks
  ├── packs loader: fetch/cache JSON by lang+CEFR
  ├── UI: onboarding, level/lang, play, results, share card, About/licenses
  ├── src/api/: thin client seam (unused or health ping in v1)
  └── SW via vite-plugin-pwa
[Cloudflare Pages] static assets + _headers
[Workers / Pages Functions] skeleton only (health / future share)
```

## Word packs
- Schema: `{ version, lang, cefr, license, attribution[], lemmas: [{ word, gloss_en?, pos? }] }`
- EN/DE/ES: prefer redistribute-friendly CEFR sources (CEFR-J/CEFRLex/wordhoard path) with NOTICE
- PT: Wiktionary-frequency + curated CEFR bands; CC-BY-SA NOTICE
- Build script (Bun) to generate packs into `public/packs/`

## Game rules (v1)
- Pick random/daily lemma at selected lang+CEFR
- Show grapheme gaps (constrain revealed pattern; not full free hangman cruelty)
- Soft lives 5–6; language letter pad; post-reveal gloss
- Daily seed: hash(lang|cefr|localDate|salt)
- Persist: selected lang, streaks, settings, cached packs (IDB)

## Critical path
1. Private repo `hiato` create (Andreas / handoff)
2. UX Uma clickable prototype (mobile-first, shadcn)
3. Scaffold Vite app + PWA + CF Pages Bun build + Workers skeleton
4. Pack pipeline + EN smoke pack → playable tracer
5. Full langs + daily/streaks + share card + licenses About
6. Deploy Drew: Pages+Workers+headers+Bun

## Tracer-bullet tickets (proposed)
T1: Repo scaffold + PWA install shell + CF Pages Bun build + Workers health stub (empty play screen)
T2: Pack schema + one EN A1 pack + loader/cache + letter-gap engine playable offline
T3: Lang/CEFR select + precache selected lang + DE/ES/PT packs (PT curated v0) + attribution About
T4: Daily seed + streaks + endless mode + soft lives/hints
T5: Results + Web Share/clipboard share card
T6: Polish from Uma prototype (motion, onboarding, addictive loop) + iOS install hint

## Out of scope v1
Accounts, leaderboards, stable share URLs, push, native stores, SSR, Bun-as-CF-runtime unless Drew approves later.

## Risks
- Bun on CF Pages misconfig
- Pack license mistakes
- Accent unfairness / compound words
- SW update sticky state
- iOS Web Share limits
- Fakeable share cards
