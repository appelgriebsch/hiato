import { beforeEach, describe, expect, test } from 'bun:test'
import { PACK_LANGS, type PackLang } from '../packs/schema'
import { SPEAK_LEMMA_ARIA, speakLemmaAriaLabel } from '../packs/labels'
import {
  canSpeakLemma,
  pickVoiceForLang,
  retainedSpeechUtterances,
  speakLemma,
  subscribeSpeakActivity,
  subscribeSpeechAvailability,
  utteranceTextForLemma,
  voiceMatchesPackLang,
  type SpeechSynthLike,
  type SpeechUtteranceLike,
  type SpeechVoiceLike,
} from './speech'

beforeEach(() => {
  // speakLemma keeps module state (active utterance). End it so later tests
  // see an idle synth and do not cancel on their first tap.
  for (const utterance of retainedSpeechUtterances()) {
    utterance.onend?.()
  }
})

function mockSynth(
  voices: SpeechVoiceLike[],
  init: { paused?: boolean } = {},
): {
  synth: SpeechSynthLike
  cancels: number
  resumes: number
  spoken: SpeechUtteranceLike[]
  order: string[]
} {
  const spoken: SpeechUtteranceLike[] = []
  const order: string[] = []
  let cancels = 0
  let resumes = 0
  const synth: SpeechSynthLike = {
    getVoices: () => voices,
    paused: init.paused,
    cancel: () => {
      cancels += 1
      order.push('cancel')
    },
    resume: () => {
      resumes += 1
      order.push('resume')
    },
    speak: (u) => {
      spoken.push(u)
      order.push('speak')
      // Happy path: the engine accepts the utterance in this turn.
      u.onstart?.()
    },
  }
  return {
    get cancels() {
      return cancels
    },
    get resumes() {
      return resumes
    },
    spoken,
    order,
    synth,
  }
}

function utter(text: string): SpeechUtteranceLike {
  return { text, lang: '', voice: null }
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

  test('prefers localService over an earlier remote voice; does not pin a name', () => {
    const remote = { lang: 'en-US', localService: false, name: 'Google US English' }
    const local = { lang: 'en-GB', localService: true, name: 'Daniel' }
    // Remote is first and has the "nicer" name — still lose to localService.
    expect(pickVoiceForLang([remote, local], 'en')).toBe(local)
    expect(pickVoiceForLang([local, remote], 'en')).toBe(local)
  })

  test('falls back to a remote match when no local voice exists', () => {
    const remote = { lang: 'de-DE', localService: false, name: 'Google Deutsch' }
    const otherLocal = { lang: 'fr-FR', localService: true, name: 'Thomas' }
    expect(pickVoiceForLang([otherLocal, remote], 'de')).toBe(remote)
  })

  test('hides only when no usable voice remains (remote still counts)', () => {
    const remoteOnly = mockSynth([{ lang: 'pt-BR', localService: false }])
    expect(canSpeakLemma('pt', { getSynth: () => remoteOnly.synth })).toBe(true)
    const none = mockSynth([{ lang: 'ja-JP', localService: true }])
    expect(canSpeakLemma('pt', { getSynth: () => none.synth })).toBe(false)
    expect(canSpeakLemma('pt', { getSynth: () => mockSynth([]).synth })).toBe(false)
  })
})

describe('HTW-speak-helper (#115) — utterance text is lemma only', () => {
  test('utteranceTextForLemma returns the lemma string unchanged', () => {
    expect(utteranceTextForLemma('BANANA')).toBe('BANANA')
    expect(utteranceTextForLemma('ação')).toBe('ação')
    expect(utteranceTextForLemma('Haus')).toBe('Haus')
  })

  test('speakLemma utters lemma only — not gloss or a sentence', async () => {
    const mock = mockSynth([{ lang: 'en-US', localService: true }])
    const lemma = 'BANANA'
    // Gloss is not an argument of speakLemma. A not.toContain(gloss) check
    // on text that was only ever given `lemma` cannot fail. Record every
    // string passed into the utterance and require it to be exactly the lemma
    // — a gloss, a translation, or "The word was …" fails this.
    const created: string[] = []
    await speakLemma(lemma, 'en', {
      getSynth: () => mock.synth,
      createUtterance: (text) => {
        created.push(text)
        return utter(text)
      },
    })
    expect(created).toEqual([lemma])
    expect(mock.spoken.map((u) => u.text)).toEqual([lemma])
    expect(mock.spoken[0]!.text).not.toMatch(/The word was|Hear|Listen/i)
  })
})

describe('HTW-speak-helper (#115) — in-gesture speak, cancel when busy, soft-fail', () => {
  test('first tap does not cancel an idle synth', async () => {
    const mock = mockSynth([{ lang: 'pt-BR', localService: true }])
    await speakLemma('casa', 'pt', {
      getSynth: () => mock.synth,
      createUtterance: utter,
    })
    expect(mock.cancels).toBe(0)
    expect(mock.spoken.map((u) => u.text)).toEqual(['casa'])
    expect(mock.order).toEqual(['speak'])
    expect(mock.resumes).toBe(0)
  })

  test('repeat tap cancels the in-flight utterance then speaks the new lemma', async () => {
    const mock = mockSynth([{ lang: 'pt-BR', localService: true }])
    await speakLemma('casa', 'pt', {
      getSynth: () => mock.synth,
      createUtterance: utter,
    })
    const afterFirst = mock.order.length
    await speakLemma('mesa', 'pt', {
      getSynth: () => mock.synth,
      createUtterance: utter,
    })
    expect(mock.cancels).toBe(1)
    expect(mock.order.slice(afterFirst)).toEqual(['cancel', 'speak'])
    expect(mock.order[0]).toBe('speak')
    expect(mock.resumes).toBe(0)
    expect(mock.spoken.map((u) => u.text)).toEqual(['casa', 'mesa'])
  })

  test('speaks synchronously in the click turn — no timer before speak', async () => {
    const mock = mockSynth([{ lang: 'en-US', localService: true }])
    const realSetTimeout = globalThis.setTimeout
    let armed = 0
    globalThis.setTimeout = ((...args: Parameters<typeof setTimeout>) => {
      armed += 1
      return realSetTimeout(...args)
    }) as typeof setTimeout
    try {
      const trace: string[] = []
      const speak = mock.synth.speak.bind(mock.synth)
      mock.synth.speak = (u) => {
        trace.push('speak')
        speak(u)
      }
      const pending = speakLemma('hello', 'en', {
        getSynth: () => mock.synth,
        createUtterance: utter,
      })
      // speak() must already have run before the caller awaits the promise.
      trace.push('returned')
      expect(trace).toEqual(['speak', 'returned'])
      expect(armed).toBe(0)
      expect(mock.cancels).toBe(0)
      // Idle synth: speak is the first (and only) synth event. resume()
      // before speak, or resume when not paused, is what staging swallowed.
      expect(mock.order[0]).toBe('speak')
      expect(mock.order).not.toContain('resume')
      expect(mock.resumes).toBe(0)
      expect(await pending).toBe(true)
      expect(armed).toBe(0)
      expect(mock.spoken.map((u) => u.text)).toEqual(['hello'])
    } finally {
      globalThis.setTimeout = realSetTimeout
    }
  })

  test('a repeat tap speaks the new lemma in the same turn, not a deferred replay', async () => {
    const mock = mockSynth([{ lang: 'es-ES', localService: true }])
    const trace: string[] = []
    const speak = mock.synth.speak.bind(mock.synth)
    mock.synth.speak = (u) => {
      trace.push(u.text)
      speak(u)
    }
    const first = speakLemma('casa', 'es', {
      getSynth: () => mock.synth,
      createUtterance: utter,
    })
    expect(trace).toEqual(['casa'])
    const second = speakLemma('mesa', 'es', {
      getSynth: () => mock.synth,
      createUtterance: utter,
    })
    expect(trace).toEqual(['casa', 'mesa'])
    expect(await first).toBe(true)
    expect(await second).toBe(true)
    expect(mock.cancels).toBe(1)
    expect(mock.spoken.map((u) => u.text)).toEqual(['casa', 'mesa'])
  })

  test('holds the utterance until onend so it cannot be collected early', async () => {
    const mock = mockSynth([{ lang: 'de-DE', localService: true }])
    const utterance = utter('Haus')
    const ok = await speakLemma('Haus', 'de', {
      getSynth: () => mock.synth,
      createUtterance: () => utterance,
    })
    expect(ok).toBe(true)
    expect(retainedSpeechUtterances()).toContain(utterance)
    expect(typeof utterance.onend).toBe('function')
    expect(typeof utterance.onerror).toBe('function')
    utterance.onend!()
    expect(retainedSpeechUtterances()).not.toContain(utterance)
  })

  test('same-turn false speaking and pending flags do not drop the utterance', async () => {
    const utterance = utter('hi')
    const synth: SpeechSynthLike = {
      getVoices: () => [{ lang: 'en-US', localService: true }],
      cancel: () => {},
      resume: () => {},
      pending: false,
      speaking: false,
      speak: () => {
        /* Flags stay false in this turn. That is not a failed queue. */
      },
    }
    let settled: boolean | undefined
    const pending = speakLemma('hi', 'en', {
      getSynth: () => synth,
      createUtterance: () => utterance,
    }).then((ok) => {
      settled = ok
    })
    await Promise.resolve()
    expect(settled).toBeUndefined()
    expect(retainedSpeechUtterances()).toContain(utterance)
    utterance.onstart?.()
    await pending
    expect(settled).toBe(true)
    utterance.onend?.()
    expect(retainedSpeechUtterances()).not.toContain(utterance)
  })

  test('synchronous onerror resolves false and clears the utterance', async () => {
    const utterance = utter('hi')
    const seen: boolean[] = []
    const unsub = subscribeSpeakActivity((speaking) => {
      seen.push(speaking)
    })
    const synth: SpeechSynthLike = {
      getVoices: () => [{ lang: 'en-US', localService: true }],
      cancel: () => {},
      resume: () => {},
      speak: (u) => {
        u.onerror?.()
      },
    }
    const ok = await speakLemma('hi', 'en', {
      getSynth: () => synth,
      createUtterance: () => utterance,
    })
    expect(ok).toBe(false)
    expect(retainedSpeechUtterances()).not.toContain(utterance)
    expect(seen).toEqual([true, false])
    unsub()
  })

  test('speak() throwing resolves false and releases the utterance', async () => {
    const utterance = utter('hi')
    const synth: SpeechSynthLike = {
      getVoices: () => [{ lang: 'en-US', localService: true }],
      cancel: () => {},
      resume: () => {},
      speak: () => {
        throw new Error('blocked')
      },
    }
    const ok = await speakLemma('hi', 'en', {
      getSynth: () => synth,
      createUtterance: () => utterance,
    })
    expect(ok).toBe(false)
    expect(retainedSpeechUtterances()).not.toContain(utterance)
  })

  test('stuck speaking or pending does not cancel when we hold no utterance', async () => {
    const mock = mockSynth([{ lang: 'pt-BR', localService: true }])
    mock.synth.speaking = true
    mock.synth.pending = true
    const ok = await speakLemma('casa', 'pt', {
      getSynth: () => mock.synth,
      createUtterance: utter,
    })
    expect(ok).toBe(true)
    expect(mock.cancels).toBe(0)
    expect(mock.order).toEqual(['speak'])
    expect(mock.resumes).toBe(0)
  })

  test('resume runs only after speak, and only when the synth starts paused', async () => {
    const idle = mockSynth([{ lang: 'de-DE', localService: true }])
    await speakLemma('Haus', 'de', {
      getSynth: () => idle.synth,
      createUtterance: utter,
    })
    expect(idle.order).toEqual(['speak'])
    expect(idle.resumes).toBe(0)
    idle.spoken[0]!.onend?.()

    const paused = mockSynth([{ lang: 'de-DE', localService: true }], {
      paused: true,
    })
    await speakLemma('Haus', 'de', {
      getSynth: () => paused.synth,
      createUtterance: utter,
    })
    expect(paused.order[0]).toBe('speak')
    expect(paused.order).toEqual(['speak', 'resume'])
    expect(paused.resumes).toBe(1)

    // Repeat tap of our own utterance still cancels, then speak, then resume.
    await speakLemma('Auto', 'de', {
      getSynth: () => paused.synth,
      createUtterance: utter,
    })
    expect(paused.order.slice(2)).toEqual(['cancel', 'speak', 'resume'])
    expect(paused.cancels).toBe(1)
  })

  test('copies voice.lang as BCP-47 and sets volume only when the utterance has it', async () => {
    const voice = { lang: 'de_DE', localService: true }
    const plain = mockSynth([voice])
    await speakLemma('Haus', 'de', {
      getSynth: () => plain.synth,
      createUtterance: utter,
    })
    expect(plain.spoken[0]!.lang).toBe('de-DE')
    expect('volume' in plain.spoken[0]!).toBe(false)

    const withVolume = utter('Haus')
    withVolume.volume = 0
    const volMock = mockSynth([voice])
    await speakLemma('Haus', 'de', {
      getSynth: () => volMock.synth,
      createUtterance: () => withVolume,
    })
    expect(withVolume.lang).toBe('de-DE')
    expect(withVolume.volume).toBe(1)
  })

  test('soft-fails when speechSynthesis missing', async () => {
    expect(canSpeakLemma('en', { getSynth: () => null })).toBe(false)
    expect(
      await speakLemma('BANANA', 'en', { getSynth: () => null }),
    ).toBe(false)
  })

  test('soft-fails when no usable voice for pack lang', async () => {
    const mock = mockSynth([{ lang: 'fr-FR' }, { lang: 'ja-JP' }])
    expect(canSpeakLemma('de', { getSynth: () => mock.synth })).toBe(false)
    expect(
      await speakLemma('Haus', 'de', {
        getSynth: () => mock.synth,
      }),
    ).toBe(false)
    expect(mock.cancels).toBe(0)
    expect(mock.spoken).toHaveLength(0)
  })

  test('does not throw when getVoices throws', async () => {
    const synth: SpeechSynthLike = {
      getVoices: () => {
        throw new Error('boom')
      },
      cancel: () => {},
      speak: () => {},
    }
    expect(canSpeakLemma('en', { getSynth: () => synth })).toBe(false)
    expect(await speakLemma('x', 'en', { getSynth: () => synth })).toBe(false)
  })

  test('returns true and assigns the local voice when supported', async () => {
    const voice = { lang: 'es-ES', localService: true }
    const mock = mockSynth([
      { lang: 'es-ES', localService: false },
      voice,
    ])
    const ok = await speakLemma('casa', 'es', {
      getSynth: () => mock.synth,
      createUtterance: utter,
    })
    expect(ok).toBe(true)
    expect(mock.spoken[0]!.voice).toBe(voice)
    expect(mock.spoken[0]!.lang).toBe('es-ES')
  })

  test('speaking activity is true while queued and false on end or drop', async () => {
    const seen: boolean[] = []
    const unsub = subscribeSpeakActivity((speaking) => {
      seen.push(speaking)
    })
    const mock = mockSynth([{ lang: 'en-US', localService: true }])
    const utterance = utter('word')
    const ok = await speakLemma('word', 'en', {
      getSynth: () => mock.synth,
      createUtterance: () => utterance,
    })
    expect(ok).toBe(true)
    expect(seen).toEqual([true])
    utterance.onend!()
    expect(seen).toEqual([true, false])

    const droppedUtterance = utter('dropped')
    const dropped: SpeechSynthLike = {
      getVoices: () => [{ lang: 'en-US', localService: true }],
      cancel: () => {},
      pending: false,
      speaking: false,
      speak: (u) => {
        u.onerror?.()
      },
    }
    const droppedOk = await speakLemma('word', 'en', {
      getSynth: () => dropped,
      createUtterance: () => droppedUtterance,
    })
    expect(droppedOk).toBe(false)
    expect(retainedSpeechUtterances()).not.toContain(droppedUtterance)
    expect(seen).toEqual([true, false, true, false])
    unsub()
  })
})

describe('HTW-speak-helper — voiceschanged', () => {
  test('empty getVoices stays hidden, then a loaded voice shows the control', () => {
    let voices: SpeechVoiceLike[] = []
    const listeners = new Set<() => void>()
    const synth: SpeechSynthLike = {
      getVoices: () => voices,
      cancel: () => {},
      speak: () => {},
      addEventListener: (_type, listener) => {
        listeners.add(listener)
      },
      removeEventListener: (_type, listener) => {
        listeners.delete(listener)
      },
    }
    const seen: boolean[] = []
    const unsub = subscribeSpeechAvailability('en', (ok) => seen.push(ok), {
      getSynth: () => synth,
    })
    expect(seen).toEqual([false])
    expect(listeners.size).toBe(1)

    // Still empty after the browser fires voiceschanged — stay hidden.
    for (const listener of listeners) listener()
    expect(seen).toEqual([false, false])

    voices = [{ lang: 'en-US', localService: true }]
    for (const listener of listeners) listener()
    expect(seen.at(-1)).toBe(true)

    unsub()
    expect(listeners.size).toBe(0)
    voices = []
    expect(seen.at(-1)).toBe(true)
  })
})

describe('HTW-i18n-a11y (#117) — speak aria-label catalog', () => {
  test('SPEAK_LEMMA_ARIA pins EN PT DE ES exactly and stays short', () => {
    expect(SPEAK_LEMMA_ARIA).toEqual({
      en: 'Hear the word',
      pt: 'Ouvir a palavra',
      de: 'Wort anhören',
      es: 'Escuchar la palabra',
    })
    for (const lang of PACK_LANGS) {
      const label = SPEAK_LEMMA_ARIA[lang]
      expect(label.length).toBeGreaterThan(0)
      expect(label.length).toBeLessThan(40)
    }
  })

  test('speakLemmaAriaLabel falls back to EN like other UI strings', () => {
    expect(speakLemmaAriaLabel('en')).toBe('Hear the word')
    expect(speakLemmaAriaLabel('pt')).toBe('Ouvir a palavra')
    expect(speakLemmaAriaLabel('de')).toBe('Wort anhören')
    expect(speakLemmaAriaLabel('es')).toBe('Escuchar la palabra')
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
