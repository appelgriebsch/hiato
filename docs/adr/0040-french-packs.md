# ADR 0040: French packs — wordhoard frequency bands, CC-BY-SA A1–C2, AZERTY pad

- Status: Accepted
- Date: 2026-10-11
- Deciders: Andreas Gerlach

French is the first language after EN/PT/DE/ES (add order FR → IT → NL). All six bands ship in one PR. IT, NL, and non-Latin scripts stay out.

## Source and license

FR A1–C2 lemmas come from wordhoard v0.1.0 `lang='fr'` (CC-BY-SA-4.0). Do not use FLELex or any CEFRLex list (CC BY-NC-SA 4.0; ADR 0029).

A1–B1 follow wordhoard `cefr_estimate`, which is a frequency-rank cut: A1 ≤750, A2 ≤1500, B1 ≤3000. B2–C2 use the same filtered-index windows as DE/ES (`DE_ES_BANDS`: 4000–7000 / 7000–11000 / 11000–16000), not the wordhoard C1/C2 rank cut. Bands do not overlap (ADR 0028). If a band finishes under ~400 lemmas, that band’s rank or index ceiling is raised and the next band starts after the new ceiling. Words are never copied in from another band.

Every FR pack is labelled **CC-BY-SA-4.0**. The bands are frequency bands, not DELF or DALF lists. Glosses and synonym chips are original Hiato copy in French.

Expand may write `fr/a1`–`fr/b1` once, only when no FR pack file exists yet. After that, A1–B1 stay frozen like the other languages.

## Pad

AZERTY, one visual row per source row (ADR 0005; no symbols mode):

| Row | Keys |
| --- | --- |
| 1 | A Z E R T Y U I O P |
| 2 | Q S D F G H J K L M |
| 3 | W X C V B N Ç Œ |
| Accents | À Â É È Ê Ë Î Ï Ô Û |

Œ is one tile (U+0152). There is no tile for Æ, Ÿ, Ù, or Ü; the hangman regex drops those lemmas. The accent strip is labelled Accents. The widest row is 10 columns, the same pitch as EN/PT/ES.

## Gates that differ for French

- Elision stubs JUSQU, QUELQU, PRESQU, PUISQU, LORSQU, AUJOURD are dropped. Apostrophe, hyphen, space, dot, and digit lemmas stay out via the existing hangman rule.
- A VERB row is dropped when wordhoard `word_form` maps it to a different verb lemma. ADJ participles stay.
- Spelling pairs that differ only by È/É (événement / évènement) keep the more frequent form. Accents are not folded (MÛR≠MUR).
- Denylist lines are `fr WORD`, so EN BITE and ES/PT NEGRO stay. Ethnic and religious group words in that list stay out. QUEUE stays in.
- Person names are dropped only when the lemma is on the name list **and** the gloss matches a French person-name pattern (`prénom`, `nom de famille`, `nom propre`), at every FR level. The strict B2–C2 name-list skip is not used for French.
- `dictionary-fr` 3.0.0 (Grammalecte classique, MPL-2.0) is a build-time Hunspell dictionary only. It is not shipped in the PWA.
- EndCard speech uses `fr-FR` and stays hidden when the device has no French voice (ADR 0037).

## Consequences

Hint-ceiling rules are unchanged. `fr` is included in the stem cache (wordhoard `word_form` plus dictionary-fr affixes). About, NOTICE, `licenses.ts`, and the picker caption describe frequency bands under CC-BY-SA-4.0.
