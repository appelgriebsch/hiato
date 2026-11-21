# ADR 0055: EndCard enrichment schema — `PackLemma` gains `pos` / `ipa` / `family`, sources, gate log, size, anti-spoiler

- **Status**: Accepted
- **Date**: 2026-11-19
- **Deciders**: Andreas Gerlach
- **Supersedes**: none
- **Related issues**: #299, EPIC #313, #314, #315, #316, #318, #319, #339
- **Amended**: 2026-11-20, decision 2 — lemmas without a licensed pos source (all PT, plus de/es/it stragglers) get a gated Mistral-generated POS fallback (#339)

## Context

Issue #299 wants the EndCard to teach part of speech, IPA pronunciation and word family after the round ends (competitor parity with 7ESL's reveal), still fully offline. Pack lemmas today carry `word`, `gloss?`, `synonyms?`, `example?` (`src/packs/schema.ts`, ADR 0049). The pack JSON is client-side, so the anti-spoiler guarantee must stay structural: new fields are only ever read into the EndCard, which `Play.tsx` renders only when `finished` is set.

Source inventory (checked 2026-11-19):

- **POS** already exists in the licensed pack sources: the `pos` column of the CEFR-J and Octanove CSVs (EN) and `word.pos` in the wordhoard sqlite (de/es/fr/it). No new license surface. PT is the exception: FrequencyWords `pt_50k` has no pos column and no other licensed PT pos source exists, so PT lemmas (plus a few de/es/it stragglers) have no source tag and are filled by the Mistral fallback below — still original Hiato copy, still no new license surface (#339).
- **IPA and derivational family** come from Wiktionary via wiktextract pre-extracted data (kaikki.org), licensed CC-BY-SA 4.0 — the same attribution model as wordhoard. Coverage is strongest for en/de and thinner for pt/es/fr/it, so a Mistral-generated fallback (original Hiato copy, no external credit) fills gaps, exactly the ADR 0048 hybrid pattern.
- CEFRLex stays out (all-rights-reserved, ADR 0029).

## Decision

1. **Schema.** `PackLemma` gains optional `pos?: PackPos` (`'noun' | 'verb' | 'adjective' | 'adverb'`), `ipa?: string` (one `/…/` transcription in the pack language), `family?: string[]` (≤ 3 derivational relatives, same language). Caps: `IPA_MAX`, `FAMILY_MAX = 3`. POS is stored as a **code**; the app localizes the label via `POS_LABELS` in `src/packs/labels.ts` (glosses are same-language per ADR 0030, so the POS label is too).
2. **Sources.** POS from the existing pack sources at expand time. Lemmas with no licensed pos source (listed in `scripts/data/pos-exempt.txt`: all 2400 PT lemmas plus de/es/it stragglers) are filled by an original Mistral-generated tag via `bun run packs:pos --fill-exempt` (local runs only, `MISTRAL_API_KEY`): batched tag call plus an independent verify call must agree on a valid `PackPos`, otherwise the lemma stays exempt; every filled tag gets a `'pos'` entry in the gate log (decision 3). IPA and family: primary = wiktextract/kaikki.org per-language extracts (cached + checksummed under `scripts/data/`); fallback = original Mistral-generated values (`mistralChat`, batched JSON, local runs only, `MISTRAL_API_KEY`), only where wiktextract misses.
3. **Gates.** Deterministic, offline-enforceable: ipa `/…/` form + IPA charset allowlist + length; family entries pass the lemma denylist, language membership, hunspell verdicts, must differ from the lemma, ≤ 3; a Mistral-filled `pos` is valid only if tag and verify calls agreed on a `PackPos` code. Every shipped `ipa`/`family`/`pos` has a passing entry in a committed, versioned gate log `scripts/data/lemma-extras-gate.json` recording its source (`wiktextract` or `mistral`); `packs:check` fails on missing/stale/mismatched entries, and CI fails if the log drifts (same pattern as `example-gate.json` / `hunspell-verdicts.json`). The pipeline persists the log incrementally and resumes.
4. **Anti-spoiler.** The fields are read only into `EndCard`/`LemmaTeach` (mounted only when `finished`), never into in-round UI (`LearnerHint`, `LetterGrid`, keyboard). `packs:check` enforces the data rules; e2e (`e2e/lemma-extras.spec.ts`, pattern of `example-sentence.spec.ts`) asserts the timing rule. `DailyRecord` carries the extras so the already-played replay shows them; pocket mode joins the loaded pack by `lemmaIdentity` — pocket storage stays word+gloss.
5. **Size and rollout.** Byte growth is accepted (~+30–40% per pack; packs are runtime-cached per selected language via NetworkFirst `hiato-packs`, not precached — ADR 0006), measured and recorded against ADR 0026. Changed packs bump `version`; `load.ts` version check picks fresh packs; stale caches omit the optional fields — graceful degradation, no migration.
6. **Legal.** NOTICE / THIRD-PARTY.md / About / `licenses.ts` carry a Wiktionary-via-wiktextract CC-BY-SA 4.0 line (aggregate attribution + link, the model Tatoeba's FAQ endorses and wordhoard already uses).

## Options Considered

| Option | Pros | Cons |
| --- | --- | --- |
| **Schema fields + hybrid wiktextract/Mistral sources (chosen)** | Follows ADR 0048/0049 patterns; license-clean; offline-enforceable gates | New gate log to maintain; coverage gaps need the fallback |
| POS as localized string in the pack | No `labels.ts` mapping | Redundant bytes; harder to keep consistent across packs |
| POS/IPA/family from wiktextract only | No Mistral cost | Thin coverage for pt/es/fr/it; fields empty there |
| Mistral-generated everything | Full coverage, original copy | IPA accuracy risk without a strong gate; POS needlessly generated where a licensed source exists |
| Scraping the Wiktionary Action API per lemma at build time | Live data | Rate limits + messy wikitext parsing; pre-extracted wiktextract data is the same content, structured |
| Separate extras JSON per pack fetched at EndCard open | Smaller main pack | Second cache path; offline-miss risk on first reveal — rejected |
| Store extras in pocket entries | — | Pocket mode already loads the pack; join by `lemmaIdentity` instead — no storage change |

## Grill decisions (2026-11-19, Andreas)

1. POS = code enum from existing pack sources, localized in-app; lemmas without a licensed source get a gated Mistral fallback (#339).
2. IPA = wiktextract primary + Mistral fallback, gated, committed gate log.
3. Family = derivational (wiktextract related/derived, cap 3) + Mistral fallback.
4. All 36 packs get pos/ipa/family; DailyRecord replay carries them; pocket joins the pack by word.
5. UI layout as mocked (see ADR 0057).
6. Accept ~+30–40% per pack; version bump; stale caches degrade gracefully.
7. Committed versioned gate log enforced by `packs:check` in CI.
8. Anti-spoiler stays structural (EndCard-only) + e2e assertion.

## Consequences

- Pack JSON gains three optional fields per lemma; pack `version` bumps when they land; `packs:check` validates them and the gate log.
- New pipeline script `scripts/lemma-extras.ts` + `scripts/data/lemma-extras-gate.json` (committed); CI drift check covers the new log. The same log carries the Mistral-filled `pos` tags (#339), and `pos-exempt.txt` shrinks to gate rejects only once that run lands; filled tags are original Hiato copy, so no new attribution is needed.
- About/NOTICE/THIRD-PARTY credit Wiktionary (via wiktextract/kaikki.org) CC-BY-SA 4.0 wherever wiktextract data ships.
- Risk accepted: a well-formed but wrong generated IPA passes the deterministic gate — mitigated by wiktextract-first and per-entry source logging for audit.
- Revisit when: wiktextract coverage for pt/es/fr/it is measured and found too thin, or a better licensed IPA source appears.
