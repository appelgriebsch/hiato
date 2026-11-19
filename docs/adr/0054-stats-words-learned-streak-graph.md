# ADR 0054: Stats depth — words-learned set in its own key + streak graph derived on read

- **Status**: Proposed
- **Date**: 2026-11-19
- **Deciders**: Andreas Gerlach (locked in solution-engineering grilling for #298, 2026-11-19; plan reviewed by domain-expert and ui-ux-expert)
- **Supersedes**: none (extends ADR 0045)
- **Related issues**: #298 (roadmap item), #309 (implementation plan)

## Context

Issue #298 asks for two proof-of-progress signals on the Stats sheet (ADR 0045): a cumulative words-learned counter per `lang|cefr` slot (distinct words won in Daily + Pocket rounds) and a Streak-over-time graph. Constraints found in the code: the `hiato.history` ring buffer evicts past 50 entries per slot, so it cannot back a cumulative distinct-word counter; `hiato.daily` keeps only the latest record per slot and `hiato.pocket` caps at 5 entries, so those keys decay. Learned words are naturally bounded by pack size (400 lemmas per lang×CEFR pack). Storage is guest-local localStorage and must stay bounded (ADR 0045 rationale). Pocket rounds must stay excluded from win rate (ADR 0045 amendment) while still counting learned words (#298 acceptance criteria).

## Decision

1. **Words-learned gets its own key (D1).** `hiato.learned` = `{ v: 1, slots: { 'lang|cefr': string[] } }`, each slot a validated, deduped array of `lemmaIdentity` strings, capped at 4096 entries on read (`LEARNED_READ_CAP`; only bounds hand-edited junk — packs hold 400). Written by `recordLearned(slot, word)` on Daily wins and Pocket wins. `hiato.history` keeps its v1 shape; no migration.
2. **Scope (D2).** Learned = distinct words won in Daily + Pocket rounds only. Practice wins do not count. Pocket rounds still never enter `hiato.history`, so win rate stays Pocket-free without extra filtering.
3. **Streak graph derived on read (D3).** `streakHistory(slot)` in `src/lib/history.ts` folds the `mode === 'daily'` entries of the ring buffer (last entry per dateKey, ascending) with the same rule as `nextStreakOnWin`: consecutive day → streak + 1, any gap → restart at 1, lost day → 0. No new storage. Accepted limit: a freeze-spent missed day (ADR 0046) appears as a break, because history stores no freeze record.
4. **UI placement (D4).** Stats sheet shows "Words learned" as a third headline row in the existing `<dl>`, and a "Streak history" section above "Wins by lives left" (one bar per recorded daily day, height = running streak, lost day = danger baseline marker). A1/A2 prefill auto-wins count as learned — they are already recorded as wins with 6 lives.

## Options Considered

| Option | Pros | Cons |
| --- | --- | --- |
| Separate `hiato.learned` key (chosen) | Survives ring-buffer eviction; ADR 0045 storage shape untouched; Pocket stays out of win rate for free; bounded by pack size | One more localStorage key |
| `word` on `HistoryEntry` + `mode: 'pocket'` in the ring buffer | Single store | Eviction past 50 undercounts learned words; rewrites the amended ADR 0045; win-rate exclusion needs an extra filter |
| Derive learned words from `hiato.daily` + `hiato.pocket` | No new key | Decays: latest record only / cap 5 |
| Streak graph derived on read from the ring buffer (chosen) | Zero new storage, one pure function | Covers ≤50 recorded rounds; freeze-spent days look like breaks |
| Streak graph from stored per-day snapshots | Exact, could include freezes | Duplicates data the ring buffer already holds; extra write per day |

## Consequences

- New module `src/lib/learned.ts` (+ `learned.test.ts`); `streakHistory` + tests in `src/lib/history.ts` / `history.test.ts`; three write sites in `src/pages/Play.tsx` (`persistDaily` win, `endGame` pocket win, pocket prefill win); `StatsSheet.tsx` gains the headline row, the graph section, and new `.streak-bar*` CSS in `index.css`; GLOSSARY.md and `docs/design/retro/spec.md` §5.7 updated; the e2e landscape stats test is extended. `bun test` green required.
- No migration and no backfill: `hiato.learned` starts empty and fills from the first win after deploy (same policy as ADR 0045). Clearing site data wipes the counter, consistent with Stats.
- Risks accepted: R1 freeze-spent days render as streak breaks in the graph; R2 the graph covers only the last ≤50 recorded rounds per slot (the counter is unaffected); R3 multi-tab writes are last-write-wins, same as the other localStorage stores; R4 existing users start at 0 learned words.
- Revisit this ADR if pack sizes ever grow unbounded (re-check `LEARNED_READ_CAP`), or if cookieless analytics (ADR 0047) show learners want streak history beyond 50 days — then weigh stored per-day snapshots again.
