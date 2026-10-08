# ADR 0029: B2–C2 sources and licenses

- Status: Accepted
- Date: 2026-09-20
- Deciders: Andreas Gerlach

> Amended by #169: DE/ES A1–B1 are wordhoard-sample lemmas and are relabelled **CC-BY-SA-4.0**.
> Amended by #171: EN A1–B2 stay CEFR-J headwords, but the licence is the CEFR-J Wordlist terms (free use with citation, © Tono Laboratory, TUFS), not CC0.

DE/ES A1–B1 are **CC-BY-SA-4.0**. PT stays **CC-BY-SA-4.0** (ADR 0009). EN A1–B2 use the CEFR-J Wordlist terms. New packs follow the lemma source:

| Packs | Source | Honesty | License on shipped lemma list |
| --- | --- | --- | --- |
| EN A1–B2 | CEFR-J Wordlist 1.5 (cite Yukio Tono, TUFS) | tagged syllabus | free use with citation; not CC0 |
| EN C1, C2 | Octanove Vocabulary Profile (olp-en-cefrj) | tagged add-on above CEFR-J | **CC-BY-SA-4.0** |
| DE/ES B2–C2 | wordhoard **full** CSV (not the A1–B1 samples) | **frequency-rank bands**. German CEFR labels are calibrated against Goethe-Institut lists, not copied from them. Spanish bands are not Instituto Cervantes lists | **CC-BY-SA-4.0** |
| PT B2–C2 | FrequencyWords rank slices beyond current B1 | frequency bands, not CAPLE | **CC-BY-SA-4.0** |

Do not ingest Goethe Wortlisten, Instituto Cervantes PCIC dumps, EVP, Oxford 3000/5000, Pearson GSE, or CEFRLex (NC or all-rights-reserved). About/NOTICE must say DE/ES/PT C-levels are frequency bands.

C1/C2 packs target **≥80%** of lemmas with 1–3 same-language synonym chips (UI cap 3, ADR 0023). B2 stays optional like B1. Unique referents may stay gloss-only; do not fail CI on a few gaps.

Rejected: relabelling A1–B1 in this epic; skipping SA packs; EN-only C-levels; shipping CEFRLex/EVP lemma columns.
