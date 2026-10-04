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
- The speak control listens for `pointerup` and `click`. `speakLemma` runs synchronously in that handler — no await, timer, or microtask before `speak()`. If this tap already spoke from `pointerup`, the following `click` is ignored. A keyboard click with no `pointerup` still speaks. The speak button's capture `pointerdown` does not call `primeSpeechVoices` and does not touch `speechSynthesis`. Earlier card and reveal taps still prime. Unlock stays prime-only (no silent platform speak).
- Immediately before `speak()`, when `navigator.audioSession` exists, `audioSession.type` is set to `playback` so iOS does not treat the pronunciation as ambient (the Ring/Silent switch). It is not set on load. The assignment is skipped when the API is missing.
- A `getVoices()` match in this turn is assigned (on-device voice first). When the list is empty, `utterance.voice` stays null and `utterance.lang` is the pack default (`en-US`, `de-DE`, `es-ES`, `pt-BR`). A cached voice object is not assigned. The control stays hidden until a usable voice has been seen.
- `speak()` is the first `speechSynthesis` mutation on that tap (`cancel` and `resume` do not run before it). That turn does not call `cancel()`. `resume()` runs only after `speak()`, and only when `paused` is already true. A second tap while this attempt has not ended does not speak again.
- If `onstart` has not fired after three seconds, the slot is cleared and the promise resolves false. That timer does not call `cancel()` or `speak()`. The utterance stays referenced until `onend` or `onerror`. A late `onstart` still turns the speaking flag on and clears the failure line. LemmaTeach shows "Could not play the word." for that timer result, not only for a same-turn false.
- iOS Safari drops `speak()` from load, timers, or promises. `registerType` stays `prompt`. Proving audio still needs a physical iPhone after the service-worker update is accepted.
- Unsupported browsers degrade silently: the control is hidden, the EndCard otherwise unchanged.
