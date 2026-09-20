# ADR 0026: Pre-prod pack size — ~400 lemmas per lang×CEFR

- Status: Accepted
- Date: 2026-09-20
- Deciders: Andreas Gerlach

## Context
v1 smoke packs were only dozens of lemmas — too thin for addictive play before production. Andreas set a pre-prod bar before H1/prod.

## Decision
Target **approximately 400 lemmas** per language×CEFR pack for **EN, PT, DE, ES × A1, A2, B1** (12 packs). Prefer redistribute-friendly sources; PT remains CC-BY-SA with attribution (ADR 0009). Same-language gloss/synonyms where available (ADR 0023). Quality over stuffing: skip proper nouns / unusable forms; `packs:check` must pass.

## Consequences
- Larger download for selected-language precache (ADR 0006) — still lazy for other langs.
- NOTICE/About must list expanded source attribution.
- Exact count may vary ± by source availability; aim ~400, not dozens.
