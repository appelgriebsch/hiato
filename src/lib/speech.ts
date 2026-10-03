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
  /** Chrome pauses the synth; resume in the same turn as speak. */
  resume?: () => void
  /**
   * When either flag is present, a speak() that leaves both false did not
   * queue (engine refused the utterance).
   */
  speaking?: boolean
  pending?: boolean
  addEventListener?: (type: 'voiceschanged', listener: () => void) => void
  removeEventListener?: (type: 'voiceschanged', listener: () => void) => void
}

/** Injectable utterance so speakLemma stays unit-testable. */
export type SpeechUtteranceLike = {
  text: string
  lang: string
  voice: SpeechVoiceLike | null
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

/** Lemma we queued and have not yet ended. Idle synth must not be cancel()'d. */
let activeSpeech: ActiveSpeech | null = null

function engineBusy(synth: SpeechSynthLike): boolean {
  return (
    activeSpeech !== null ||
    synth.speaking === true ||
    synth.pending === true
  )
}

function utteranceQueued(synth: SpeechSynthLike): boolean {
  const hasPending = typeof synth.pending === 'boolean'
  const hasSpeaking = typeof synth.speaking === 'boolean'
  if (!hasPending && !hasSpeaking) return true
  return synth.pending === true || synth.speaking === true
}

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
 * `cancel()` runs only when a prior utterance is still active. Cancelling an
 * idle synth pauses Chrome and swallows the next speak. After a cancel, resume
 * and speak still happen in this same turn — never behind a timer.
 *
 * Resolves true only if speak() actually queued. Soft-fails (false, no throw)
 * when speechSynthesis is missing, no usable voice, or the engine drops it.
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
      utterance.lang = voice.lang

      const generation = ++speakGeneration
      retainedUtterances.add(utterance)
      const record: ActiveSpeech = {
        generation,
        ended: false,
        finish: () => {},
      }
      const finish = () => {
        if (record.ended) return
        record.ended = true
        retainedUtterances.delete(utterance)
        if (activeSpeech === record) activeSpeech = null
        if (generation !== speakGeneration) return
        emitActivity(false)
        opts.onDone?.()
      }
      record.finish = finish
      utterance.onend = finish
      utterance.onerror = finish

      const releaseQuiet = () => {
        record.ended = true
        retainedUtterances.delete(utterance)
        utterance.onend = null
        utterance.onerror = null
        if (activeSpeech === record) activeSpeech = null
      }

      const failQueued = () => {
        releaseQuiet()
        if (generation === speakGeneration) {
          emitActivity(false)
          opts.onDone?.()
        }
        settle(false)
      }

      // Replace an in-flight lemma before starting the new one. Do this only
      // when something is actually speaking — cancel() on an idle synth is
      // what makes the first tap silent on Chrome.
      const previous = activeSpeech
      if (engineBusy(synth)) {
        try {
          synth.cancel()
        } catch {
          /* still attempt the new utterance */
        }
        if (previous && !previous.ended) previous.finish()
      }

      emitActivity(true)

      try {
        // Chrome leaves the synth paused; resume must happen in this same
        // gesture turn, immediately around speak(), not in a later task.
        resumeSynth(synth)
        synth.speak(utterance)
        resumeSynth(synth)
        if (record.ended) {
          settle(true)
          return
        }
        if (!utteranceQueued(synth)) {
          failQueued()
          return
        }
        activeSpeech = record
        settle(true)
      } catch {
        failQueued()
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
