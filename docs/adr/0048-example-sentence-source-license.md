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
2. **Pilot then widen.** EN + DE A1–B1 first, then all 36 packs.
3. **LLM CEFR check per sentence** as the A1–B1 level gate.

## Amendment (2026-11-13, #267)

The client moves from Mistral AI back to xAI. This is a forward change, not a revert of #251. Retries, the 120 s timeout, resume, the content normalizer, and the example-sentence pipeline stay. `top_p` is dropped; only Mistral required it. The 2026-11-12 amendment had picked `mistral-small-latest` (`MISTRAL_MODEL` to override) because `mistral-large-4-0` was still in preview and hung or returned 502 on every CI call in run 43222663925. Scripts now run locally with `XAI_API_KEY`. The pack workflows stay deleted. Older generated entries were made with Mistral AI and keep source `mistral`.

## Amendment (2026-11-12, #247 reopen)

Staging verification of 248b588 found Tatoeba stock persona names (Tom, Mary, Sami, …) in 395 shipped A1–B2 examples, wrong-sense sentences (DE A1 `JACK` = "Jack stand früh auf.", FR A1 `PARTIE` = "Elle est partie."), and unsuitable content ("Tom è morto.", "Tom had an affair."). Changes:

1. **Stock-name guard.** `scripts/data/tatoeba-stock-names.txt` is a small curated list of Tatoeba stock persona names. A candidate sentence containing one of these as a capitalized token **at any position, including sentence-initial**, is rejected. The lemma itself is exempt, so a lemma that equals a stock name (e.g. `JACK`) can still receive an example. The big `lemma-names.txt` mid-sentence check is unchanged and is **not** applied to the first token (many common words, e.g. German nouns, are on it). `packs:check` applies the same deterministic rule to every shipped `example`.
2. **Stricter single gate call (gate version 2).** The one gate prompt now receives the lemma's `gloss` and answers PASS only if (a) the sentence is within the CEFR level, (b) it uses the word in the gloss sense (skipped when there is no gloss), and (c) it suits a general-audience learning app — no death, killing, crime or prison, violence or threats, sex or affairs, drugs, self-harm, or illness used for shock. The generate fallback prompt gets the same gloss and content rule. Failures are still rejected, not patched. The call goes through `xaiChat` (#267).
3. **Gate versioning.** Every gate-log entry carries `gate: 2`. `packs:check` treats an entry with no version or version 1 as stale for any shipped `example`, so every existing verdict re-runs once under the stricter gate and no old wrong-sense or dark sentence survives via the cache. Staleness uses the gate version and the verdict only. Source `mistral` and source `xai` both stay current when those two match.

## Consequences

- Pack JSON gains `example?: string` per lemma (ADR 0049); pack `version` bumps when examples land.
- Pack size grows roughly 30–60 bytes per lemma (~+25–35% per pack); selected-language precache only (ADR 0006), size delta reported in #248.
- About/NOTICE/THIRD-PARTY credit Tatoeba CC-BY 2.0 FR wherever a Tatoeba sentence ships.
- CC-BY attribution is aggregate (Tatoeba + license + link), the attribution model Tatoeba's own FAQ endorses.
