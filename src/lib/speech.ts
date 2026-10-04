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
  /** Drops the queue. The speak path does not call this. */
  cancel: () => void
  speak: (utterance: SpeechUtteranceLike) => void
  /**
   * Un-pause only. Call it only after speak(), and only when paused is
   * already true. Current WebKit and Chromium no-op resume() when paused
   * is false. That call does not swallow a speak() that just queued.
   */
  resume?: () => void
  /**
   * Engine flags. WebKit can set `speaking` before the platform speaks.
   * That is not a reason to cancel. A tap while a speak has not ended
   * does not speak again. On an idle synth, `paused` is the only resume
   * signal, and only after speak().
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
  /** Fires when this utterance ends or errors and this call is still current. */
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

/**
 * Hyphenated BCP-47 defaults. Used when a live voice tag has no region
 * (`en` → `en-US`) and when getVoices() is empty at speak time.
 */
const PACK_DEFAULT_UTTERANCE_LANG: Record<PackLang, string> = {
  en: 'en-US',
  de: 'de-DE',
  es: 'es-ES',
  pt: 'pt-BR',
}

/**
 * Last non-empty `getVoices()` snapshot. Updated from canSpeak checks,
 * subscribeSpeechAvailability, and voiceschanged. A shallow copy: iOS
 * clears the live array in place (`voices.length = 0`), and that must
 * not wipe the cache. The cache only decides whether the control is
 * shown. An empty list at speak time does not assign these objects;
 * utterance.voice stays null and utterance.lang is the pack default.
 * A second getVoices() in the same turn does not refill a WebKit list
 * that is already an empty cache.
 */
let cachedVoices: readonly SpeechVoiceLike[] = []

/**
 * Drop the voice-list cache and the page-session prime/unlock hooks.
 * Tests only — production never clears it.
 */
export function clearCachedSpeechVoices(): void {
  cachedVoices = []
  speechGestureUnlocked = false
  if (voicesChangedUnsub) {
    const unsub = voicesChangedUnsub
    voicesChangedUnsub = null
    try {
      unsub()
    } catch {
      /* test cleanup must not throw */
    }
  }
}

function rememberVoices(voices: readonly SpeechVoiceLike[]) {
  // Shallow copy. The engine mutates the live array in place; storing
  // that same array would drop every cached voice on `length = 0`.
  if (voices.length > 0) cachedVoices = voices.slice()
}

type VoiceRead = { voices: SpeechVoiceLike[]; threw: boolean }

function readVoices(synth: SpeechSynthLike): VoiceRead {
  try {
    const voices = synth.getVoices()
    const list = Array.isArray(voices) ? voices : []
    if (list.length > 0) rememberVoices(list)
    return { voices: list, threw: false }
  } catch {
    return { voices: [], threw: true }
  }
}

/**
 * Once-per-page earlier-gesture latch. Unlock is prime-only: no platform
 * speak. A silent unlock utterance is not activeSpeech and would sit ahead
 * of the EndCard lemma (Avery #124). Latch when synth is available so Play
 * can stop retrying after a successful earlier gesture.
 */
let speechGestureUnlocked = false

/** Detach the module voiceschanged listener. Null until prime binds one. */
let voicesChangedUnsub: (() => void) | null = null

/**
 * One voiceschanged listener for the page. iOS often leaves getVoices()
 * empty until this fires. rememberVoices runs here, before any EndCard
 * tap, so the click path never waits on the event.
 */
function bindVoicesChanged(synth: SpeechSynthLike): void {
  if (voicesChangedUnsub) return
  if (typeof synth.addEventListener !== 'function') return
  const onVoices = () => {
    try {
      const read = readVoices(synth)
      if (!read.threw && read.voices.length === 0) readVoices(synth)
    } catch {
      /* voiceschanged must not throw into the engine */
    }
  }
  try {
    synth.addEventListener('voiceschanged', onVoices)
    voicesChangedUnsub = () => {
      try {
        synth.removeEventListener?.('voiceschanged', onVoices)
      } catch {
        /* already gone */
      }
    }
  } catch {
    /* soft */
  }
}

/**
 * Sync voice prime. getVoices() (and a second read when the first list is
 * empty) plus a one-time voiceschanged listener. Never speaks, never
 * awaits, never throws. Play calls this on mount and on earlier
 * card/reveal taps so the control can appear once a voice has been
 * seen. The speak button does not prime.
 */
export function primeSpeechVoices(opts: SpeakLemmaOptions = {}): void {
  try {
    const synth = opts.getSynth ? opts.getSynth() : defaultSynth()
    if (!synth) return
    bindVoicesChanged(synth)
    const first = readVoices(synth)
    if (!first.threw && first.voices.length === 0) readVoices(synth)
  } catch {
    /* soft — prime must never throw */
  }
}

/**
 * Earlier-gesture prime latch for iOS. Call from a Play pointerdown on
 * card/reveal taps — never the EndCard speak control. Primes getVoices /
 * voiceschanged only; does not call synth.speak(). A silent unlock
 * utterance is not activeSpeech and would queue ahead of the lemma
 * (Avery #124 Warning 1). The EndCard click runs speakLemma inside its
 * own user gesture. Soft-fail.
 *
 * Returns true when synth is available (or already latched). Returns false
 * when synth is missing so Play can retry on a later gesture.
 */
export function unlockSpeechGesture(opts: SpeakLemmaOptions = {}): boolean {
  try {
    primeSpeechVoices(opts)
    if (speechGestureUnlocked) return true
    const synth = opts.getSynth ? opts.getSynth() : defaultSynth()
    if (!synth) return false
    // Prime-only: no platform speak. Silent unlock removed (ADR 0037).
    speechGestureUnlocked = true
    return true
  } catch {
    /* soft — unlock must never throw */
    return false
  }
}

/**
 * Utterance lang: the voice tag with underscores turned into hyphens.
 * A bare language (`en`, `de`) is not hyphenated BCP-47, so use the pack
 * default (`en-US`, `de-DE`, `es-ES`, `pt-BR`).
 */
function utteranceLangFromVoice(voiceLang: string, packLang: PackLang): string {
  const hyphenated = voiceLang.trim().replace(/_/g, '-')
  if (hyphenated.includes('-')) return hyphenated
  return PACK_DEFAULT_UTTERANCE_LANG[packLang]
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
    const read = readVoices(synth)
    if (read.threw) return false
    return pickVoiceForLang(read.voices, packLang) !== null
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

/**
 * If onstart has not fired, clear the slot and resolve false.
 * Armed only after speak() returns. Does not call cancel() or speak().
 * Tests wait this plus a small slack — Bun's fake clock does not fire timers.
 */
export const SPEECH_START_WATCHDOG_MS = 3000

type ActiveSpeech = {
  /** True only after this attempt's onstart. */
  started: boolean
  ended: boolean
}

/**
 * Attempt passed to speak() and not yet ended, including before onstart.
 * A tap in that window does not speak again. The start timer clears an
 * unstarted attempt without cancel(). The next tap speaks once.
 */
let activeSpeech: ActiveSpeech | null = null

function resumeSynth(synth: SpeechSynthLike) {
  try {
    synth.resume?.()
  } catch {
    /* resume is a hint; speak is what must queue */
  }
}

/** iOS Ring/Silent mutes ambient audio. A pronunciation tap is playback. */
function setPlaybackAudioSession(): void {
  try {
    const nav = globalThis.navigator as
      | { audioSession?: { type?: string } }
      | null
      | undefined
    const session = nav?.audioSession
    if (!session) return
    session.type = 'playback'
  } catch {
    /* missing or read-only — speak() still runs */
  }
}

/**
 * Speak the lemma with a live pack voice, or with language only.
 *
 * `speak()` runs synchronously in the caller's turn. No await, timer, or
 * microtask before it. Do not call cancel() or resume() before speak().
 * resume() runs only after speak(), and only when paused is already true.
 * When audioSession exists, set its type to playback in this same turn,
 * immediately before speak(). Do not set it on load.
 *
 * A non-empty getVoices() uses the pack match (on-device first). An empty
 * list leaves voice null and sets lang to the pack default. A cached voice
 * object is never assigned. A non-empty list with no match does not speak.
 *
 * While this attempt has not ended, including before onstart, a later
 * speakLemma resolves true and does not speak. If onstart has not fired
 * after three seconds, clear the slot and resolve false. That timer does
 * not call cancel() or speak(). The utterance stays referenced until
 * onend or onerror. A late onstart emits speaking only while this attempt
 * is still the latest one, and does not flip a promise that already
 * resolved false. An older attempt does not reclaim the slot. speaking or
 * pending true is not a reason to cancel. Soft-fails when speechSynthesis
 * is missing, getVoices throws, or a non-empty list has no pack match.
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

    // Passed to speak() and not ended, including before onstart.
    // Leave that attempt alone. Do not cancel, speak, or resume.
    if (activeSpeech && !activeSpeech.ended) {
      settle(true)
      return
    }

    try {
      const synth = opts.getSynth ? opts.getSynth() : defaultSynth()
      if (!synth) {
        settle(false)
        return
      }
      // Sync reads only. A second getVoices() does not refill an empty
      // WebKit cache. A throw is not an empty list.
      const first = readVoices(synth)
      if (first.threw) {
        settle(false)
        return
      }
      let voices = first.voices
      if (voices.length === 0) {
        const second = readVoices(synth)
        if (!second.threw) voices = second.voices
      }

      // Live list: on-device match first, else any match. Empty list:
      // do not assign a cached voice. Lang only, voice null.
      let voice: SpeechVoiceLike | null = null
      let utteranceLang: string
      if (voices.length > 0) {
        voice = pickVoiceForLang(voices, packLang)
        if (!voice) {
          settle(false)
          return
        }
        utteranceLang = utteranceLangFromVoice(voice.lang, packLang)
      } else {
        voice = null
        utteranceLang = PACK_DEFAULT_UTTERANCE_LANG[packLang]
      }

      const text = utteranceTextForLemma(lemma)
      const create = opts.createUtterance ?? defaultCreateUtterance
      const utterance = create(text)
      utterance.text = text
      utterance.voice = voice
      utterance.lang = utteranceLang
      // Real SpeechSynthesisUtterance has volume. The test double does not;
      // assigning anyway would add a field the double never declared.
      if ('volume' in utterance) utterance.volume = 1

      const generation = ++speakGeneration
      retainedUtterances.add(utterance)
      const record: ActiveSpeech = {
        started: false,
        ended: false,
      }
      let watchdog: ReturnType<typeof setTimeout> | undefined
      const clearWatchdog = () => {
        if (watchdog === undefined) return
        clearTimeout(watchdog)
        watchdog = undefined
      }
      const finish = () => {
        if (record.ended) return
        record.ended = true
        clearWatchdog()
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
        if (!record.started) settle(false)
      }
      utterance.onend = finish
      utterance.onerror = finish
      utterance.onstart = () => {
        if (record.ended) return
        record.started = true
        clearWatchdog()
        // Only the latest attempt may reclaim an empty slot. A late
        // onstart from this attempt still turns speaking on. An older
        // attempt must not show Playing or block the next tap.
        if (generation !== speakGeneration) return
        if (activeSpeech !== null && activeSpeech !== record) return
        activeSpeech = record
        emitActivity(true)
        // Timer already settled false. Do not flip the promise.
        if (!settled) settle(true)
      }

      // Unstarted until onstart. Do not cancel from synth.speaking /
      // pending, and do not cancel in this turn. Holding the record
      // before speak() blocks a second tap until this attempt ends,
      // including when onstart has not fired. A sync onstart inside
      // speak() still sees this slot.
      activeSpeech = record

      try {
        // speak() is the first speechSynthesis mutation in this turn.
        // Playback session, when the API exists, sits immediately before it.
        setPlaybackAudioSession()
        synth.speak(utterance)
        if (synth.paused === true) resumeSynth(synth)
      } catch {
        // speak() threw — nothing queued. Sync onerror already finished.
        if (!record.ended) {
          record.ended = true
          clearWatchdog()
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

      // Happy path fires onstart or onerror inside speak(). Do not arm
      // a timer unless neither has run. The timer does not cancel, speak,
      // or resume. It clears the slot so the next tap can try, and leaves
      // the utterance referenced for a late onstart or onend.
      if (!record.started && !record.ended) {
        watchdog = setTimeout(() => {
          watchdog = undefined
          if (record.started || record.ended) return
          if (activeSpeech === record) activeSpeech = null
          settle(false)
        }, SPEECH_START_WATCHDOG_MS)
      }
    } catch {
      settle(false)
    }
  })
}

/**
 * Subscribe to speech availability for a pack language.
 * Handles the async `voiceschanged` load path (including an injected synth);
 * soft-fails when unsupported. An empty list stays unavailable until a
 * matching voice has been seen — by this subscription or already in the
 * module cache. After that, empty getVoices() keeps the control, including
 * on a brand-new subscription (Play changes lang and resubscribes). The
 * tap does not assign that cached voice. A non-empty list with no match
 * still hides.
 */

/**
 * Discover voices for the EndCard control. Capped, off the speak path.
 * speak() from a timer is dropped on iOS, so this must never speak.
 */
const VOICE_POLL_MS = 100
const VOICE_POLL_TRIES = 8

function pollVoicesForVisibility(notify: () => void): () => void {
  let tries = 0
  let timer: ReturnType<typeof setTimeout> | undefined
  const tick = () => {
    timer = setTimeout(() => {
      tries += 1
      try {
        notify()
      } catch {
        /* visibility must not throw */
      }
      if (tries < VOICE_POLL_TRIES) tick()
    }, VOICE_POLL_MS)
  }
  tick()
  return () => {
    if (timer !== undefined) clearTimeout(timer)
  }
}

export function subscribeSpeechAvailability(
  packLang: PackLang,
  onChange: (ok: boolean) => void,
  opts: SpeakLemmaOptions = {},
): () => void {
  // Seed from the module cache, not only voices this subscription has seen.
  // A resubscribe starts with getVoices() === [] on iOS; hiding then would
  // drop the control. Speak with an empty list uses lang only, not this
  // cache. A non-empty list with no match still hides. Missing synth hides.
  let everMatched = pickVoiceForLang(cachedVoices, packLang) !== null
  const notify = () => {
    try {
      const synth = opts.getSynth ? opts.getSynth() : defaultSynth()
      if (!synth) {
        onChange(false)
        return
      }
      const read = readVoices(synth)
      if (read.threw) {
        onChange(false)
        return
      }
      const matched = pickVoiceForLang(read.voices, packLang) !== null
      if (matched) everMatched = true
      if (!matched && everMatched && read.voices.length === 0) {
        onChange(true)
        return
      }
      onChange(matched)
    } catch {
      onChange(false)
    }
  }

  try {
    const synth = opts.getSynth ? opts.getSynth() : defaultSynth()
    if (!synth) {
      onChange(false)
      return () => {}
    }

    notify()

    // Visibility only. iOS may fill getVoices() without a reliable
    // voiceschanged. Never delays speakLemma — that path does not poll.
    const stopPoll = pollVoicesForVisibility(notify)

    if (typeof synth.addEventListener === 'function') {
      synth.addEventListener('voiceschanged', notify)
      return () => {
        stopPoll()
        synth.removeEventListener?.('voiceschanged', notify)
      }
    }
    return stopPoll
  } catch {
    onChange(false)
    return () => {}
  }
}
