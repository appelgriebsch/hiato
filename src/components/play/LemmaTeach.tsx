import { useEffect, useRef, useState } from 'react'
import { PixelIcon } from '@/components/PixelIcon'
import { speakLemma, subscribeSpeakActivity } from '@/lib/speech'
import { speakLemmaAriaLabel } from '@/packs/labels'
import type { PackLang } from '@/packs/schema'

/**
 * Post-round gloss, lemma, and tap-to-speak (ADR 0052 §5.5: gloss Inter 18px 600,
 * the word Jersey 37px with +0.06em tracking, example Inter italic, speaker
 * pixel icon). click is native so iOS keeps the user gesture (ADR 0037).
 */
export function LemmaTeach({
  lang,
  word,
  gloss,
  synonyms,
  example,
  showSpeak,
}: {
  lang: PackLang
  word: string
  gloss: string
  synonyms: string[]
  /** One example sentence in the pack language (ADR 0049); EndCard-only. */
  example?: string
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
            'text-pixel-display tracking-[0.06em] text-ink',
            gloss ? 'mt-0.5' : 'mt-1',
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
              'motion-press inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center hover:bg-cream-dark active:bg-cream-dark focus-visible:bg-accent-soft',
              speaking ? 'text-accent-fg' : 'text-ink-muted',
              gloss ? 'mt-0.5' : 'mt-1',
            ].join(' ')}
          >
            <PixelIcon name="speaker" size={20} />
          </button>
        ) : null}
      </div>
      {example?.trim() ? (
        <p
          lang={lang}
          data-endcard-example
          className="mx-auto mt-3 max-w-sm text-sm leading-snug text-ink-muted italic"
        >
          {example.trim()}
        </p>
      ) : null}
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
      {showSpeak ? (
        <p lang="en" className="mt-2 text-xs text-ink-muted">
          If you hear nothing, the phone’s mute switch (Ring/Silent) mutes spoken words.
        </p>
      ) : null}
      {synonyms.length > 0 ? (
        <div className="mt-2.5 flex flex-wrap justify-center gap-1.5">
          {synonyms.map((s) => (
            <span
              key={s}
              lang={lang}
              className="inline-flex items-center bg-cream-dark px-2.5 py-1 text-[13px] font-medium text-ink"
            >
              {s}
            </span>
          ))}
        </div>
      ) : null}
    </>
  )
}
