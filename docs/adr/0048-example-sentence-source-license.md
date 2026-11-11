# ADR 0048: Example sentence source and license — Tatoeba (CC-BY 2.0 FR) + original Mistral-generated fallback

- **Status**: Accepted
- **Date**: 2026-11-11
- **Deciders**: Andreas Gerlach
- **Supersedes**: none (ADR 0043 deferred this decision)
- **Related issues**: #225, #246, #247, #248

## Context

Issue #225 wants one example sentence per word on the EndCard, in the pack language, credited on About with its license. ADR 0043 deliberately avoided a pack schema change; #225 now pays that cost. The sentence source was unverified in the issue. Tatoeba (tatoeba.org) releases its textual sentences under CC-BY 2.0 FR: reuse is allowed with attribution — stating that sentences are from Tatoeba, linking https://tatoeba.org, and naming the license. This is the same model Clozemaster uses. The repo already generates original learner copy (glosses, synonym chips) with an LLM and treats it as original Hiato content, and already credits third-party data per pack (ADR 0029).

## Decision

Hybrid source, per the 2026-11-11 grill:

1. **Primary: Tatoeba sentences, CC-BY 2.0 FR.** A build-time script downloads the per-language Tatoeba dumps and selects one sentence per lemma (whole-word match, shortest/cleanest, profanity guard and denylist reuse). Every pack that ships a Tatoeba sentence credits Tatoeba in `attribution`/`license`, About shows one "Example sentences" card (Tatoeba, CC-BY 2.0 FR, link), and NOTICE/THIRD-PARTY.md carry the same line.
2. **Fallback: original Mistral-generated sentences** (Mistral AI, `mistral-large-4-0`, via `MISTRAL_API_KEY`) when no Tatoeba sentence qualifies. These are original Hiato copy and need no external credit.
3. **Level gate: Mistral CEFR check per sentence.** Every candidate — Tatoeba or generated — must pass a Mistral check that the sentence stays within the pack's CEFR level (A1–B1 must stay within level, same standard as glosses per ADR 0030). Failures are rejected, not patched. `packs:check` enforces the gate log.

## Options Considered

| Option | Pros | Cons |
| --- | --- | --- |
| Tatoeba only | Real sentences, proven model | Gaps for rare lemmas; level fit unverified without a gate |
| Original Mistral-generated only (chosen fallback) | Zero licensing surface; level-promptable | Model quality risk at A1–B1; needs the CEFR gate anyway |
| **Hybrid Tatoeba + Mistral (chosen)** | Best sentence where one exists; original copy fills gaps; one gate covers both | Two source kinds to credit and maintain |
| Other corpora (OpenSubtitles, CEFRLex, Tatoeba audio) | — | OpenSubtitles text licensing murky; CEFRLex all-rights-reserved (already rejected in ADR 0029); audio out of scope |

## Grill decisions (2026-11-11, Andreas)

1. **Hybrid source.** Tatoeba and our own LLM.
2. **Pilot then widen.** EN + DE A1–B1 first, then all 36 packs.
3. **LLM CEFR check per sentence** as the A1–B1 level gate.

## Consequences

- Pack JSON gains `example?: string` per lemma (ADR 0049); pack `version` bumps when examples land.
- Pack size grows roughly 30–60 bytes per lemma (~+25–35% per pack); selected-language precache only (ADR 0006), size delta reported in #248.
- About/NOTICE/THIRD-PARTY credit Tatoeba CC-BY 2.0 FR wherever a Tatoeba sentence ships.
- CC-BY attribution is aggregate (Tatoeba + license + link), the attribution model Tatoeba's own FAQ endorses.
