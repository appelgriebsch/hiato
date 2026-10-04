import { beforeEach, describe, expect, test } from 'bun:test'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { PACK_LANGS, type PackLang } from '../packs/schema'
import { SPEAK_LEMMA_ARIA, speakLemmaAriaLabel } from '../packs/labels'
import {
  canSpeakLemma,
  clearCachedSpeechVoices,
  pickVoiceForLang,
  primeSpeechVoices,
  retainedSpeechUtterances,
  SPEECH_START_EXTEND_MS,
  SPEECH_START_WATCHDOG_MS,
  SPEECH_WATCHDOG_CANCEL_MARKER,
  speakLemma,
  subscribeSpeakActivity,
  subscribeSpeechAvailability,
  unlockSpeechGesture,
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
  clearCachedSpeechVoices()
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
  // WebKit: speak appends. A later speak does not start until cancel
  // or the head's onend/onerror. The first head starts immediately.
  const queue: SpeechUtteranceLike[] = []
  const started = new WeakSet<SpeechUtteranceLike>()
  let cancels = 0
  let resumes = 0
  const startHead = () => {
    const head = queue[0]
    if (!head || started.has(head)) return
    started.add(head)
    head.onstart?.()
  }
  const synth: SpeechSynthLike = {
    getVoices: () => voices,
    paused: init.paused,
    cancel: () => {
      cancels += 1
      order.push('cancel')
      // Do not set paused. Chrome often leaves the flag false until after
      // cancel() returns; flipping it here would hide the repeat-tap bug.
      const dropped = queue.splice(0)
      for (const utterance of dropped) utterance.onerror?.()
    },
    resume: () => {
      resumes += 1
      order.push('resume')
    },
    speak: (u) => {
      spoken.push(u)
      order.push('speak')
      queue.push(u)
      const prevEnd = u.onend
      const prevErr = u.onerror
      u.onend = () => {
        const index = queue.indexOf(u)
        if (index >= 0) queue.splice(index, 1)
        prevEnd?.()
        startHead()
      }
      u.onerror = () => {
        const index = queue.indexOf(u)
        if (index >= 0) queue.splice(index, 1)
        prevErr?.()
        startHead()
      }
      if (queue.length === 1) startHead()
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

describe('HTW-speak-helper (#115) — in-gesture speak, ignore while playing, soft-fail', () => {
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

  test('repeat tap while the word is playing does not cancel or speak', async () => {
    const mock = mockSynth([{ lang: 'pt-BR', localService: true }])
    await speakLemma('casa', 'pt', {
      getSynth: () => mock.synth,
      createUtterance: utter,
    })
    const afterFirst = mock.order.length
    const again = await speakLemma('mesa', 'pt', {
      getSynth: () => mock.synth,
      createUtterance: utter,
    })
    // Mock fires onstart inside speak, so the second call is already in
    // the playing window. One speak. No cancel, no resume.
    expect(again).toBe(true)
    expect(mock.cancels).toBe(0)
    expect(mock.resumes).toBe(0)
    expect(mock.order[0]).toBe('speak')
    expect(mock.order.slice(0, afterFirst)).toEqual(['speak'])
    expect(mock.synth.paused).not.toBe(true)
    expect(mock.order.slice(afterFirst)).toEqual([])
    expect(mock.spoken.map((u) => u.text)).toEqual(['casa'])

    mock.spoken[0]!.onend?.()
    await speakLemma('mesa', 'pt', {
      getSynth: () => mock.synth,
      createUtterance: utter,
    })
    expect(mock.cancels).toBe(0)
    expect(mock.resumes).toBe(0)
    expect(mock.order).toEqual(['speak', 'speak'])
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
      // Idle synth: speak is the first (and only) synth event.
      // resume() runs only when paused is already true.
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

  test('a repeat tap during playback does not speak again in that turn', async () => {
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
    expect(trace).toEqual(['casa'])
    expect(await first).toBe(true)
    expect(await second).toBe(true)
    expect(mock.cancels).toBe(0)
    expect(mock.resumes).toBe(0)
    expect(mock.spoken.map((u) => u.text)).toEqual(['casa'])
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
    // onerror before start does not flash the speaking flag on.
    expect(seen).toEqual([false])
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

    // Playing: a second tap does not cancel, speak, or resume.
    await speakLemma('Auto', 'de', {
      getSynth: () => paused.synth,
      createUtterance: utter,
    })
    expect(paused.order).toEqual(['speak', 'resume'])
    expect(paused.cancels).toBe(0)

    paused.spoken[0]!.onend?.()
    await speakLemma('Auto', 'de', {
      getSynth: () => paused.synth,
      createUtterance: utter,
    })
    expect(paused.order.slice(2)).toEqual(['speak', 'resume'])
    expect(paused.cancels).toBe(0)
    expect(paused.resumes).toBe(2)
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
    plain.spoken[0]!.onend?.()

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

  test('speaking activity is true on start and false on end or drop', async () => {
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
    // Sync onerror never started, so it does not emit true before false.
    expect(seen).toEqual([true, false, false])
    unsub()
  })

  test('unstarted speak is cancelled by the watchdog and the next tap speaks once', async () => {
    const first = utter('casa')
    const second = utter('mesa')
    const created = [first, second]
    let createdIndex = 0
    const order: string[] = []
    let cancels = 0
    let speakCount = 0
    let armedAtSpeak = -1
    const synth: SpeechSynthLike = {
      getVoices: () => [{ lang: 'pt-BR', localService: true }],
      paused: false,
      cancel: () => {
        cancels += 1
        order.push('cancel')
        // No onerror. The slot must still clear.
      },
      resume: () => {
        order.push('resume')
      },
      speak: (u) => {
        speakCount += 1
        if (speakCount === 1) armedAtSpeak = armed
        order.push('speak')
        // First speak never starts. The speak after cancel does.
        if (speakCount > 1) u.onstart?.()
      },
    }
    const seen: boolean[] = []
    const unsub = subscribeSpeakActivity((speaking) => {
      seen.push(speaking)
    })
    const realSetTimeout = globalThis.setTimeout
    let armed = 0
    let speakReturned = false
    globalThis.setTimeout = ((...args: Parameters<typeof setTimeout>) => {
      if (!speakReturned) armed += 1
      return realSetTimeout(...args)
    }) as typeof setTimeout
    let settled: boolean | undefined
    try {
      const pending = speakLemma('casa', 'pt', {
        getSynth: () => synth,
        createUtterance: () => {
          const utterance = created[createdIndex] ?? utter('extra')
          createdIndex += 1
          return utterance
        },
      }).then((ok) => {
        settled = ok
        return ok
      })
      speakReturned = true
      // No timer before speak() returns. One watchdog after it returns.
      expect(armedAtSpeak).toBe(0)
      expect(armed).toBe(1)
      expect(order).toEqual(['speak'])
      await Promise.resolve()
      expect(settled).toBeUndefined()
      expect(retainedSpeechUtterances()).toContain(first)
      expect(seen).toEqual([])

      const during = await speakLemma('mesa', 'pt', {
        getSynth: () => synth,
        createUtterance: () => {
          const utterance = created[createdIndex] ?? utter('extra')
          createdIndex += 1
          return utterance
        },
      })
      // Before 1000ms the unstarted attempt is busy. No second speak.
      expect(during).toBe(true)
      expect(speakCount).toBe(1)
      expect(cancels).toBe(0)
      expect(order).toEqual(['speak'])
      globalThis.setTimeout = realSetTimeout

      await new Promise((resolve) => {
        setTimeout(resolve, SPEECH_START_WATCHDOG_MS + 50)
      })
      expect(settled).toBe(false)
      expect(await pending).toBe(false)
      expect(retainedSpeechUtterances()).toContain(first)
      expect(seen).toEqual([])
      expect(order).toEqual(['speak', 'cancel'])
      expect(cancels).toBe(1)
      expect(order).not.toContain('resume')

      const again = await speakLemma('mesa', 'pt', {
        getSynth: () => synth,
        createUtterance: () => {
          const utterance = created[createdIndex] ?? utter('extra')
          createdIndex += 1
          return utterance
        },
      })
      expect(again).toBe(true)
      expect(cancels).toBe(1)
      expect(order).toEqual(['speak', 'cancel', 'speak'])
      expect(order).not.toContain('resume')
      // cancel() did not fire onerror, so the silent utterance stays
      // retained until its own onend.
      expect(retainedSpeechUtterances()).toContain(first)
      first.onend?.()
      expect(retainedSpeechUtterances()).not.toContain(first)
      second.onend?.()
    } finally {
      globalThis.setTimeout = realSetTimeout
      unsub()
    }
  })

  test('watchdog cancel that fires onerror still lets the next tap speak once', async () => {
    const first = utter('casa')
    const second = utter('mesa')
    const created = [first, second]
    let createdIndex = 0
    const order: string[] = []
    const synth: SpeechSynthLike = {
      getVoices: () => [{ lang: 'pt-BR', localService: true }],
      paused: false,
      cancel: () => {
        order.push('cancel')
        first.onerror?.()
      },
      resume: () => {
        order.push('resume')
      },
      speak: (u) => {
        order.push('speak')
        if (u === second) u.onstart?.()
      },
    }
    const pending = speakLemma('casa', 'pt', {
      getSynth: () => synth,
      createUtterance: () => {
        const utterance = created[createdIndex] ?? utter('extra')
        createdIndex += 1
        return utterance
      },
    })
    await new Promise((resolve) => {
      setTimeout(resolve, SPEECH_START_WATCHDOG_MS + 50)
    })
    expect(await pending).toBe(false)
    expect(retainedSpeechUtterances()).not.toContain(first)
    expect(order).toEqual(['speak', 'cancel'])

    const again = await speakLemma('mesa', 'pt', {
      getSynth: () => synth,
      createUtterance: () => {
        const utterance = created[createdIndex] ?? utter('extra')
        createdIndex += 1
        return utterance
      },
    })
    expect(again).toBe(true)
    expect(order).toEqual(['speak', 'cancel', 'speak'])
    expect(order).not.toContain('resume')
    second.onend?.()
  })

  async function expectLateAcceptThenCancel(flag: 'speaking' | 'pending') {
    const order: string[] = []
    const synth: SpeechSynthLike = {
      getVoices: () => [{ lang: 'pt-BR', localService: true }],
      paused: false,
      speaking: false,
      pending: false,
      cancel: (marker) => {
        order.push('cancel')
        expect(marker).toBe(SPEECH_WATCHDOG_CANCEL_MARKER)
        synth.speaking = false
        synth.pending = false
      },
      resume: () => {
        order.push('resume')
      },
      speak: () => {
        order.push('speak')
        synth[flag] = true
      },
    }
    let settled: boolean | undefined
    const pending = speakLemma('casa', 'pt', {
      getSynth: () => synth,
      createUtterance: utter,
    }).then((ok) => {
      settled = ok
      return ok
    })
    await new Promise((resolve) => {
      setTimeout(resolve, SPEECH_START_WATCHDOG_MS + 50)
    })
    expect(order).toEqual(['speak'])
    expect(settled).toBeUndefined()
    await new Promise((resolve) => {
      setTimeout(resolve, SPEECH_START_EXTEND_MS + 50)
    })
    expect(order).toEqual(['speak', 'cancel'])
    expect(order).not.toContain('resume')
    expect(await pending).toBe(false)
  }

  test('speaking without onstart waits past 1000ms then cancels once', async () => {
    await expectLateAcceptThenCancel('speaking')
  })

  test('pending without onstart waits past 1000ms then cancels once', async () => {
    await expectLateAcceptThenCancel('pending')
  })

  test('late onstart after the watchdog does not take the slot back', async () => {
    const utterance = utter('casa')
    const order: string[] = []
    const synth: SpeechSynthLike = {
      getVoices: () => [{ lang: 'pt-BR', localService: true }],
      paused: false,
      cancel: () => {
        order.push('cancel')
      },
      resume: () => {
        order.push('resume')
      },
      speak: () => {
        order.push('speak')
      },
    }
    const seen: boolean[] = []
    const unsub = subscribeSpeakActivity((speaking) => {
      seen.push(speaking)
    })
    try {
      const pending = speakLemma('casa', 'pt', {
        getSynth: () => synth,
        createUtterance: () => utterance,
      })
      await new Promise((resolve) => {
        setTimeout(resolve, SPEECH_START_WATCHDOG_MS + 50)
      })
      expect(await pending).toBe(false)
      expect(seen).toEqual([])
      expect(retainedSpeechUtterances()).toContain(utterance)
      expect(typeof utterance.onstart).toBe('function')
      expect(typeof utterance.onend).toBe('function')
      expect(order).toEqual(['speak', 'cancel'])
      expect(order).not.toContain('resume')

      utterance.onstart?.()
      expect(seen).toEqual([])
      expect(retainedSpeechUtterances()).toContain(utterance)
      utterance.onend?.()
      expect(seen).toEqual([false])
      expect(retainedSpeechUtterances()).not.toContain(utterance)
      // Already settled false. A late start must not flip it.
      expect(await pending).toBe(false)
    } finally {
      unsub()
    }
  })
})

describe('HTW-speak-helper — iOS empty voice list at tap', () => {
  test('empty getVoices with no cache does not speak', async () => {
    const mock = mockSynth([])
    expect(await speakLemma('casa', 'pt', {
      getSynth: () => mock.synth,
      createUtterance: utter,
    })).toBe(false)
    expect(mock.spoken).toHaveLength(0)
    expect(mock.order).not.toContain('speak')
    expect(mock.order).not.toContain('resume')
    expect(mock.cancels).toBe(0)
  })

  test('empty getVoices at speak time still calls speak with the cached voice and hyphenated lang', async () => {
    const stale = { lang: 'pt_BR', localService: true }
    let voices: SpeechVoiceLike[] = [stale]
    let calls = 0
    const spoken: SpeechUtteranceLike[] = []
    const order: string[] = []
    const synth: SpeechSynthLike = {
      getVoices: () => {
        calls += 1
        return voices
      },
      paused: false,
      cancel: () => {
        order.push('cancel')
      },
      resume: () => {
        order.push('resume')
      },
      speak: (u) => {
        spoken.push(u)
        order.push('speak')
        u.onstart?.()
      },
    }
    expect(canSpeakLemma('pt', { getSynth: () => synth })).toBe(true)
    voices = []
    const callsBefore = calls
    const realQueue = globalThis.queueMicrotask
    const realSetTimeout = globalThis.setTimeout
    let queued = 0
    let armed = 0
    globalThis.queueMicrotask = ((cb: () => void) => {
      queued += 1
      return realQueue(cb)
    }) as typeof queueMicrotask
    globalThis.setTimeout = ((...args: Parameters<typeof setTimeout>) => {
      armed += 1
      return realSetTimeout(...args)
    }) as typeof setTimeout
    try {
      const pending = speakLemma('casa', 'pt', {
        getSynth: () => synth,
        createUtterance: utter,
      })
      // speak() already ran, before the caller waits. No resume first.
      expect(spoken).toHaveLength(1)
      expect(order).toEqual(['speak'])
      expect(order).not.toContain('resume')
      expect(queued).toBe(0)
      expect(armed).toBe(0)
      expect(calls - callsBefore).toBe(2)
      expect(spoken[0]!.text).toBe('casa')
      expect(spoken[0]!.lang).toBe('pt-BR')
      expect(spoken[0]!.voice).toBe(stale)
      expect(spoken[0]!.voice).not.toBeNull()
      expect(await pending).toBe(true)
      expect(queued).toBe(0)
      expect(armed).toBe(0)
    } finally {
      globalThis.queueMicrotask = realQueue
      globalThis.setTimeout = realSetTimeout
    }
  })

  test('bare cached tag uses the pack default hyphenated lang and the cached voice', async () => {
    const voice = { lang: 'en', localService: true }
    let voices: SpeechVoiceLike[] = [voice]
    const spoken: SpeechUtteranceLike[] = []
    const synth: SpeechSynthLike = {
      getVoices: () => voices,
      cancel: () => {},
      resume: () => {},
      speak: (u) => {
        spoken.push(u)
        u.onstart?.()
      },
    }
    expect(canSpeakLemma('en', { getSynth: () => synth })).toBe(true)
    voices = []
    const ok = await speakLemma('BANANA', 'en', {
      getSynth: () => synth,
      createUtterance: utter,
    })
    expect(ok).toBe(true)
    expect(spoken[0]!.lang).toBe('en-US')
    expect(spoken[0]!.voice).toBe(voice)
  })

  test('in-place empty list still speaks the cached local de voice', async () => {
    const remote = { lang: 'de-DE', localService: false }
    const local = { lang: 'de_DE', localService: true }
    const voices: SpeechVoiceLike[] = [remote, local]
    const spoken: SpeechUtteranceLike[] = []
    const order: string[] = []
    const synth: SpeechSynthLike = {
      getVoices: () => voices,
      paused: false,
      cancel: () => {
        order.push('cancel')
      },
      resume: () => {
        order.push('resume')
      },
      speak: (u) => {
        spoken.push(u)
        order.push('speak')
        u.onstart?.()
      },
    }
    expect(canSpeakLemma('de', { getSynth: () => synth })).toBe(true)
    // Same array the cache snapshotted. Clearing it in place must not
    // drop the remembered voices.
    voices.length = 0
    const pending = speakLemma('Haus', 'de', {
      getSynth: () => synth,
      createUtterance: utter,
    })
    expect(spoken).toHaveLength(1)
    expect(order).toEqual(['speak'])
    expect(order).not.toContain('resume')
    expect(spoken[0]!.text).toBe('Haus')
    expect(spoken[0]!.voice).toBe(local)
    expect(spoken[0]!.voice).not.toBeNull()
    expect(spoken[0]!.lang).toBe('de-DE')
    expect(await pending).toBe(true)
    expect(order).toEqual(['speak'])
  })

  test('a second getVoices() that is non-empty assigns the fresh local voice', async () => {
    const remote = { lang: 'de-DE', localService: false }
    const local = { lang: 'de-AT', localService: true }
    let calls = 0
    const spoken: SpeechUtteranceLike[] = []
    const order: string[] = []
    const synth: SpeechSynthLike = {
      getVoices: () => {
        calls += 1
        return calls === 1 ? [] : [remote, local]
      },
      paused: false,
      cancel: () => {
        order.push('cancel')
      },
      resume: () => {
        order.push('resume')
      },
      speak: (u) => {
        spoken.push(u)
        order.push('speak')
        u.onstart?.()
      },
    }
    const pending = speakLemma('Haus', 'de', {
      getSynth: () => synth,
      createUtterance: utter,
    })
    expect(order).toEqual(['speak'])
    expect(calls).toBe(2)
    expect(spoken[0]!.voice).toBe(local)
    expect(spoken[0]!.lang).toBe('de-AT')
    expect(await pending).toBe(true)
    expect(order).not.toContain('resume')
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

  test('once a match was seen, a later empty getVoices does not hide', () => {
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
    const unsub = subscribeSpeechAvailability('de', (ok) => seen.push(ok), {
      getSynth: () => synth,
    })
    expect(seen).toEqual([false])
    voices = [{ lang: 'de-DE', localService: true }]
    for (const listener of listeners) listener()
    expect(seen.at(-1)).toBe(true)
    voices = []
    for (const listener of listeners) listener()
    expect(seen.at(-1)).toBe(true)
    // A real list with no pack match still hides.
    voices = [{ lang: 'ja-JP', localService: true }]
    for (const listener of listeners) listener()
    expect(seen.at(-1)).toBe(false)
    unsub()
  })

  test('a new subscription is available when the cache matches and getVoices is empty', () => {
    const voice = { lang: 'de-DE', localService: true }
    expect(
      canSpeakLemma('de', { getSynth: () => mockSynth([voice]).synth }),
    ).toBe(true)

    const seen: boolean[] = []
    const unsub = subscribeSpeechAvailability('de', (ok) => seen.push(ok), {
      getSynth: () => mockSynth([]).synth,
    })
    expect(seen[0]).toBe(true)
    unsub()

    // Play changes lang and subscribes again. Empty live list, cache still speaks de.
    const again: boolean[] = []
    const unsubAgain = subscribeSpeechAvailability(
      'de',
      (ok) => again.push(ok),
      { getSynth: () => mockSynth([]).synth },
    )
    expect(again[0]).toBe(true)
    unsubAgain()

    const other: boolean[] = []
    const unsubOther = subscribeSpeechAvailability(
      'en',
      (ok) => other.push(ok),
      { getSynth: () => mockSynth([]).synth },
    )
    expect(other).toEqual([false])
    unsubOther()
  })
})


describe('HTW-speak-helper — iOS prime and gesture unlock', () => {
  test('primeSpeechVoices calls getVoices and caches a non-empty list', async () => {
    const voice = { lang: 'de-DE', localService: true }
    let voices: SpeechVoiceLike[] = [voice]
    let calls = 0
    const synth: SpeechSynthLike = {
      getVoices: () => {
        calls += 1
        return voices
      },
      cancel: () => {},
      speak: () => {},
    }
    primeSpeechVoices({ getSynth: () => synth })
    expect(calls).toBe(1)

    voices = []
    const spoken: SpeechUtteranceLike[] = []
    const order: string[] = []
    const atTap: SpeechSynthLike = {
      getVoices: () => [],
      paused: false,
      cancel: () => {
        order.push('cancel')
      },
      resume: () => {
        order.push('resume')
      },
      speak: (u) => {
        spoken.push(u)
        order.push('speak')
        u.onstart?.()
      },
    }
    const ok = await speakLemma('Haus', 'de', {
      getSynth: () => atTap,
      createUtterance: utter,
    })
    expect(ok).toBe(true)
    expect(spoken).toHaveLength(1)
    expect(spoken[0]!.voice).toBe(voice)
    expect(spoken[0]!.text).toBe('Haus')
    expect(order).toEqual(['speak'])
  })

  test('empty prime reads twice; voiceschanged then caches for a later speak', async () => {
    let voices: SpeechVoiceLike[] = []
    let calls = 0
    const listeners = new Set<() => void>()
    const voice = { lang: 'pt-BR', localService: true }
    const synth: SpeechSynthLike = {
      getVoices: () => {
        calls += 1
        return voices
      },
      cancel: () => {},
      speak: () => {},
      addEventListener: (_type, listener) => {
        listeners.add(listener)
      },
      removeEventListener: (_type, listener) => {
        listeners.delete(listener)
      },
    }
    primeSpeechVoices({ getSynth: () => synth })
    expect(calls).toBe(2)
    expect(listeners.size).toBe(1)
    primeSpeechVoices({ getSynth: () => synth })
    expect(listeners.size).toBe(1)

    voices = [voice]
    for (const listener of listeners) listener()

    voices = []
    const spoken: SpeechUtteranceLike[] = []
    const ok = await speakLemma('casa', 'pt', {
      getSynth: () => ({
        getVoices: () => [],
        cancel: () => {},
        resume: () => {},
        speak: (u) => {
          spoken.push(u)
          u.onstart?.()
        },
      }),
      createUtterance: utter,
    })
    expect(ok).toBe(true)
    expect(spoken[0]!.voice).toBe(voice)
    expect(spoken[0]!.lang).toBe('pt-BR')
  })

  test('unlockSpeechGesture is prime-only: no platform speak', () => {
    const mock = mockSynth([{ lang: 'en-US', localService: true }])
    const opts = {
      getSynth: () => mock.synth,
      createUtterance: (text: string): SpeechUtteranceLike => ({
        text,
        lang: '',
        voice: null,
        volume: 1,
      }),
    }
    expect(unlockSpeechGesture(opts)).toBe(true)
    // Avery #124 Warning 1: silent unlock speak removed — prime only.
    expect(mock.spoken).toHaveLength(0)
    expect(mock.cancels).toBe(0)
    expect(mock.order).toEqual([])
    expect(mock.resumes).toBe(0)
    expect(unlockSpeechGesture(opts)).toBe(true)
    expect(mock.spoken).toHaveLength(0)
  })

  test('earlier-gesture unlock then speakLemma: idle lemma speak, no cancel', async () => {
    // Models unlock (prime-only) on a non-speak Play tap, then EndCard
    // speakLemma later. Speak-button path never calls unlock (Play skips
    // data-endcard-speak). No silent unlock sits ahead of the lemma.
    const mock = mockSynth([{ lang: 'en-US', localService: true }])
    expect(
      unlockSpeechGesture({
        getSynth: () => mock.synth,
        createUtterance: (text) => ({
          text,
          lang: '',
          voice: null,
          volume: 1,
        }),
      }),
    ).toBe(true)
    expect(mock.spoken).toHaveLength(0)
    const ok = await speakLemma('BANANA', 'en', {
      getSynth: () => mock.synth,
      createUtterance: utter,
    })
    expect(ok).toBe(true)
    expect(mock.cancels).toBe(0)
    expect(mock.resumes).toBe(0)
    expect(mock.order).toEqual(['speak'])
    expect(mock.spoken.map((u) => u.text)).toEqual(['BANANA'])
    expect(mock.spoken[0]!.voice).toEqual({ lang: 'en-US', localService: true })
  })

  test('failed unlock can retry on a later call', () => {
    expect(unlockSpeechGesture({ getSynth: () => null })).toBe(false)
    // speak() throwing is irrelevant — unlock never speaks.
    const boom: SpeechSynthLike = {
      getVoices: () => [{ lang: 'en-US', localService: true }],
      cancel: () => {},
      speak: () => {
        throw new Error('speak')
      },
    }
    expect(
      unlockSpeechGesture({
        getSynth: () => boom,
        createUtterance: utter,
      }),
    ).toBe(true)
    expect(
      unlockSpeechGesture({
        getSynth: () => boom,
        createUtterance: utter,
      }),
    ).toBe(true)

    const mock = mockSynth([{ lang: 'en-US', localService: true }])
    // Already latched from boom (synth was present).
    expect(
      unlockSpeechGesture({
        getSynth: () => mock.synth,
        createUtterance: (text) => ({
          text,
          lang: '',
          voice: null,
          volume: 1,
        }),
      }),
    ).toBe(true)
    expect(mock.spoken).toHaveLength(0)
  })

  test('pointerdown on speak control: unlock speak count stays 0', () => {
    // Play skips unlockSpeechGesture when closest('[data-endcard-speak]').
    // Even if unlock were called, prime-only means speak count 0.
    const mock = mockSynth([{ lang: 'en-US', localService: true }])
    // Simulate speak-button path: prime only, do not unlock-speak.
    primeSpeechVoices({ getSynth: () => mock.synth })
    expect(mock.spoken).toHaveLength(0)
    expect(mock.cancels).toBe(0)
    // And if unlock ran elsewhere first, still no unlock speak.
    expect(
      unlockSpeechGesture({
        getSynth: () => mock.synth,
        createUtterance: utter,
      }),
    ).toBe(true)
    expect(mock.spoken).toHaveLength(0)
  })

  test('prime and unlock never throw', () => {
    expect(() =>
      primeSpeechVoices({
        getSynth: () => {
          throw new Error('missing')
        },
      }),
    ).not.toThrow()
    expect(() => unlockSpeechGesture({ getSynth: () => null })).not.toThrow()
    expect(unlockSpeechGesture({ getSynth: () => null })).toBe(false)
    const boom: SpeechSynthLike = {
      getVoices: () => {
        throw new Error('voices')
      },
      cancel: () => {},
      speak: () => {
        throw new Error('speak')
      },
    }
    expect(() =>
      unlockSpeechGesture({
        getSynth: () => boom,
        createUtterance: utter,
      }),
    ).not.toThrow()
    // Prime-only: synth present latches even if getVoices/speak would throw.
    expect(
      unlockSpeechGesture({
        getSynth: () => boom,
        createUtterance: utter,
      }),
    ).toBe(true)
    expect(() => primeSpeechVoices({ getSynth: () => boom })).not.toThrow()
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

describe('shipped bundle still contains the watchdog cancel', () => {
  test('the index script passes the watchdog marker to cancel when a build exists', () => {
    const dist = path.join(import.meta.dir, '../..', 'dist')
    if (!existsSync(dist)) return
    const html = readFileSync(path.join(dist, 'index.html'), 'utf8')
    const cited = html.match(/\/assets\/[^"']+\.js/)
    expect(cited).toBeTruthy()
    const file = path.join(dist, cited![0].replace(/^\//, ''))
    expect(existsSync(file)).toBe(true)
    const body = readFileSync(file, 'utf8')
    const marker = SPEECH_WATCHDOG_CANCEL_MARKER.replace(
      /[.*+?^${}()|[\]\\]/g,
      '\\$&',
    )
    const inlined = new RegExp(`\\.cancel\\([\`"']${marker}[\`"']\\)`)
    const named = body.match(
      new RegExp(`([A-Za-z_$][\\w$]*)=[\`"']${marker}[\`"']`),
    )
    const passedToCancel =
      inlined.test(body) ||
      (named !== null && body.includes(`.cancel(${named[1]})`))
    expect(passedToCancel).toBe(true)
  })
})
