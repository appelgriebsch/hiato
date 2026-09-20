# ADR 0028: Exclusive CEFR bands and B2–C2 pack size

- Status: Accepted
- Date: 2026-09-20
- Deciders: Andreas Gerlach

A lemma may appear in **at most one** pack per language. Expand must not top up B2–C2 from A1–B1 (or from a sibling new band). Within a single band, filling to size from that band’s source is allowed.

Target remains **~400 lemmas** per lang×CEFR, `packs:check` floor **350** (ADR 0026), including B2 and C1. **C2 only** may use a documented lower floor of **200** if exclusive hangman-fit lemmas (length 3–10) run out — never by copying lower-level words. Raise the C2 floor later if a dry-run shows 350 is easy; do not lower C1.

Rejected: overlapping/cumulative higher packs; lowering the C1 floor in this epic; stuffing C2 with B1 leftovers.
