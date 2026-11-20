# ADR 0056: example sentences widen to all 36 packs, including C1/C2

- **Status**: Accepted
- **Date**: 2026-11-19
- **Deciders**: Andreas Gerlach
- **Supersedes**: none — amends the ADR 0048 amendment of 2026-11-12 and ADR 0049 §3 (point 3 narrowed to the 24 A1–B2 packs)
- **Related issues**: #299, EPIC #313, #317

## Context

ADR 0049 §3 (amended 2026-11-12) ships `example` sentences only on the 24 A1–B2 packs; the 12 C1/C2 packs ship no example on purpose. Issue #299 targets learners at every level, especially B2–C2, and its acceptance criteria require C1/C2 packs to get example sentences via the ADR 0048 pipeline (Tatoeba CC-BY 2.0 FR + Mistral fallback + CEFR level gate). The pipeline (`scripts/example-sentences.ts`) and its gate are already level-parameterized; only the level scope was capped.

## Decision

1. Widen `scripts/example-sentences.ts` from the 24 A1–B2 packs to **all 36 packs**. Source order and guards are unchanged: Tatoeba (CC-BY 2.0 FR) primary, original Mistral-generated fallback, stock-name guard, denylist, `example-skip.txt`, and CEFR gate version 2 — for C1/C2 the gate passes sentences within the C1/C2 level and suitable for a general-audience learning app.
2. Re-run the gate for the 12 C1/C2 packs and extend `scripts/data/example-gate.json`; gate versioning forces re-verification of new entries exactly as it did for the A1–B2 widening.
3. Regenerate the 12 C1/C2 packs, bump their `version` and the pin. The EndCard already renders exactly one sentence post-finish (ADR 0049 point 2); no UI change beyond ADR 0057.
4. Tatoeba attribution in About/NOTICE/THIRD-PARTY is already in place and covers the widened packs (aggregate credit).

## Options Considered

| Option | Pros | Cons |
| --- | --- | --- |
| **Widen the existing pipeline to all 36 packs (chosen)** | Reuses tested gates and attribution; one pipeline | More gate re-runs; C1/C2 Tatoeba coverage is thinner, fallback cost |
| Keep C1/C2 without examples | Zero new cost | Fails a #299 acceptance criterion; B2–C2 learners get a thinner EndCard |
| Separate C1/C2 example source | — | New license review for no gain; Tatoeba covers all six languages |

## Consequences

- The 12 C1/C2 packs gain gated `example` sentences; `packs:check` enforces the gate log offline in CI.
- Byte delta per C1/C2 pack (~30–60 B/lemma, as ADR 0048 noted for A1–B2) is recorded with the ADR 0055 size report.
- ADR 0049 §3's "C1/C2 ship no example on purpose" is reversed by this ADR; the EndCard shows no sentence for lemmas on the skip list or without a passing gate.
