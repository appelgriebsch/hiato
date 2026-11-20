import { useEffect, useRef, useState } from 'react'
import { PixelIcon } from '@/components/PixelIcon'
import { speakLemma, subscribeSpeakActivity } from '@/lib/speech'
import { posLabel, speakLemmaAriaLabel } from '@/packs/labels'
import { FAMILY_MAX, type PackLang, type PackPos } from '@/packs/schema'

/**
 * Post-round gloss, lemma, and tap-to-speak (ADR 0052 §5.5: gloss Inter 18px 600,
 * the word Jersey 37px with +0.06em tracking, example Inter italic, speaker
 * pixel icon). ADR 0057 adds the pos/ipa meta row under the word and the labeled
 * Synonyms / Word family chip groups — all EndCard-only. click is native so iOS
 * keeps the user gesture (ADR 0037).
 */
export function LemmaTeach({
  lang,
  word,
  gloss,
  synonyms,
  example,
  pos,
  ipa,
  family,
  showSpeak,
}: {
  lang: PackLang
  word: string
  gloss: string
  synonyms: string[]
  /** One example sentence in the pack language (ADR 0049); EndCard-only. */
  example?: string
  /** ADR 0055: pos code, label localized via POS_LABELS; EndCard-only. */
  pos?: PackPos
  /** ADR 0055: one `/…/` IPA transcription; EndCard-only. */
  ipa?: string
  /** ADR 0055: derivational relatives (≤ FAMILY_MAX chips); EndCard-only. */
  family?: string[]
  showSpeak: boolean
}) {
  const posChip = pos ? posLabel(lang, pos) : null
  // Stored with slashes; the slashes render aria-hidden around the glyphs.
  const ipaBody = (ipa ?? '').trim().replace(/^\//, '').replace(/\/$/, '')
  const familyChips = (family ?? [])
    .filter((f) => f.trim().length > 0)
    .slice(0, FAMILY_MAX)
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
          className="mt-1.5 text-lg font-semibold leading-snug text-ink"
        >
          {gloss}
        </p>
      ) : null}
      <p
        className={[
          'text-sm text-ink-muted',
          gloss ? 'mt-1' : 'mt-1.5',
        ].join(' ')}
      >
        The word was
      </p>
      <div className="flex items-center justify-center gap-1">
        <p
          lang={lang}
          className={[
            'text-pixel-display tracking-[0.06em] text-ink',
            gloss ? 'mt-0' : 'mt-0.5',
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
              gloss ? 'mt-0' : 'mt-0.5',
            ].join(' ')}
          >
            <PixelIcon name="speaker" size={20} />
          </button>
        ) : null}
      </div>
      {posChip || ipaBody ? (
        <div
          data-endcard-meta
          className="mt-1 flex flex-wrap items-center justify-center gap-2"
        >
          {posChip ? (
            <span
              lang={lang}
              data-endcard-pos
              className="px-frame inline-flex items-center bg-accent-soft px-2.5 py-1 text-pixel-label text-accent-fg [--px-edge:var(--color-accent-fg)]"
            >
              {posChip}
            </span>
          ) : null}
          {ipaBody ? (
            <span lang={lang} data-endcard-ipa className="text-sm text-ink-muted">
              <span aria-hidden="true">/</span>
              {ipaBody}
              <span aria-hidden="true">/</span>
            </span>
          ) : null}
        </div>
      ) : null}
      {example?.trim() ? (
        <p
          lang={lang}
          data-endcard-example
          className="mx-auto mt-1.5 max-w-sm text-sm leading-snug text-ink-muted italic"
        >
          {example.trim()}
        </p>
      ) : null}
      {speakNote === 'playing' ? (
        <p lang="en" role="status" className="mt-1.5 text-xs text-ink-muted">
          Playing
        </p>
      ) : null}
      {speakNote === 'failed' ? (
        <p lang="en" role="status" className="mt-1.5 text-xs text-danger">
          Could not play the word.
        </p>
      ) : null}
      {showSpeak ? (
        <p lang="en" className="mt-0.5 text-xs text-ink-muted">
          If you hear nothing, the phone’s mute switch (Ring/Silent) mutes spoken words.
        </p>
      ) : null}
      {synonyms.length > 0 ? (
        <div
          data-endcard-synonyms
          className="mt-1 flex flex-wrap items-center justify-center gap-1.5"
        >
          <span lang="en" className="text-pixel-label text-ink-faint">
            Synonyms
          </span>
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
      {familyChips.length > 0 ? (
        <div
          data-endcard-family
          className="mt-1 flex flex-wrap items-center justify-center gap-1.5"
        >
          <span lang="en" className="text-pixel-label text-ink-faint">
            Word family
          </span>
          {familyChips.map((f) => (
            <span
              key={f}
              lang={lang}
              className="px-frame inline-flex items-center bg-transparent px-2.5 py-1 text-[13px] font-medium text-ink [--px-edge:var(--color-line)]"
            >
              {f}
            </span>
          ))}
        </div>
      ) : null}
    </>
  )
}
