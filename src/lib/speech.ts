import type { PackLang } from '@/packs/schema'

/**
 * Minimal voice shape for pure matching (no SpeechSynthesisVoice required).
 * `localService` marks an on-device voice. We prefer that over a network
 * voice for the same language, but never pin a voice name (ADR 0037).
 */
export type SpeechVoiceLike = {
  lang: string
  localService?: boolean
}

/** Injectable synth surface so tests never need a real speech engine. */
export type SpeechSynthLike = {
  getVoices: () => SpeechVoiceLike[]
  cancel: () => void
  speak: (utterance: SpeechUtteranceLike) => void
  /**
   * Un-pause only. On Chrome and Safari, resume() while the synth is NOT
   * paused can swallow the following speak(), so callers must check paused.
   */
  resume?: () => void
  /**
   * Engine flags. They are not a queue signal: Chrome/WebKit may leave both
   * false in the same turn as a speak() that did queue. Stuck true is also
   * not our utterance — cancel only activeSpeech.
   * `paused` is the only signal for resume(): call it after speak(), and
   * only when this is already true.
   */
  speaking?: boolean
  pending?: boolean
  paused?: boolean
  addEventListener?: (type: 'voiceschanged', listener: () => void) => void
  removeEventListener?: (type: 'voiceschanged', listener: () => void) => void
}

/** Injectable utterance so speakLemma stays unit-testable. */
export type SpeechUtteranceLike = {
  text: string
  lang: string
  voice: SpeechVoiceLike | null
  /** Present on real SpeechSynthesisUtterance; omitted by the test double. */
  volume?: number
  onstart?: (() => void) | null
  onend?: (() => void) | null
  onerror?: (() => void) | null
}

export type SpeakLemmaOptions = {
  /** Override `speechSynthesis` (tests / soft-fail). */
  getSynth?: () => SpeechSynthLike | null | undefined
  /** Override utterance factory (defaults to SpeechSynthesisUtterance when available). */
  createUtterance?: (text: string) => SpeechUtteranceLike
  /** Fires when the active utterance ends or errors, or when speak never queues. */
  onDone?: () => void
}

/**
 * BCP-47 prefix for each pack language. Voice match is prefix-based
 * (`en`, `en-US`, `en_GB` all match `en`).
 */
export const SPEECH_LANG_PREFIX: Record<PackLang, string> = {
  en: 'en',
  de: 'de',
  es: 'es',
  pt: 'pt',
}

/** Normalize voice.lang for prefix compare (underscores → hyphens). */
export function normalizeVoiceLang(voiceLang: string): string {
  return voiceLang.trim().toLowerCase().replace(/_/g, '-')
}

/** True when `voiceLang` matches the pack language via BCP-47 prefix. */
export function voiceMatchesPackLang(
  voiceLang: string,
  packLang: PackLang,
): boolean {
  const normalized = normalizeVoiceLang(voiceLang)
  if (!normalized) return false
  const prefix = SPEECH_LANG_PREFIX[packLang]
  return normalized === prefix || normalized.startsWith(`${prefix}-`)
}

/**
 * Voice for `packLang`: first `localService === true` match, otherwise the
 * first remote (or unspecified) match. Null when nothing matches.
 */
export function pickVoiceForLang<T extends SpeechVoiceLike>(
  voices: readonly T[],
  packLang: PackLang,
): T | null {
  let remote: T | null = null
  for (const voice of voices) {
    if (!voiceMatchesPackLang(voice.lang, packLang)) continue
    if (voice.localService === true) return voice
    if (remote === null) remote = voice
  }
  return remote
}

/** Utterance text is the lemma string only — never gloss or a sentence. */
export function utteranceTextForLemma(lemma: string): string {
  return lemma
}

function defaultSynth(): SpeechSynthLike | null {
  if (typeof globalThis.speechSynthesis === 'undefined') return null
  return globalThis.speechSynthesis as unknown as SpeechSynthLike
}

function defaultCreateUtterance(text: string): SpeechUtteranceLike {
  if (typeof SpeechSynthesisUtterance === 'undefined') {
    return { text, lang: '', voice: null }
  }
  return new SpeechSynthesisUtterance(text) as unknown as SpeechUtteranceLike
}

/**
 * True when speechSynthesis exists and at least one usable voice matches
 * the pack language. Soft — never throws. A remote voice still counts;
 * hide only when no match remains.
 */
export function canSpeakLemma(
  packLang: PackLang,
  opts: SpeakLemmaOptions = {},
): boolean {
  try {
    const synth = opts.getSynth ? opts.getSynth() : defaultSynth()
    if (!synth) return false
    const voices = synth.getVoices()
    return pickVoiceForLang(voices, packLang) !== null
  } catch {
    return false
  }
}

/** Utterances kept alive until onend/onerror so Chrome does not GC them. */
const retainedUtterances = new Set<SpeechUtteranceLike>()

/** Utterances still held (module ref). Empty after onend/onerror. */
export function retainedSpeechUtterances(): readonly SpeechUtteranceLike[] {
  return [...retainedUtterances]
}

type ActivityListener = (speaking: boolean) => void
const activityListeners = new Set<ActivityListener>()

/** Brief speaking flag for the EndCard icon. No copy, no stop control. */
export function subscribeSpeakActivity(
  listener: ActivityListener,
): () => void {
  activityListeners.add(listener)
  return () => {
    activityListeners.delete(listener)
  }
}

function emitActivity(speaking: boolean) {
  for (const listener of activityListeners) {
    try {
      listener(speaking)
    } catch {
      /* UI listener must not break speak */
    }
  }
}

let speakGeneration = 0

type ActiveSpeech = {
  generation: number
  ended: boolean
  finish: () => void
}

/**
 * Lemma we passed to speak() and have not yet ended.
 * Cancel only this — never because synth.speaking/pending looks stuck.
 */
let activeSpeech: ActiveSpeech | null = null

function resumeSynth(synth: SpeechSynthLike) {
  try {
    synth.resume?.()
  } catch {
    /* resume is a hint; speak is what must queue */
  }
}

/**
 * Speak the lemma with a voice matching pack lang (local preferred).
 *
 * `speak()` runs synchronously in the caller's turn. EndCard calls this from
 * the button click, so the utterance stays inside the user gesture. A delay
 * (the old 50ms post-cancel timer) drops iOS/Safari and often Chrome: the
 * control stays visible, the tap is silent.
 *
 * `cancel()` runs only when activeSpeech is set (an utterance we started and
 * have not finished). Cancelling an idle synth pauses Chrome and swallows the
 * next speak. Stuck synth.speaking / pending is not our utterance, so it must
 * not cancel. After a cancel, speak still happens in this same turn — never
 * behind a timer. Same-turn cancel()+speak() can be dropped by Chrome/WebKit;
 * a timer would miss the user-gesture turn, so we still speak synchronously
 * when we interrupt our own utterance.
 *
 * resume() runs only when synth.paused is already true, and only after
 * speak(). resume() on a synth that is not paused swallows the utterance on
 * real Chrome and Safari (no onstart). Do not resume before speak, and do
 * not resume an idle synth.
 *
 * The utterance stays referenced until onend/onerror. speaking/pending still
 * false in this turn is not a failed queue — those flags are not specified to
 * flip before we return. Resolves true only once this utterance fires onstart.
 * A synchronous onerror, or speak() throwing, resolves false. Soft-fails
 * (false, no throw) when speechSynthesis is missing or no usable voice.
 */
export function speakLemma(
  lemma: string,
  packLang: PackLang,
  opts: SpeakLemmaOptions = {},
): Promise<boolean> {
  return new Promise((resolve) => {
    let settled = false
    const settle = (ok: boolean) => {
      if (settled) return
      settled = true
      resolve(ok)
    }

    try {
      const synth = opts.getSynth ? opts.getSynth() : defaultSynth()
      if (!synth) {
        settle(false)
        return
      }
      const voice = pickVoiceForLang(synth.getVoices(), packLang)
      if (!voice) {
        settle(false)
        return
      }

      const text = utteranceTextForLemma(lemma)
      const create = opts.createUtterance ?? defaultCreateUtterance
      const utterance = create(text)
      utterance.text = text
      utterance.voice = voice
      // voice.lang may use underscores (de_DE). Utterance lang is BCP-47.
      utterance.lang = voice.lang.replace(/_/g, '-')
      // Real SpeechSynthesisUtterance has volume. The test double does not;
      // assigning anyway would add a field the double never declared.
      if ('volume' in utterance) utterance.volume = 1

      const generation = ++speakGeneration
      retainedUtterances.add(utterance)
      const record: ActiveSpeech = {
        generation,
        ended: false,
        finish: () => {},
      }
      let started = false
      const finish = () => {
        if (record.ended) return
        record.ended = true
        retainedUtterances.delete(utterance)
        utterance.onstart = null
        utterance.onend = null
        utterance.onerror = null
        if (activeSpeech === record) activeSpeech = null
        if (generation === speakGeneration) {
          emitActivity(false)
          opts.onDone?.()
        }
        // onend/onerror without onstart is not success (and must not hang).
        if (!started) settle(false)
      }
      record.finish = finish
      utterance.onend = finish
      utterance.onerror = finish
      utterance.onstart = () => {
        if (record.ended || settled) return
        if (generation !== speakGeneration) return
        started = true
        settle(true)
      }

      // Interrupt only an utterance we queued and have not finished.
      // synth.speaking / pending stuck true must not cancel: that pauses
      // Chrome and the following speak() in this turn is dropped.
      if (activeSpeech !== null) {
        const previous = activeSpeech
        try {
          synth.cancel()
        } catch {
          /* still attempt the new utterance */
        }
        if (!previous.ended) previous.finish()
      }

      activeSpeech = record
      emitActivity(true)

      try {
        // speak() first, in this gesture turn. resume() before speak, or
        // resume() when the synth is not paused, swallows the utterance on
        // Chrome and Safari. Resume only a synth that is already paused,
        // and only after speak() has been called. No timer.
        synth.speak(utterance)
        if (synth.paused === true) resumeSynth(synth)
      } catch {
        // speak() threw — nothing queued. Sync onerror already finished.
        if (!record.ended) {
          record.ended = true
          retainedUtterances.delete(utterance)
          utterance.onstart = null
          utterance.onend = null
          utterance.onerror = null
          if (activeSpeech === record) activeSpeech = null
          if (generation === speakGeneration) {
            emitActivity(false)
            opts.onDone?.()
          }
        }
        settle(false)
      }
    } catch {
      settle(false)
    }
  })
}

/**
 * Subscribe to speech availability for a pack language.
 * Handles the async `voiceschanged` load path (including an injected synth);
 * soft-fails when unsupported. Still-empty voice lists stay unavailable.
 */
export function subscribeSpeechAvailability(
  packLang: PackLang,
  onChange: (ok: boolean) => void,
  opts: SpeakLemmaOptions = {},
): () => void {
  const notify = () => {
    onChange(canSpeakLemma(packLang, opts))
  }

  try {
    const synth = opts.getSynth ? opts.getSynth() : defaultSynth()
    if (!synth) {
      onChange(false)
      return () => {}
    }

    notify()

    if (typeof synth.addEventListener === 'function') {
      synth.addEventListener('voiceschanged', notify)
      return () => {
        synth.removeEventListener?.('voiceschanged', notify)
      }
    }
    return () => {}
  } catch {
    onChange(false)
    return () => {}
  }
}
