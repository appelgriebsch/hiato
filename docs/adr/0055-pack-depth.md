# ADR 0055: Pack depth — append-only growth of all 36 packs to per-band targets

- **Status**: Accepted
- **Date**: 2026-11-20
- **Deciders**: Andreas Gerlach
- **Supersedes**: none (amends ADR 0026, ADR 0028, ADR 0040 addendum)
- **Related issues**: #305, EPIC #327, sub-tickets #328–#334

## Context

Every shipped pack (`public/packs/{lang}/{cefr}.json`, 36 packs) has exactly 400 lemmas (ADR 0026 target, pin-enforced by `PACK_LEMMA_COUNT = 400` in `scripts/pack-pin.ts`). Daily picks one word per day via `hash(date|lang|cefr) % n` (`src/engine/daily.ts`) and Practice draws from the same pack, so at n=400 a learner at one lang×CEFR repeats a Daily word after ~400 days (#305). Deeper packs mean a longer Daily runway and more variety. Growth must not break the guards that exist today: the pack-pin slot stability check (CI), the #208 exclusive-band/accent-pair guard, the Hunspell verdict cache (`hunspell-verdicts.json`, fail-closed in CI), the license matrix (ADR 0029), the hint ceiling, and the offline model (ADR 0006: packs runtime-cached in SW `hiato-packs`, `maxEntries: 30`, plus a one-language localStorage mirror).

## Decision

Grow **all 36 packs append-only**: existing lemmas keep their array slots; new lemmas are appended. Per-band target = min(dry-run source capacity, **1000** lemmas per pack); floor is **350 for every band including C2** (ADR 0028's C2 floor of 200 goes away when the widened window covers 350). Sources stay exactly ADR 0029 — widened frequency-rank windows for DE/ES/PT B2–C2 and FR/IT, raised `cefr_estimate` ceilings for FR/IT A1–B1, full CEFR-J content-POS pool for EN A1–B2, full Octanove pool for EN C1/C2. No new source, so NOTICE, About, and `src/packs/licenses.ts` do not change. This amends ADR 0026 (target is no longer ~400), ADR 0028 (within-band fill is now the growth mechanism; bands stay exclusive), and the ADR 0040 addendum (A1–B1 are unfrozen **once** for `--grow`; frozen again afterwards — later edits need their own decision).

Guards: `pack-pin.ts` checks count ∈ [350, bandTarget] instead of == 400, keeping order/body hashes and slot stability (append-only passes, reorder/removal fails). `packs:check` gains a fail-closed budget check: ≤ **2.5 MB per language** (6 packs) and ≤ **12 MB total**; SW `maxEntries` stays 30 and the SW/localStorage loading code is unchanged — a `version+1` bump per touched pack refreshes cached packs through the existing NetworkFirst/version-check path. New lemmas pass every existing gate (hangman 3–10, denylist, Hunspell verdict cache committed, name-gloss, spoiler, pack-language gloss, synonym coverage, hint ceiling, exclusive bands, accent-pair allowlist), get Mistral glosses/synonyms from the committed caches, and get CEFR-gated example sentences (gate v2 in `example-gate.json`).

Rollout: one prep PR (#328: guards + `--grow` mode + tests, no pack data), then one PR per language (#333 EN, #332 PT, #329 DE, #331 ES, #334 FR, #330 IT), each green through CI (slot guard, `packs:check` incl. budget and verdict-committed, build, `bun test`, Playwright) and the existing CI-gated staging→promote deploy (ADR 0042).

## Options Considered

| Option | Pros | Cons |
| --- | --- | --- |
| A — append-only growth of all 36 packs within ADR 0029 sources, per-band targets capped at 1000 (chosen) | Longer Daily runway at every level; pin slot guard and daily picks for existing words stay stable; no license-review surface | Needs a deliberate unfreeze of A1–B1; Mistral spend for new glosses/synonyms (cached, bounded); EN C-level pools are tight, so EN targets may land below the cap |
| B — grow only B2–C2 (the expand write-set) | No unfreeze needed | A1–B1 stay at 400 — the levels learners dwell on longest keep the short runway |
| C — keep 400 lemmas, add depth via examples/synonyms only | Cheap | Does not lengthen the Daily runway, which is the issue's stated value |
| D — add new sources (7ESL, CEFRLex, Tatoeba-mined lemmas, wordhoard `en` for EN) | Bigger pools | 7ESL is not redistributable; CEFRLex is banned by ADR 0029; Tatoeba/wordhoard-en need new per-source license bands and license review |

## Consequences

- Pack files grow roughly linearly (~170 B/lemma); the budget guard caps one language at 2.5 MB (fits the ~5 MB localStorage quota with the existing memory-cache fallback) and all packs at 12 MB. Packs are still not precached at install (ADR 0006), so the install-time SW precache is unchanged.
- The Daily pick for a given date shifts once per pack when n changes (`hash % n`); existing words keep slots (pin green) and per-date Daily records are unaffected. Practice availability is unchanged in shape (`lemmasExcludingDaily`).
- `packs:expand --grow` is the only mode that may write a1–b1 for en/pt/de/es, and it refuses to rewrite existing slots; `--dry-run` reports per-band capacity and sets the `bandTarget` table.
- Hunspell verdict cache must be regenerated locally (`bun run packs:check`) and committed per language PR; CI fails closed on a miss, as today.
- Revisit if: a band cannot reach 350 from its widened source (record the exception here), or the budget guard starts failing at target sizes.
