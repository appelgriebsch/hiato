# ADR 0037: EndCard Web Speech

- Status: Accepted
- Date: 2026-10-03
- Deciders: Andreas Gerlach
- Epic: [#113](https://github.com/appelgriebsch/hiato/issues/113) — Hear the word / EndCard Web Speech
- References: Grill lock (Andreas 2026-10-03 via Solution Sage). Out: [#64](https://github.com/appelgriebsch/hiato/issues/64) accounts, [#75](https://github.com/appelgriebsch/hiato/issues/75) accent-as-success expansion.

## Context

After the lemma is revealed, the learner needs a pronunciation teach beat. Hiato is an offline PWA, so speech uses on-device voices the OS already has. `speechSynthesis` is a browser API; no CSP change.

## Decision

1. **Engine:** Web Speech API `speechSynthesis` only. No cloud TTS.
2. **Surface:** EndCard tap-to-speak. Speak the **lemma only**, and only after finish (win or lose).
3. **Modes:** Daily and practice.
4. **Unsupported:** Hide the control if `speechSynthesis` is missing or there is no usable voice.
5. **Not in v1:** No auto-play. No mid-round speak. No Settings voice picker.
6. **Out:** Accounts (#64). Accent-as-success expansion (#75).

## Consequences

- Voice quality is OS-dependent; we do not ship or pin a voice.
- The tap satisfies the iOS user-gesture requirement for `speechSynthesis`.
- iOS Safari drops `speak()` from load, timers, or promises. Prime with `getVoices()` and `voiceschanged` on Play mount (and the first earlier pointerdown). Earlier-gesture unlock is prime-only — no silent platform speak (a non-empty `' '` unlock would sit ahead of the lemma; empty string is dropped). The EndCard click still calls `speak()` synchronously in its own listener — no await, no cancel-then-lemma in that turn.
- The control stays hidden until a usable voice has been seen (live list or cache). Unsupported browsers degrade silently: the control is hidden, the EndCard otherwise unchanged.
