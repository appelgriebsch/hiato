# Pack expansion source data (ADR 0026, 0029)

Downloaded on demand by `bun run packs:expand` (not committed). New dest paths so a stale `existsSync` cannot keep sample CSVs or CEFR-J without B2:

| File | Source | License |
|------|--------|---------|
| `cefrj-en-with-b2.json` | derived from [olp-en-cefrj](https://github.com/openlanguageprofiles/olp-en-cefrj) CEFR-J Vocabulary Profile 1.5 (includes B2) | cite CEFR-J / Tono Lab |
| `octanove-vocabulary-profile-c1c2-1.0.csv` | [olp-en-cefrj](https://github.com/openlanguageprofiles/olp-en-cefrj) Octanove C1/C2 | CC-BY-SA-4.0 |
| `wordhoard-v0.1.0.db.gz` / `.db` | [natema/wordhoard](https://github.com/natema/wordhoard) **v0.1.0** full SQLite (not `samples/{lang}.csv`) | dataset CC-BY-SA-4.0 |
| `pt.txt` | [hermitdave/FrequencyWords](https://github.com/hermitdave/FrequencyWords) PT 50k | MIT |

Legacy `wordhoard-{en,de,es}.csv` and `cefrj-en.json` (A1–B1 only) must not be reused for B2–C2.

Hiato pack **glosses and synonyms** are original learner copy. Lemma lists are curated selections, not verbatim proprietary dumps.

| `lemma-denylist.txt` | Hiato curated | exact-match NSFW/violence/slur gate |
| `gloss-cache/*.json` | Hiato generated | real same-language learner glosses for expand |
| `synonym-cache/*.json` | Hiato generated | same-language synonym chips (C1/C2 target ≥80%) |
