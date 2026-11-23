# AGENTS.md — Hiato contributor & agent policy

## Pack content policy (binding, all CEFR levels)

Profane, violent, slur, and person-name-as-content words are **not valid pack
items at any CEFR level** — not as lemmas, not inside glosses, synonym chips,
family members, or example sentences. There is no level at which they become
acceptable learner content.

Enforcement point: `scripts/lemma-denylist.ts` backed by
`scripts/data/lemma-denylist.txt`, `lemma-denylist-patterns.txt`,
`lemma-denylist-allow.txt`, and `lemma-denylist-gloss-exempt.txt`.
`bun run packs:check` fails on any denylist hit in a pack's lemma, gloss
tokens, synonym chips, family members, or example sentences, and the
generation pipelines (`packs:expand`, `packs:extras`, `example-sentences`,
`synonym-generate`) apply the same guards before anything reaches the caches.

Matching rules:

- Whole-lemma only for patterns and exact hits — never substring matches.
- Language scoping is respected (`fr BITE` does not block EN `bite`).
- German `ß`/`ẞ` folds to `SS` (`spellingKey`), so `ERSCHIEßEN` is caught by the
  `ERSCHIESSEN` entry and `SCHEIßHAUS` by the `de SCHEISS(…|HAUS|…)` pattern.
- Gloss/example scans count profanity and slur exact hits plus patterns;
  synonym chips and family members count every exact category. The
  gloss-exempt list (`lemma-denylist-gloss-exempt.txt`) lifts language-scoped
  homographs such as `de HELL` (bright), `de DICK` (thick), `de SCHWANZ`
  (tail), `de ASS` (ate), `pt NU`.

Exceptions require an explicit allowlist entry **with a reason**:
`lemma-denylist-allow.txt` for pattern-caught homographs (e.g. `it SCOPO` =
aim), `lemma-denylist-gloss-exempt.txt` for gloss-language homographs. An
entry no rule matches is stale and fails the tests — remove it.

## Working rules

- Runtime: Bun 1.4.4 (`packageManager`); tests: `bun test`; lint: `bun run lint`
  (oxlint, warnings denied); pack gate: `bun run packs:check` — must pass and
  leave `scripts/data/hunspell-verdicts.json` and
  `scripts/data/lemma-extras-gate.json` unchanged (commit their rewrites).
- Packs are append-only per ADR 0058: never reorder or remove shipped slots —
  replace a bad lemma in its own slot, bump the pack `version`, and refresh
  `scripts/data/pack-pin.json` (the checker prints the entry to paste).
- ADRs live in `docs/adr/`; record content-policy or pipeline changes there.
- Never commit secrets; `functions/` and `wrangler.toml` hold no credentials.
