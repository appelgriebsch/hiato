# ADR 0031: MIT for application source

- Status: Accepted
- Date: 2026-09-27
- Deciders: Andreas Gerlach

## Context
The repository had pack, font, and dependency notices (`NOTICE`, ADR 0009, ADR 0020, ADR 0029) and no license for Hiato’s own source. A single license on the whole tree would mis-label share-alike lemma lists and the SIL font.

## Decision
License original application source, documentation, and brand assets under the MIT License (`LICENSE`, copyright Andreas Gerlach). `package.json` `license` is `MIT`.

Keep existing terms on materials that MIT cannot replace:

- Pack JSON under the `license` field in each file (CEFR-J Wordlist terms for EN A1–B2, otherwise CC-BY-SA-4.0).
- `scripts/data/en-easiest-cefr.json` and `scripts/data/hint-stem-cache.json` under their source terms (CEFR-J citation and CC-BY-SA-4.0).
- `public/fonts/` under the SIL Open Font License 1.1.

Build-time Hunspell dictionaries stay devDependencies and are not part of the MIT grant. `NOTICE` states the boundary.

## Consequences
- Downstream reuse of `src/`, `functions/`, and Hiato-authored scripts follows MIT.
- Redistributing a CC-BY-SA lemma list still requires CC-BY-SA-4.0, attribution, and share-alike on that list.
- Rejected: one MIT grant over packs and fonts; a non-commercial license; leaving the source unlicensed.
