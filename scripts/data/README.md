# Pack expansion source data (ADR 0026)

Downloaded on demand by `bun run scripts/expand-packs.ts` (not always committed):

| File | Source | License |
|------|--------|---------|
| `wordhoard-{en,de,es}.csv` | [natema/wordhoard](https://github.com/natema/wordhoard) samples | dataset CC-BY-SA-4.0 (selection only) |
| `cefrj-en.json` | derived from [olp-en-cefrj](https://github.com/openlanguageprofiles/olp-en-cefrj) | cite CEFR-J / Tono Lab |
| `pt.txt` | [hermitdave/FrequencyWords](https://github.com/hermitdave/FrequencyWords) PT 50k | MIT |

Hiato pack **glosses and synonyms** are original learner copy. Lemma lists are curated selections, not verbatim proprietary dumps.

| `lemma-denylist.txt` | Hiato curated | exact-match NSFW/violence/slur gate (lemma only; no substring) |
| `lemma-names.txt` | Wikidata CC0 given/family-name labels + US SSA national names (CC0) + pack residuals | exact-match person names (hangman 3–10). Drop a pack lemma only when it is on this list **and** the gloss is a person-name gloss. Surnames capped by Wikidata sitelinks. |
| `loanword-allowlist.txt` | Hiato curated | classroom internationalisms that nspell misses; `LANG WORD` (`*` = all pack langs) |
| `gloss-cache/*.json` | Hiato generated | real same-language learner glosses for expand (ADR 0030) |
| `synonym-cache/*.json` | Hiato generated | same-language synonym chips; `[]` = unique referent (do not retry) |

Build-time spellcheck (devDependencies, **not** shipped in the PWA): `nspell` plus Hunspell dictionaries `dictionary-en` (SCOWL, MIT AND BSD), `dictionary-de` (igerman98, GPL-2.0 OR GPL-3.0), `dictionary-es` (RLA-ES, GPL-3.0 OR LGPL-3.0 OR MPL-1.1), `dictionary-pt` (LGPL-3.0 OR MPL-2.0), `dictionary-pt-pt` (Natura, GPL-2.0 OR LGPL-2.1 OR MPL-1.1). Used only by `scripts/` (`ensureDicts` / `isWordOfLang`); never imported from `src/`.
