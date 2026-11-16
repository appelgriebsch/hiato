# ADR 0053: Accent miss as a teaching event — explain always, forgive at A1–A2, count from B1

- **Status**: Proposed
- **Date**: 2026-11-16
- **Deciders**: Andreas Gerlach (CEFR rule decided in #75 comment, 2026-11-09; scope and UI confirmed in solution-engineering grilling, 2026-11-16)
- **Supersedes**: none (extends ADR 0005 and ADR 0015)
- **Related issues**: #75 (epic), tracer children #292 (AT-1), #293 (AT-2), #294 (AT-3)

## Context

Issue #75 asks to treat a missing or wrong diacritic as a first-class miss with a micro-lesson (`café ≠ cafe`), not only a keyboard convenience. Hiato already defines a diacritic-related miss exactly once: `isDiacriticHintMiss` (`src/engine/game.ts`) counts (a) the ASCII base of a still-hidden diacritic (N vs Ñ, E vs É) or (b) a wrong diacritic key while a diacritic remains hidden (Á while Ñ remains). ADR 0015 uses that counter to unlock the player-triggered accent hint after two misses. Pack measurement (2026-11-16): EN packs have zero diacritic words in all six levels; DE uses Ä Ö Ü ß; ES adds Ñ and acute vowels; PT adds Ç Ã Õ Â Ê Ô; FR has 12 diacritics; IT only À È Ì Ò Ù — about 24 distinct graphemes, in 1–29% of words per pack. The share card payload carries no per-miss data (ADR 0036), only won/lives/streak. UI copy in Hiato is English-only; pack content is in the target language.

## Decision

1. **One trigger, reused.** An "accent miss" is exactly `isDiacriticHintMiss`. The life rule, the hint counter, and the micro-lesson all read the same predicate; no second definition exists.
2. **Teach at every level.** On an accent miss the round shows one line explaining the accent of the hidden target grapheme (first unrevealed diacritic whose base matches the pressed key; if the pressed key itself is a diacritic, the first unrevealed diacritic). The line comes from a static per-grapheme English map (`ACCENT_TEACH`, keyed by uppercased NFC grapheme, ~24 entries plus a generic fallback) and renders as a transient `role="status"` line under the `LetterGrid`, cleared on the next key.
3. **Forgive by CEFR band.** At A1–A2 (Andreas, 2026-11-09) an accent miss explains and the learner keeps the life; from B1 it also counts as a miss (life lost). The forgiven miss still increments the ADR 0015 hint counter and still marks the key as used/wrong — only the life is spared.
4. **Scope: all non-EN packs.** The rule is gated on `lang !== 'en'`, so English Packs are unchanged even if a future EN loanword carries a diacritic. DE/ES/PT/FR/IT all get the rule.
5. **Share card unchanged.** Its payload has no per-miss field; lives-left already reflects forgiven misses. Daily, Practice, and Pocket rounds all follow the same CEFR rule.

## Options Considered

| Option | Pros | Cons |
| --- | --- | --- |
| Reuse `isDiacriticHintMiss` as the single accent-miss definition (chosen) | One predicate for hint counter, life rule, and teaching; no new semantics to test | Couples teaching to the hint counter's definition |
| Any miss while a diacritic is hidden | Broader teaching | Noisy: unrelated letters (X, Z) would trigger accent lines |
| Per-language micro-lesson copy | Teaches in the target language | UI copy is English-only by convention; ×6 languages of new copy and review |
| Static per-grapheme map + transient line under the grid (chosen) | ~24 finite entries, one line, no clutter in the hint strip, `role="status"` announces it | English-only line; needs a fallback for future graphemes |
| Toast / dialog / hint-strip placement | More visible | Clutters the play strip — the issue explicitly forbids that; breaks the inline-note house pattern |
| Share-card marker for forgiven accent misses | Visible on the card | Payload has no per-miss field; lives-left already encodes it |

## Consequences

- New pure module `src/engine/accents.ts` (`accentMissTarget`, `isForgivenAccentMiss`, `ACCENT_TEACH` + `accentTeachLine`), exported from `src/engine/index.ts`; unit tests in `src/engine/accents.test.ts` (bun:test, ADR 0014). `src/pages/Play.tsx` `onKey` miss branch renders the line and gates the life decrement on `isForgivenAccentMiss`; copy pinned in `src/pages/copy.test.ts`; Playwright e2e covers A1 forgiven vs B1 counted.
- No pack schema change, no new dependency, no share-card change; Stats/history need no change because lives-left already reflects forgiveness.
- Risk accepted: retention lift at B1+ DE/ES/PT is unknown (noted in #75) — measure later via the cookieless analytics (ADR 0047), do not build now. Revisit this ADR if analytics contradict the band split.
