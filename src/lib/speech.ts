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
   * On an idle synth, `paused` is the only resume signal, and only after
   * speak(). After our own cancel(), the flag often stays false even though
   * Chrome is paused — do not use it to skip resume on that path.
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

/**
 * Hyphenated BCP-47 defaults when a cached voice tag has no region
 * (`en` → `en-US`). iOS often hands back an empty list at tap time, so
 * the utterance still needs a real lang.
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
 * not wipe the cache. When getVoices() is empty at speak time, assign
 * the cached voice (localService first). iOS Safari ignores
 * utterance.lang unless a real voice object is set.
 */
let cachedVoices: readonly SpeechVoiceLike[] = []

/**
 * Drop the voice-list cache and the page-session prime/unlock hooks.
 * Tests only — production never clears it.
 */
export function clearCachedSpeechVoices(): void {
  cachedVoices = []
  speechGestureUnlocked = false
  speechGestureUnlockInFlight = false
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
 * Once-per-page silent unlock. The silent utterance is not activeSpeech:
 * EndCard speakLemma must not cancel it. Latch only after onstart so a
 * skipped or no-op unlock can retry on a later gesture.
 */
let speechGestureUnlocked = false
/** True while a silent unlock utterance is queued and awaiting onstart. */
let speechGestureUnlockInFlight = false

/**
 * Silent unlock text. Must be non-empty: some engines drop `speak('')`
 * entirely or leave a stuck queue entry. A single space with volume 0
 * is inaudible but still a real utterance the platform will accept.
 */
export const SPEECH_UNLOCK_TEXT = ' '

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
 * awaits, never throws. Play calls this on mount and again inside an
 * earlier user gesture so the EndCard click finds a cached voice.
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
 * iOS Safari drops speak() that is not inside a user gesture. Call this
 * from an earlier Play pointerdown (card/reveal taps — never the EndCard
 * speak control). Speaks one non-empty silent utterance at volume 0,
 * once per page session, without cancel() and without touching
 * activeSpeech / speakLemma. Soft-fail.
 *
 * Returns true only when unlock has actually started (onstart) or was
 * already unlocked. Returns false when synth is missing, create/speak
 * fails, or speak was queued but onstart has not fired yet — so Play
 * can retry on a later gesture. Does not latch success before speak
 * returns if the engine can no-op without throwing.
 */
export function unlockSpeechGesture(opts: SpeakLemmaOptions = {}): boolean {
  try {
    primeSpeechVoices(opts)
    if (speechGestureUnlocked) return true
    if (speechGestureUnlockInFlight) return false
    const synth = opts.getSynth ? opts.getSynth() : defaultSynth()
    if (!synth) return false
    const create = opts.createUtterance ?? defaultCreateUtterance
    let utterance: SpeechUtteranceLike
    try {
      utterance = create(SPEECH_UNLOCK_TEXT)
    } catch {
      return false
    }
    // Non-empty: empty string is dropped or stuck on some engines (Avery).
    utterance.text = SPEECH_UNLOCK_TEXT
    if ('volume' in utterance) utterance.volume = 0
    retainedUtterances.add(utterance)
    speechGestureUnlockInFlight = true
    const release = () => {
      speechGestureUnlockInFlight = false
      retainedUtterances.delete(utterance)
      utterance.onstart = null
      utterance.onend = null
      utterance.onerror = null
    }
    utterance.onstart = () => {
      // Latch only after the engine accepted the utterance.
      speechGestureUnlocked = true
      speechGestureUnlockInFlight = false
    }
    utterance.onend = release
    utterance.onerror = release
    try {
      // No cancel(). No activeSpeech. Queue only; let onend release it.
      synth.speak(utterance)
    } catch {
      release()
      return false
    }
    // Sync engines (and test doubles) fire onstart inside speak().
    // Async / no-op engines leave this false so a later gesture can retry.
    return speechGestureUnlocked
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
 * Idle (this turn did not cancel): speak() first, then resume() only when
 * synth.paused is already true. resume() before speak, or resume() on an
 * idle unpaused synth, swallows the utterance on real Chrome and Safari
 * (no onstart).
 *
 * If this turn called cancel() because activeSpeech was set: speak() in
 * the same turn, then resume() even when paused is still false. Cancel
 * leaves Chrome paused, but the flag often has not flipped by the time
 * cancel() returns, so reading paused would skip resume and drop the
 * second tap. Do not decide that resume from paused. No timer.
 *
 * The utterance stays referenced until onend/onerror. speaking/pending still
 * false in this turn is not a failed queue — those flags are not specified to
 * flip before we return. Resolves true only once this utterance fires onstart.
 * A synchronous onerror, or speak() throwing, resolves false. Soft-fails
 * (false, no throw) when speechSynthesis is missing, getVoices throws, or a
 * non-empty list has no pack match.
 *
 * iOS Safari often returns [] from getVoices() except around voiceschanged.
 * At speak time, read the list and, if it is empty, read once more in this
 * same turn. If both are empty, still call speak() when a previous non-empty
 * list had a match: assign that cached voice (localService first) and
 * set utterance.lang from its tag (hyphenated, or the pack default).
 * iOS Safari often ignores utterance.lang unless a real voice object is
 * assigned, so voice must not stay null once a match was cached. If
 * there is truly no cache, return false and do not speak. No await,
 * timer, or microtask before speak(). Never resume() before speak().
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
      // Sync reads only. iOS may return [] on the first click-time call
      // and a real list on the second. A throw is not an empty list.
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

      // Fresh list: prefer localService, then any match, and assign that
      // object. Empty list: the same pick on the cached snapshot. voice
      // stays null only when there is no cached match — then we do not speak.
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
        voice = pickVoiceForLang(cachedVoices, packLang)
        if (!voice) {
          settle(false)
          return
        }
        utteranceLang = utteranceLangFromVoice(voice.lang, packLang)
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
      // Remember the cancel itself. paused often stays false until after
      // cancel() returns, so it cannot decide the following resume.
      const cancelledOwn = activeSpeech !== null
      if (cancelledOwn) {
        const previous = activeSpeech
        try {
          synth.cancel()
        } catch {
          /* still attempt the new utterance */
        }
        if (previous !== null && !previous.ended) previous.finish()
      }

      activeSpeech = record
      emitActivity(true)

      try {
        // speak() first, in this gesture turn. Never resume before speak.
        // Idle and unpaused: do not resume (that swallows the utterance).
        // Idle and already paused: resume only after speak().
        // Cancel path: resume after speak even if paused is still false.
        // No timer.
        synth.speak(utterance)
        if (cancelledOwn || synth.paused === true) resumeSynth(synth)
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
 * soft-fails when unsupported. An empty list stays unavailable until a
 * matching voice has been seen — by this subscription or already in the
 * module cache. After that, empty getVoices() keeps the control, including
 * on a brand-new subscription (Play changes lang and resubscribes). The
 * tap assigns the cached voice. A non-empty list with no match still hides.
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
  // drop the control even though speak can still use the cached voice.
  // A non-empty list with no match still hides. speechSynthesis missing hides.
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
