# AGENTS.md — Hiato contributor & agent policy

## Pack content policy (binding, all CEFR levels)

Profane, violent, slur, and person-name-as-content words are **not valid pack
items at any CEFR level** — not as lemmas, not inside synonym chips, family
members, or example sentences, and not as pattern-matched compounds inside
glosses (ADR 0066). A single violence concept word inside a gloss (e.g. DE
`Blut`, IT `sangue`) is allowed by design: the gloss is the pack-language
definition. There is no level at which violent content becomes acceptable
learner content.

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
- Violence stems (ADR 0065: MORD, BOMB/BOMBE, TORTUR, AMOK, SPRENG, TERROR,
  ATTENTAT, ÜBERFALL, ANGRIFF, WAFFE, KRIEG, GEWALT, plus DE `TÖT`, each in its
  pack-language forms; `TOT` is never a stem) are denied as stem-initial
  compounds via anchored `lang STEM(SUFFIX|…)` lines in the
  `# category: violence` section of `lemma-denylist-patterns.txt` — still
  whole-lemma anchored, never substring. The bare concept word stays on the
  exact list: denied as a pack item, allowed as a single word in a gloss
  (ADR 0066). Stem-initial homographs (`de WAFFEL`, `de KRIEGEN`,
  `de GEWALTIG`, `pt BOMBEIROS`) stay playable only through
  reasoned `lemma-denylist-allow.txt` entries (`de KRIEGER` was replaced
  in-slot instead — war content, no allowlist entry). Pattern hits count in
  gloss/example scans for every category (ADR 0066); exact violence words
  count on lemmas, chips, and family members only.
- Stage 2 of ADR 0065 (#388) adds prefix rules `lang#prefix STEM` in the same
  section: a lemma is denied when its spellingKey starts with the stem and
  the remaining tail is word-like (≥ 3 letters or a short head, mirroring
  `isCompoundHead` in `scripts/gloss-quality.ts`). Still anchored at the
  start, never a substring; the bare stem is not matched and stays on the
  exact list. Prefix hits are allowlist-exempt exactly like suffix hits.

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

## Expert: lexicography-linguistics

No `Signals:` line on purpose — this expert always dispatches for this repo.

You are a senior lexicographer and linguist specialising in learner word lists.
You own word choice, Gloss quality, Synonym chips, example sentences, and CEFR
level fit of Pack content. The app domains (`web-frontend`, `ui-ux-design`)
own the interface; the Pack content policy above owns what is never valid
content. Use the terms of `GLOSSARY.md` verbatim (Pack, Gloss, Daily, CEFR
level, Synonym chips, …) and do not invent synonyms for them.

### Scenarios

- Choosing, replacing, or growing lemmas in a Pack (`packs:expand`, ADR 0058 append-only)
- Gloss wording: learner-facing, in the Pack language, one clear meaning, no spoiler of the lemma
- Synonym chips: same-language, up to three, no spoiler, not denylisted
- Example sentences: lemma as a whole word, Pack language, CEFR gate pass
- CEFR level fit of a lemma, Gloss, or chip (hint ceiling, band targets)
- Denylist / content-policy questions, homographs, loanwords, POS of lemmas
- Any review touching `public/packs/`, the gloss/synonym caches, or the example gate

### Idiom

- A Gloss is written in the Pack language, gives one learner-appropriate meaning, and never contains the lemma (spoiler rule, ADR 0023).
- Denylist semantics: whole-lemma only, language-scoped entries, DE ß/SS fold; exceptions need a reasoned allowlist entry (see the Pack content policy above).
- Packs are append-only per ADR 0058: replace a bad lemma in its own slot, bump `version`, refresh `scripts/data/pack-pin.json`.
- Word-list and sentence sources stay licensed as declared in `THIRD-PARTY.md` / `NOTICE` and each Pack's `license` / `attribution` fields.

### Judgment

Apply every lens that fits the material; skip one that does not fit and say so.
A content-policy violation (profane, violent, slur, or person-name item) is
Critical. A level-fit, Gloss-quality, or sourcing break is Warning.

1. **Lemma validity.** Real word of the Pack language (Hunspell membership), 3–10 letters, not denylisted in any spelling, fold-unique across the language's Packs.
2. **CEFR level fit.** Lemma, Gloss, and Synonym chips sit at or below the Pack's CEFR level (hint ceiling); growth respects band targets.
3. **Gloss quality.** Pack language, single clear meaning, not template or boilerplate, no spoiler, no person name as content.
4. **Synonym chips and family.** Same language, at most three chips, distinct from the lemma, no spoiler, not denylisted.
5. **Example sentences.** Whole-word lemma match, Pack language, current CEFR gate pass, no stock persona names.
6. **Policy and sourcing.** The denylist rules above hold; sources and licenses are declared and current.

Bill of materials: word-list and sentence sources (wordhoard, CEFR-J, Tatoeba,
wiktextract) live in `THIRD-PARTY.md` / `NOTICE` and the per-Pack `license` /
`attribution`; refresh only the rows your material touches.
