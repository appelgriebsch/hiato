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
  /** Chrome pauses the synth; resume before the delayed speak. */
  resume?: () => void
  /**
   * When either flag is present, a speak() that leaves both false did not
   * queue (Chrome/Safari drop cancel+speak in the same turn).
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
  /**
   * Schedules the post-cancel speak.
   * Default: `setTimeout(fn, SPEAK_AFTER_CANCEL_MS)`.
   * Chrome/Safari drop `speak()` in the same turn as `cancel()`.
   */
  schedule?: (fn: () => void, delayMs: number) => void
  /** Fires when the active utterance ends or errors, or when speak never queues. */
  onDone?: () => void
}

/**
 * Gap between `cancel()` and `speak()` so a repeat tap is not dropped.
 * Resume runs inside this turn, immediately before speak.
 */
export const SPEAK_AFTER_CANCEL_MS = 50

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

type Inflight = {
  generation: number
  timer: ReturnType<typeof setTimeout> | null
  abandon: () => void
}

let inflight: Inflight | null = null

function abandonInflight() {
  const prev = inflight
  inflight = null
  if (!prev) return
  if (prev.timer !== null) clearTimeout(prev.timer)
  prev.abandon()
}

function defaultSchedule(fn: () => void, delayMs: number) {
  const timer = setTimeout(() => {
    if (inflight?.timer === timer) inflight.timer = null
    fn()
  }, delayMs)
  if (inflight) inflight.timer = timer
}

function utteranceQueued(synth: SpeechSynthLike): boolean {
  const hasPending = typeof synth.pending === 'boolean'
  const hasSpeaking = typeof synth.speaking === 'boolean'
  if (!hasPending && !hasSpeaking) return true
  return synth.pending === true || synth.speaking === true
}

/**
 * Speak the lemma with a voice matching pack lang (local preferred).
 * Cancels any prior utterance, then resumes and speaks after a short delay.
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
      let ended = false
      const finish = () => {
        ended = true
        retainedUtterances.delete(utterance)
        if (generation !== speakGeneration) return
        emitActivity(false)
        opts.onDone?.()
      }
      utterance.onend = finish
      utterance.onerror = finish

      // Drop a speak that has not queued yet. Do not emit "idle" — the new
      // attempt below is the active one. Already-queued audio ends via onerror.
      abandonInflight()
      emitActivity(true)

      try {
        synth.cancel()
      } catch {
        /* still attempt the new utterance */
      }

      const releaseQuiet = () => {
        retainedUtterances.delete(utterance)
        utterance.onend = null
        utterance.onerror = null
      }

      const failQueued = () => {
        releaseQuiet()
        if (generation === speakGeneration) {
          emitActivity(false)
          opts.onDone?.()
        }
        settle(false)
      }

      const kick = () => {
        if (generation !== speakGeneration) {
          releaseQuiet()
          settle(false)
          return
        }
        try {
          try {
            synth.resume?.()
          } catch {
            /* resume is a hint; speak is what must queue */
          }
          synth.speak(utterance)
          if (ended) {
            settle(true)
            return
          }
          if (!utteranceQueued(synth)) {
            failQueued()
            return
          }
          settle(true)
        } catch {
          failQueued()
        }
      }

      const abandon = () => {
        if (settled) return
        releaseQuiet()
        settle(false)
      }

      inflight = { generation, timer: null, abandon }
      const schedule = opts.schedule ?? defaultSchedule
      try {
        schedule(kick, SPEAK_AFTER_CANCEL_MS)
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
