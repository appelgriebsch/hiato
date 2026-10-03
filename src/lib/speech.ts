import type { PackLang } from '@/packs/schema'

/** Minimal voice shape for pure matching (no SpeechSynthesisVoice required). */
export type SpeechVoiceLike = {
  lang: string
}

/** Injectable synth surface so tests never need a real speech engine. */
export type SpeechSynthLike = {
  getVoices: () => SpeechVoiceLike[]
  cancel: () => void
  speak: (utterance: SpeechUtteranceLike) => void
}

/** Injectable utterance so speakLemma stays unit-testable. */
export type SpeechUtteranceLike = {
  text: string
  lang: string
  voice: SpeechVoiceLike | null
}

export type SpeakLemmaOptions = {
  /** Override `speechSynthesis` (tests / soft-fail). */
  getSynth?: () => SpeechSynthLike | null | undefined
  /** Override utterance factory (defaults to SpeechSynthesisUtterance when available). */
  createUtterance?: (text: string) => SpeechUtteranceLike
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

/** First local voice whose lang matches the pack language, or null. */
export function pickVoiceForLang<T extends SpeechVoiceLike>(
  voices: readonly T[],
  packLang: PackLang,
): T | null {
  for (const voice of voices) {
    if (voiceMatchesPackLang(voice.lang, packLang)) return voice
  }
  return null
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
 * the pack language. Soft — never throws.
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

/**
 * Speak the lemma with a local voice matching pack lang.
 * Cancels any prior utterance first. Soft-fails (returns false, no throw)
 * when speechSynthesis is missing or no usable voice.
 */
export function speakLemma(
  lemma: string,
  packLang: PackLang,
  opts: SpeakLemmaOptions = {},
): boolean {
  try {
    const synth = opts.getSynth ? opts.getSynth() : defaultSynth()
    if (!synth) return false
    const voice = pickVoiceForLang(synth.getVoices(), packLang)
    if (!voice) return false

    const text = utteranceTextForLemma(lemma)
    const create = opts.createUtterance ?? defaultCreateUtterance
    const utterance = create(text)
    utterance.text = text
    utterance.voice = voice
    utterance.lang = voice.lang

    // Cancel any prior utterance before speaking again.
    synth.cancel()
    synth.speak(utterance)
    return true
  } catch {
    return false
  }
}

/**
 * Subscribe to speech availability for a pack language.
 * Handles the async `voiceschanged` load path; soft-fails when unsupported.
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

    const native = globalThis.speechSynthesis
    // Only the real browser synth emits voiceschanged.
    if (
      !opts.getSynth &&
      native &&
      typeof native.addEventListener === 'function'
    ) {
      native.addEventListener('voiceschanged', notify)
      return () => {
        native.removeEventListener('voiceschanged', notify)
      }
    }
    return () => {}
  } catch {
    onChange(false)
    return () => {}
  }
}
