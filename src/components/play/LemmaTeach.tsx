import { useEffect, useRef, useState } from 'react'
import { speakLemma, subscribeSpeakActivity } from '@/lib/speech'
import { speakLemmaAriaLabel } from '@/packs/labels'
import type { PackLang } from '@/packs/schema'

/**
 * Post-round gloss, lemma, and tap-to-speak.
 * click is native so iOS keeps the user gesture (ADR 0037).
 */
export function LemmaTeach({
  lang,
  word,
  gloss,
  synonyms,
  showSpeak,
}: {
  lang: PackLang
  word: string
  gloss: string
  synonyms: string[]
  showSpeak: boolean
}) {
  const speakBtnRef = useRef<HTMLButtonElement>(null)
  const [speaking, setSpeaking] = useState(false)
  const [speakNote, setSpeakNote] = useState<'idle' | 'playing' | 'failed'>('idle')

  useEffect(() => {
    if (!showSpeak) {
      setSpeaking(false)
      setSpeakNote('idle')
      return
    }
    return subscribeSpeakActivity((on) => {
      setSpeaking(on)
      setSpeakNote((note) => {
        if (on) return 'playing'
        return note === 'playing' ? 'idle' : note
      })
    })
  }, [showSpeak])

  useEffect(() => {
    const btn = speakBtnRef.current
    if (!btn) return
    // WebKit on iOS drops speechSynthesis.speak() unless the call is
    // inside the synthetic click. A touch-end listener is not that
    // gesture, and speaking there then ignoring click leaves the phone silent.
    // A keyboard activation is also a click. A false from speakLemma,
    // including the three-second timer, shows the failure line.
    const onClick = () => {
      void speakLemma(word, lang).then((ok) => {
        if (ok) return
        setSpeakNote((note) => (note === 'playing' ? note : 'failed'))
      })
    }
    btn.addEventListener('click', onClick)
    return () => {
      btn.removeEventListener('click', onClick)
    }
  }, [showSpeak, word, lang])

  return (
    <>
      {gloss ? (
        <p
          lang={lang}
          className="mt-3 text-lg font-semibold leading-snug text-ink"
        >
          {gloss}
        </p>
      ) : null}
      <p
        className={[
          'text-sm text-ink-muted',
          gloss ? 'mt-2' : 'mt-3',
        ].join(' ')}
      >
        The word was
      </p>
      <div className="flex items-center justify-center gap-1">
        <p
          lang={lang}
          className={[
            'tracking-wide text-ink',
            gloss ? 'mt-0.5 text-base font-medium' : 'mt-1 text-lg font-semibold',
          ].join(' ')}
        >
          {word}
        </p>
        {showSpeak ? (
          <button
            ref={speakBtnRef}
            type="button"
            lang={lang}
            data-endcard-speak
            data-speaking={speaking ? 'true' : 'false'}
            aria-label={speakLemmaAriaLabel(lang)}
            aria-busy={speaking}
            className={[
              'motion-press inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-xl hover:bg-cream-dark active:bg-cream-dark focus-visible:outline-none focus-visible:bg-accent-soft focus-visible:ring-2 focus-visible:ring-accent-fg',
              speaking ? 'text-accent-fg' : 'text-ink-muted',
              gloss ? 'mt-0.5' : 'mt-1',
            ].join(' ')}
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
              <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
              <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
            </svg>
          </button>
        ) : null}
      </div>
      {speakNote === 'playing' ? (
        <p lang="en" role="status" className="mt-2 text-xs text-ink-muted">
          Playing
        </p>
      ) : null}
      {speakNote === 'failed' ? (
        <p lang="en" role="status" className="mt-2 text-xs text-danger">
          Could not play the word.
        </p>
      ) : null}
      {synonyms.length > 0 ? (
        <div className="mt-2.5 flex flex-wrap justify-center gap-1.5">
          {synonyms.map((s) => (
            <span
              key={s}
              lang={lang}
              className="inline-flex items-center rounded-full bg-cream-dark/90 px-2.5 py-1 text-[11px] font-medium text-ink"
            >
              {s}
            </span>
          ))}
        </div>
      ) : null}
    </>
  )
}
