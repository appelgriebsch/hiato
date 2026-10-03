import { describe, expect, test } from 'bun:test'
import { PACK_LANGS, type PackLang } from '../packs/schema'
import { SPEAK_LEMMA_ARIA, speakLemmaAriaLabel } from '../packs/labels'
import {
  canSpeakLemma,
  pickVoiceForLang,
  speakLemma,
  utteranceTextForLemma,
  voiceMatchesPackLang,
  type SpeechSynthLike,
  type SpeechUtteranceLike,
  type SpeechVoiceLike,
} from './speech'

function mockSynth(voices: SpeechVoiceLike[]): {
  synth: SpeechSynthLike
  cancels: number
  spoken: SpeechUtteranceLike[]
} {
  const spoken: SpeechUtteranceLike[] = []
  let cancels = 0
  const synth: SpeechSynthLike = {
    getVoices: () => voices,
    cancel: () => {
      cancels += 1
    },
    speak: (u) => {
      spoken.push(u)
    },
  }
  return {
    get cancels() {
      return cancels
    },
    spoken,
    synth,
  }
}

describe('HTW-speak-helper (#115) — voice pick', () => {
  test('BCP-47 prefix match for en/de/es/pt (hyphen and underscore)', () => {
    expect(voiceMatchesPackLang('en-US', 'en')).toBe(true)
    expect(voiceMatchesPackLang('en_GB', 'en')).toBe(true)
    expect(voiceMatchesPackLang('en', 'en')).toBe(true)
    expect(voiceMatchesPackLang('de-DE', 'de')).toBe(true)
    expect(voiceMatchesPackLang('es-MX', 'es')).toBe(true)
    expect(voiceMatchesPackLang('pt-BR', 'pt')).toBe(true)
    expect(voiceMatchesPackLang('pt-PT', 'pt')).toBe(true)
    expect(voiceMatchesPackLang('fr-FR', 'en')).toBe(false)
    expect(voiceMatchesPackLang('en-US', 'de')).toBe(false)
    // Do not treat "eng" or unrelated prefixes as English
    expect(voiceMatchesPackLang('eng', 'en')).toBe(false)
  })

  test('pickVoiceForLang returns first matching voice or null', () => {
    const voices: SpeechVoiceLike[] = [
      { lang: 'fr-FR' },
      { lang: 'de-DE' },
      { lang: 'de-AT' },
    ]
    expect(pickVoiceForLang(voices, 'de')).toEqual({ lang: 'de-DE' })
    expect(pickVoiceForLang(voices, 'en')).toBeNull()
    expect(pickVoiceForLang([], 'pt')).toBeNull()
  })
})

describe('HTW-speak-helper (#115) — utterance text is lemma only', () => {
  test('utteranceTextForLemma returns the lemma string unchanged', () => {
    expect(utteranceTextForLemma('BANANA')).toBe('BANANA')
    expect(utteranceTextForLemma('ação')).toBe('ação')
    expect(utteranceTextForLemma('Haus')).toBe('Haus')
  })

  test('speakLemma utters lemma only — not gloss or a sentence', () => {
    const mock = mockSynth([{ lang: 'en-US' }])
    const lemma = 'BANANA'
    const gloss = 'a yellow fruit'
    speakLemma(lemma, 'en', {
      getSynth: () => mock.synth,
      createUtterance: (text) => ({ text, lang: '', voice: null }),
    })
    expect(mock.spoken).toHaveLength(1)
    expect(mock.spoken[0]!.text).toBe(lemma)
    expect(mock.spoken[0]!.text).not.toContain(gloss)
    expect(mock.spoken[0]!.text).not.toMatch(/The word was|Hear|Listen/i)
  })
})

describe('HTW-speak-helper (#115) — cancel before speak + soft-fail', () => {
  test('cancels any prior utterance before speaking again', () => {
    const mock = mockSynth([{ lang: 'pt-BR' }])
    const create = (text: string): SpeechUtteranceLike => ({
      text,
      lang: '',
      voice: null,
    })
    speakLemma('casa', 'pt', { getSynth: () => mock.synth, createUtterance: create })
    speakLemma('mesa', 'pt', { getSynth: () => mock.synth, createUtterance: create })
    expect(mock.cancels).toBe(2)
    expect(mock.spoken.map((u) => u.text)).toEqual(['casa', 'mesa'])
  })

  test('soft-fails when speechSynthesis missing', () => {
    expect(
      canSpeakLemma('en', { getSynth: () => null }),
    ).toBe(false)
    expect(
      speakLemma('BANANA', 'en', { getSynth: () => null }),
    ).toBe(false)
  })

  test('soft-fails when no usable voice for pack lang', () => {
    const mock = mockSynth([{ lang: 'fr-FR' }, { lang: 'ja-JP' }])
    expect(canSpeakLemma('de', { getSynth: () => mock.synth })).toBe(false)
    expect(speakLemma('Haus', 'de', { getSynth: () => mock.synth })).toBe(false)
    expect(mock.cancels).toBe(0)
    expect(mock.spoken).toHaveLength(0)
  })

  test('does not throw when getVoices throws', () => {
    const synth: SpeechSynthLike = {
      getVoices: () => {
        throw new Error('boom')
      },
      cancel: () => {},
      speak: () => {},
    }
    expect(canSpeakLemma('en', { getSynth: () => synth })).toBe(false)
    expect(speakLemma('x', 'en', { getSynth: () => synth })).toBe(false)
  })

  test('returns true and assigns matching voice when supported', () => {
    const voice = { lang: 'es-ES' }
    const mock = mockSynth([voice])
    const ok = speakLemma('casa', 'es', {
      getSynth: () => mock.synth,
      createUtterance: (text) => ({ text, lang: '', voice: null }),
    })
    expect(ok).toBe(true)
    expect(mock.spoken[0]!.voice).toBe(voice)
    expect(mock.spoken[0]!.lang).toBe('es-ES')
  })
})

describe('HTW-i18n-a11y (#117) — speak aria-label catalog', () => {
  test('SPEAK_LEMMA_ARIA covers EN PT DE ES and stays short', () => {
    for (const lang of PACK_LANGS) {
      const label = SPEAK_LEMMA_ARIA[lang]
      expect(typeof label).toBe('string')
      expect(label.length).toBeGreaterThan(0)
      expect(label.length).toBeLessThan(40)
    }
    expect(SPEAK_LEMMA_ARIA.en).toBe('Hear the word')
    expect(SPEAK_LEMMA_ARIA.pt.length).toBeGreaterThan(0)
    expect(SPEAK_LEMMA_ARIA.de.length).toBeGreaterThan(0)
    expect(SPEAK_LEMMA_ARIA.es.length).toBeGreaterThan(0)
  })

  test('speakLemmaAriaLabel falls back to EN like other UI strings', () => {
    expect(speakLemmaAriaLabel('en')).toBe(SPEAK_LEMMA_ARIA.en)
    expect(speakLemmaAriaLabel('de')).toBe(SPEAK_LEMMA_ARIA.de)
    // Defensive: unknown / mistyped key → EN (same idea as sparse catalogs)
    expect(speakLemmaAriaLabel('xx' as PackLang)).toBe(SPEAK_LEMMA_ARIA.en)
  })

  test('copy has no Settings voice picker or accent teaching', () => {
    for (const lang of PACK_LANGS) {
      const label = SPEAK_LEMMA_ARIA[lang]
      expect(label).not.toMatch(/settings|voice picker|accent|pronunciation score/i)
    }
  })
})
