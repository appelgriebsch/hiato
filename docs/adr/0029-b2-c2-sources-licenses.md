# ADR 0029: B2–C2 sources and licenses

- Status: Accepted
- Date: 2026-09-20
- Deciders: Andreas Gerlach

A1–B1 EN/DE/ES stay labelled **CC0-1.0**; PT stays **CC-BY-SA-4.0** (ADR 0009). New packs follow the lemma source:

| Packs | Source | Honesty | License on shipped lemma list |
| --- | --- | --- | --- |
| EN B2 | CEFR-J (cite Tono Lab) | tagged syllabus | same citation story as EN A1–B1 |
| EN C1, C2 | Octanove Vocabulary Profile (olp-en-cefrj) | tagged add-on above CEFR-J | **CC-BY-SA-4.0** |
| DE/ES B2–C2 | wordhoard **full** CSV (not the A1–B1 samples) | **frequency-rank bands**, not Goethe/Cervantes lists | **CC-BY-SA-4.0** |
| PT B2–C2 | FrequencyWords rank slices beyond current B1 | frequency bands, not CAPLE | **CC-BY-SA-4.0** |

Do not ingest Goethe Wortlisten, Instituto Cervantes PCIC dumps, EVP, Oxford 3000/5000, Pearson GSE, or CEFRLex (NC or all-rights-reserved). About/NOTICE must say DE/ES/PT C-levels are frequency bands.

C1/C2 packs target **≥80%** of lemmas with 1–3 same-language synonym chips (UI cap 3, ADR 0023). B2 stays optional like B1. Unique referents may stay gloss-only; do not fail CI on a few gaps.

Rejected: relabelling A1–B1 in this epic; skipping SA packs; EN-only C-levels; shipping CEFRLex/EVP lemma columns.
