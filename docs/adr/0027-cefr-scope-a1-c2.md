# ADR 0027: CEFR pack scope — A1–C2

- Status: Accepted
- Date: 2026-09-20
- Deciders: Andreas Gerlach
- Supersedes: ADR 0017

v1 shipped only A1–B1 (ADR 0017) to limit curation and download cost. We now ship **B2, C1, and C2** as well for EN/PT/DE/ES in **one release**. A1–B1 packs are not rebuilt.

**Play:** B2–C2 use the same rules as B1 — empty grid (no A1/A2 vowel prefill, ADR 0024), six lives, same-language gloss/synonym strip (ADR 0023). Difficulty is the lexicon.

**Picker:** one list of six CEFR buttons. Copy: A1–A2 prefill vowels; B1–C2 start empty.

**Precache:** keep ADR 0006 (selected language, not all languages). Precache **all six** CEFR files for that language (~220 KB). Runtime pack cache must accept `b2|c1|c2` and hold at least six entries per language switch.

Rejected: B2-only first; hiding C1/C2 behind a flag; extra lives or delayed gloss at C-levels; precache only the chosen CEFR.
