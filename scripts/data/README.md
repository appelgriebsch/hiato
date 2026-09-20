# Pack expansion source data (ADR 0026, 0029)

Downloaded on demand by `bun run packs:expand` (not committed). New dest paths so a stale `existsSync` cannot keep sample CSVs or CEFR-J without B2:

| File | Source | License |
|------|--------|---------|
| `cefrj-en-with-b2.json` | derived from [olp-en-cefrj](https://github.com/openlanguageprofiles/olp-en-cefrj) CEFR-J Vocabulary Profile 1.5 (includes B2) | cite CEFR-J / Tono Lab |
| `octanove-vocabulary-profile-c1c2-1.0.csv` | [olp-en-cefrj](https://github.com/openlanguageprofiles/olp-en-cefrj) Octanove C1/C2 | CC-BY-SA-4.0 |
| `wordhoard-v0.1.0.db.gz` / `.db` | [natema/wordhoard](https://github.com/natema/wordhoard) **v0.1.0** full SQLite (not `samples/{lang}.csv`) | dataset CC-BY-SA-4.0 |
| `pt.txt` | [hermitdave/FrequencyWords](https://github.com/hermitdave/FrequencyWords) PT 50k | MIT |

Legacy `wordhoard-{en,de,es}.csv` and `cefrj-en.json` (A1–B1 only) must not be reused for B2–C2.

Hiato pack **glosses and synonyms** are original learner copy **in the pack language** (ADR 0030). Lemma lists are curated selections, not verbatim proprietary dumps. English is not a fallback for DE/ES/PT glosses.

Shipped pack license bands (pack JSON, ADR 0029):

| Packs | License on lemma list |
|-------|------------------------|
| EN A1–B2 | CC0 / CEFR-J citation (Tono Lab) — B2 is **not** share-alike |
| EN C1–C2 | CC-BY-SA-4.0 (Octanove) |
| DE/ES A1–B1 | CC0 |
| DE/ES B2–C2 | CC-BY-SA-4.0 wordhoard-full; frequency-rank bands, not Goethe/Cervantes |
| PT A1–C2 | CC-BY-SA-4.0; C-levels are frequency slices, not CAPLE |

| `lemma-denylist.txt` | Hiato curated | exact-match NSFW/violence/slur gate (lemma only; no substring) |
| `lemma-names.txt` | Wikidata CC0 given/family-name labels + US SSA national names (CC0) + pack residuals | exact-match person names (hangman 3–10). Drop a pack lemma only when it is on this list **and** the gloss is a person-name gloss. Surnames capped by Wikidata sitelinks. |
| `loanword-allowlist.txt` | Hiato curated | classroom internationalisms that nspell misses; `LANG WORD` (`*` = all pack langs) |
| `gloss-cache/*.json` | Hiato generated | real same-language learner glosses for expand (ADR 0030) |
| `synonym-cache/*.json` | Hiato generated | same-language synonym chips; C1/C2 target ≥80%; `[]` = unique referent (do not retry) |

Build-time spellcheck (devDependencies, **not** shipped in the PWA): `nspell` plus Hunspell dictionaries `dictionary-en` (SCOWL, MIT AND BSD), `dictionary-de` (igerman98, GPL-2.0 OR GPL-3.0), `dictionary-es` (RLA-ES, GPL-3.0 OR LGPL-3.0 OR MPL-1.1), `dictionary-pt` (LGPL-3.0 OR MPL-2.0), `dictionary-pt-pt` (Natura, GPL-2.0 OR LGPL-2.1 OR MPL-1.1). Used only by `scripts/` (`ensureDicts` / `isWordOfLang`); never imported from `src/`.
