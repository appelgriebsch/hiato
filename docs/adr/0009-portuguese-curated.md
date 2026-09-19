# ADR 0009: Portuguese lexicon — curated open sources (CC-BY-SA OK)

- Status: Accepted
- Date: 2026-09-19
- Deciders: Andreas Gerlach

## Context
No clean open CEFR PT list matching EN/DE/ES options. Andreas chose curated PT from online sources (Wiktionary path) and confirmed CC-BY-SA attribution + share-alike is acceptable.

## Decision
Curate PT lemmas from openly licensed sources (Wiktionary-derived frequency + heuristic/manual CEFR banding). Ship in-app attribution. Treat redistributed packs as CC-BY-SA where required.

## Consequences
- Not raw Wikipedia article dumps — Wiktionary/frequency + curation.
- EN/DE/ES packs must follow each source’s license; document in `NOTICE` / About.
- Legal/attribution copy is part of MVP, not polish.
