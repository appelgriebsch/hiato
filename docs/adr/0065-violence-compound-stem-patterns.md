# ADR 0065: Violence stems in compounds — anchored suffix patterns now, prefix matcher later (#374)

- **Status**: Proposed
- **Date**: 2026-11-27
- **Deciders**: Andreas Gerlach
- **Supersedes**: none (sharpens ADR 0059 and ADR 0061; amends the AGENTS.md matching-rules wording)
- **Related issues**: #374. Follow-up to #357 / PR #373.

## Context

The denylist matches whole lemmas only: exact lines and `STEM(SUFFIX|…)` patterns compile to `^STEM(?:…)$`, so a denylisted violence stem inside a longer word never matches. Compounds shipped: `de` SPRENGSATZ, MORDFALL, ATOMBOMBE, MORDWAFFE, ERMORDUNG, VÖLKERMORD, RAUCHBOMBE, ZERBOMBEN, STINKBOMBE, MORDENDER, MORDE (11); `es` MORDER, MORDIDO, MORDISCO, MORDAZA, AMORDAZAR, BOMBERO, TORTURADO, PRIMORDIAL (8, PRIMORDIAL a false positive); `pt` MORDER, TORTUROU, BOMBEIROS (3, BOMBEIROS a false positive); `fr` MORDRE, REMORD, TERRORISTE, TERRORISME (4); `it` MORDERE, TORTURARE, TERRORE (3); `en` TORTUROUS (1). `packs:expand` only filters what `isDeniedLemma` catches (`hangmanOk`), so future grows re-ship these. A naive substring scan over all 207 violence exact entries produces 287 hits (CHARMANT contains ARMA, MALADIE contains DIE), which is why anchoring matters.

## Decision

**Stage 1 (this change): data-only.** Add language-scoped violence stems to `lemma-denylist-patterns.txt` as `lang STEM(SUFFIX|…)` lines with curated compound-suffix lists — e.g. `de MORD(ER|E|EN|FALL|WAFFE|WAFFEN|…)`, `de BOMBE(N|R|…)`, `de SPRENG(SATZ|KRAFT|…)`, `es MORD(ER|IDO|ISCO|AZA|DAZA|…)`, `fr MORD(RE|…)`, `fr TERROR(ISTE|ISME|…)`, `it MORDERE`, `pt BOMBEIRO(S)`. The matchers in `scripts/lemma-denylist.ts` are unchanged; `packs:check` (`validatePack`), the expand pipelines (`hangmanOk` → `isDeniedLemma`), and `profanity-guard.test.ts` all inherit the denials. Anchored `^STEM(?:…)$` keeps the AGENTS.md rule "never substring matches" true: only stem-initial compounds are caught.

**Stem set (policy):** MORD, BOMB, TORTUR, AMOK, SPRENG, TERROR, ATTENTAT, ÜBERFALL, ANGRIFF, WAFFE, KRIEG, GEWALT — each in its pack-language forms. KRIEG and GEWALT are included; their legitimate compounds/forms (KRIEGEN, KRIEGER, GEWALTIG, AUFKRIEGEN, WAFFEL, BOMBEIROS, SCHLEICHEN, BEGLEICHEN, PRIMORDIAL…) are exempt via reasoned `lemma-denylist-allow.txt` entries (existing stale-entry tests apply). `TOT` is never a stem (TOTAL, TOTALE, PROTOTIPO, PROTOTYP); German uses `TÖT(…)` — `spellingKey` folds only ß/SS, not umlauts, so `TÖT` cannot match TOTAL.

**Stage 2 (separate follow-up ticket):** a prefix/compound matcher (`lang#prefix STEM` denying stem + word-like tail, mirroring `isCompoundHead` in `scripts/gloss-quality.ts`, allowlist-aware, stale-allow tests extended) for open compounds whose suffix is not curated. Until it ships, the regression scan is the tripwire.

## Amendment — stage 2 shipped (#388, 2026-11-27)

- **Syntax:** `lang#prefix STEM` lines in the `# category: violence` section (language-scoped only, so a `# …` comment can never parse as a rule). The stem must be a word-like head (≥ 3 letters or in the short-head set `UM AB AN ZU DA WO UR`, mirroring `isCompoundHead` in `scripts/gloss-quality.ts`).
- **Matcher:** compiled to `^STEM(?:\p{L}{3,}|UM|AB|AN|ZU|DA|WO|UR)$` over `spellingKey` (ß/SS folds as usual). A lemma is denied when it starts with the stem and the tail is word-like; the bare stem is not matched. Anchored at the start, never a substring. `matchesDeniedPattern` needs no special case — the compiled regex is the whole rule — so `isDeniedLemma`, `isDeniedGlossToken`, `isDeniedTextToken`, `staleAllowEntries`, `packs:check`, and the expand pipelines (`hangmanOk`) all inherit prefix denials unchanged.
- **Stems:** the stage-1 base stems per language (de MORD BOMB SPRENG WAFFE KRIEG GEWALT TORTUR AMOK TERROR ATTENTAT ÜBERFALL ANGRIFF TÖT; es MORD BOMB TORTUR TERROR ATENTAD AMOK; pt MORD BOMB TORTUR TERROR; fr MORD TERROR; it MORD BOMB TORTUR TERROR; en TORTUR MURD TERROR BOMB).
- **Allowlist churn:** `it BOMBOLA` (gas cylinder) added as a reasoned prefix homograph; the shipped `pt BOMBEIRO*` / `de WAFFEL|KRIEGEN|GEWALTIG` entries now also match prefix rules. Stale-allow tests cover prefix rules via `matchesDeniedPattern`.
- **Fallout fixed in the same change:** one shipped lemma (`it/b2 BOMBARDARE`) replaced in-slot by `BALCONE`; violence-stem compounds removed from family members, chips, glosses, and examples across de/es/pt/fr/it/en packs (e.g. `gewaltsam` → `brutal` in glosses); denied cache keys (WAFFENRUHE, SPRENGKOPF, KRIEGSHERR, KRIEGSGOTT, BOMBEAR/es, BOMBISTA, BOMBORDO, BOMBARDARE) dropped from gloss/synonym caches. The T1 regression scan is extended with a prefix-hit pass (`violencePrefixHits`) asserting zero un-allowlisted open compounds across all 36 packs.

**Replacements:** every shipped compound lemma is replaced in its own slot (ADR 0058): Hunspell-verified pack-language word, 3–10 letters, fold-unique, CEFR band fit, hint-ceiling clear; pack `version` bumped, `scripts/data/pack-pin.json` and `scripts/data/hunspell-verdicts.json` regenerated and committed (the membership stamp hashes `lemma-denylist.ts`, so the verdict cache invalidates by design).

## Options Considered

| Option | Pros | Cons |
| --- | --- | --- |
| A — anchored suffix patterns, data-only (chosen, stage 1) | Reuses tested machinery; every consumer inherits; anchoring avoids substring false positives; reviewable per language | Suffix lists must be curated; open compounds with unlisted tails still slip until stage 2 |
| B — prefix/compound matcher now | Catches open compounds automatically | New matcher code + tests, more allowlist churn; deferred to stage 2 so stage 1 ships unblocked |
| C — naive substring scan of violence stems | Highest recall | 287 false-positive hits (DIE in MALADIE, ARMA in CHARMANT); violates the whole-lemma rule; rejected |
| D — KRIEG/GEWALT excluded from the stem set | Less allowlist churn | Their compounds (e.g. KRIEGS…) stay shippable; rejected — policy covers them |

## Consequences

- `packs:check` and the expand pipelines deny the new compounds with zero code change in stage 1; `profanity-guard.test.ts` gains a regression scan asserting zero un-allowlisted stem-initial compounds across all 36 packs.
- AGENTS.md matching rules are amended: patterns stay whole-lemma anchored; the violence stem set and the allowlist-for-homographs rule are written down.
- Cache regens (`hunspell-verdicts.json`, `pack-pin.json`) are deterministic and committed with the PR.
- Revisit when stage 2 lands (prefix matcher) or when a stem produces an allowlist entry that no longer has a real reason (stale tests fail).
