# ADR 0028: Exclusive CEFR bands and B2–C2 pack size

- Status: Accepted
- Date: 2026-09-20
- Deciders: Andreas Gerlach

A lemma may appear in **at most one** pack per language. Expand must not top up B2–C2 from A1–B1 (or from a sibling new band). Within a single band, filling to size from that band’s source is allowed.

Target remains **~400 lemmas** per lang×CEFR, `packs:check` floor **350** (ADR 0026), including B2 and C1. **C2 only** may use a documented lower floor of **200** if exclusive hangman-fit lemmas (length 3–10) run out — never by copying lower-level words. Raise the C2 floor later if a dry-run shows 350 is easy; do not lower C1.

B2–C2 selection uses the same pack-quality gates as A1–B1 (#24): Hunspell language membership (loanword allowlist), NSFW denylist, hangman length 3–10, and no person-name list lemmas (frequency bands dump proper names). `packs:check` also drops a lemma when it is on the name list **and** the gloss is a person-name gloss.

Rejected: overlapping/cumulative higher packs; lowering the C1 floor in this epic; stuffing C2 with B1 leftovers.

## Addendum — no A1–B1 exemption, accent-pair allowlist (#208)

`exclusiveConflicts` applies the rule above to every band. Fold-key duplicates that shipped inside A1–B1 are not grandfathered.

Accents stay distinct letters (ADR 0005). Two lemmas that match only after NFD, stripping marks, lowercasing, and ß→ss are an accent-only pair. `packs:check` fails that pair, in one pack or across packs, unless `scripts/data/accent-pair-allowlist.json` lists both words and a one-line reason. DE ß/SS and FR È/É still follow `foldKey` and count as one lemma. An allowlist entry that matches no shipped cluster is an error.
