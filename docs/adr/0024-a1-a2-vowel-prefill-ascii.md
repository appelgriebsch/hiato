# ADR 0024: A1/A2 vowel prefill — ASCII only

- Status: Accepted
- Date: 2026-09-19
- Deciders: Andreas Gerlach (via G0 accept)

## Context
G0 A1/A2 vowel prefill was revealing accented vowels (e.g. Ã in AÇÃO), which blocked the ADR 0015 diacritic-hint path. Uma fixed the prototype by prefilling only ASCII A/E/I/O/U.

## Decision
When A1/A2 rounds prefill vowels, prefill only unaccented ASCII vowels `A E I O U` (case per display rules). Accented vowel graphemes remain hidden for the player to guess (and may unlock the diacritic hint after two misses).

## Consequences
- Engine + Uma UX must match.
- Accented vowels count as diacritic cells for ADR 0015.
