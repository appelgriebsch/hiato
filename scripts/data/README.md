# Pack expansion source data (ADR 0026)

Downloaded on demand by `bun run scripts/expand-packs.ts` (not always committed):

| File | Source | License |
|------|--------|---------|
| `wordhoard-{en,de,es}.csv` | [natema/wordhoard](https://github.com/natema/wordhoard) samples | dataset CC-BY-SA-4.0 (selection only) |
| `cefrj-en.json` | derived from [olp-en-cefrj](https://github.com/openlanguageprofiles/olp-en-cefrj) | cite CEFR-J / Tono Lab |
| `pt.txt` | [hermitdave/FrequencyWords](https://github.com/hermitdave/FrequencyWords) PT 50k | MIT |

Hiato pack **glosses and synonyms** are original learner copy. Lemma lists are curated selections, not verbatim proprietary dumps.

| `lemma-denylist.txt` | Hiato curated | exact-match NSFW/violence/slur gate |
| `gloss-cache/*.json` | Hiato generated | real same-language learner glosses for expand |
