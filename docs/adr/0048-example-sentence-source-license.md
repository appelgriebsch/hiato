# ADR 0048: Example sentence source and license — Tatoeba (CC-BY 2.0 FR) + original xAI-generated fallback

- **Status**: Accepted
- **Date**: 2026-11-11
- **Deciders**: Andreas Gerlach
- **Supersedes**: none (ADR 0043 deferred this decision)
- **Related issues**: #225, #246, #247, #248, #250, #267

## Context

Issue #225 wants one example sentence per word on the EndCard, in the pack language, credited on About with its license. ADR 0043 deliberately avoided a pack schema change; #225 now pays that cost. The sentence source was unverified in the issue. Tatoeba (tatoeba.org) releases its textual sentences under CC-BY 2.0 FR: reuse is allowed with attribution — stating that sentences are from Tatoeba, linking https://tatoeba.org, and naming the license. This is the same model Clozemaster uses. The repo already generates original learner copy (glosses, synonym chips) with an LLM and treats it as original Hiato content, and already credits third-party data per pack (ADR 0029).

## Decision

Hybrid source, per the 2026-11-11 grill, amended 2026-11-13 (#267):

1. **Primary: Tatoeba sentences, CC-BY 2.0 FR.** A build-time script downloads the per-language Tatoeba dumps and selects one sentence per lemma (whole-word match, shortest/cleanest, profanity guard and denylist reuse). Every pack that ships a Tatoeba sentence credits Tatoeba in `attribution`/`license`, About shows one "Example sentences" card (Tatoeba, CC-BY 2.0 FR, link), and NOTICE/THIRD-PARTY.md carry the same line.
2. **Fallback: original xAI-generated sentences** (`scripts/xai-chat.ts`, model `grok-4.7`, `reasoning_effort` `medium`, via `XAI_API_KEY` or `~/.grok/auth.json`; `XAI_MODEL` and `XAI_REASONING_EFFORT` override) when no Tatoeba sentence qualifies. These are original Hiato copy and need no external credit. New gate-log rows record source `xai`.
3. **Level gate: xAI CEFR check per sentence.** Every candidate — Tatoeba or generated — must pass an xAI check that the sentence stays within the pack's CEFR level (A1–B1 must stay within level, same standard as glosses per ADR 0030). Failures are rejected, not patched. `packs:check` enforces the gate log. Source `mistral` stays an accepted legacy value so rows written before this amendment still pass; the log is not rewritten.

## Options Considered

| Option | Pros | Cons |
| --- | --- | --- |
| Tatoeba only | Real sentences, proven model | Gaps for rare lemmas; level fit unverified without a gate |
| Original xAI-generated only (chosen fallback) | Zero licensing surface; level-promptable | Model quality risk at A1–B1; needs the CEFR gate anyway |
| **Hybrid Tatoeba + xAI (chosen)** | Best sentence where one exists; original copy fills gaps; one gate covers both | Two source kinds to credit and maintain |
| Other corpora (OpenSubtitles, CEFRLex, Tatoeba audio) | — | OpenSubtitles text licensing murky; CEFRLex all-rights-reserved (already rejected in ADR 0029); audio out of scope |

## Grill decisions (2026-11-11, Andreas)

1. **Hybrid source.** Tatoeba and our own LLM.
2. **Pilot then widen.** EN + DE A1–B1 first, then all 36 packs. *Amended 2026-11-12 (Andreas): widen to the 24 A1–B2 packs only; C1/C2 ship no examples (ADR 0049 §3, #248).*
3. **LLM CEFR check per sentence** as the A1–B1 level gate.

## Amendment (2026-11-13, #267)

The client moves from Mistral AI back to xAI. This is a forward change, not a revert of #251. Retries, the 120 s timeout, resume, the content normalizer, and the example-sentence pipeline stay. `top_p` is dropped; only Mistral required it. The 2026-11-12 amendment had picked `mistral-small-latest` (`MISTRAL_MODEL` to override) because `mistral-large-4-0` was still in preview and hung or returned 502 on every CI call in run 43222663925. Scripts now run locally with `XAI_API_KEY`. The pack workflows stay deleted. Older generated entries were made with Mistral AI and keep source `mistral`.

## Consequences

- Pack JSON gains `example?: string` per lemma (ADR 0049); pack `version` bumps when examples land.
- Pack size grows roughly 30–60 bytes per lemma (~+25–35% per pack); selected-language precache only (ADR 0006), size delta reported in #248.
- About/NOTICE/THIRD-PARTY credit Tatoeba CC-BY 2.0 FR wherever a Tatoeba sentence ships.
- CC-BY attribution is aggregate (Tatoeba + license + link), the attribution model Tatoeba's own FAQ endorses.
