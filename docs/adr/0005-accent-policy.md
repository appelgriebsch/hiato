# ADR 0005: Accent / diacritic policy — distinct letters

- Status: Accepted
- Date: 2026-09-19
- Deciders: Andreas Gerlach

## Context
DE/ES/PT (and EN loanwords) use diacritics and special letters (e.g. ß). Folding accents eases play but weakens L2 learning.

## Decision
Accents and special letters are distinct targets. Soft hint: after two misses on a diacritic cell, offer a one-diacritic hint. Use NFC normalization and grapheme-cluster iteration for gaps and keyboards.

## Consequences
- Per-language letter pads required.
- DE: ß is its own key (not auto-mapped to ss) in v1.
- Slightly harder; pedagogy preferred over forgiveness.
