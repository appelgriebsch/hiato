import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { Layout, TopBar } from '@/components/Layout'
import { Button } from '@/components/ui/button'
import { getPrefs, setPrefs } from '@/lib/prefs'
import { precacheSelectedLanguage } from '@/packs/cache'
import { CEFR_LABELS, LANG_CODES, LANG_LABELS } from '@/packs/labels'
import { PACK_CEFRS, PACK_LANGS, type PackCefr, type PackLang } from '@/packs/schema'

function moveRadio<T extends string>(
  e: KeyboardEvent<HTMLButtonElement>,
  items: readonly T[],
  selected: T,
  setSelected: (v: T) => void,
): void {
  const idx = items.indexOf(selected)
  if (idx < 0) return
  let nextIdx = idx
  if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') {
    nextIdx = (idx - 1 + items.length) % items.length
  } else if (e.key === 'ArrowDown' || e.key === 'ArrowRight') {
    nextIdx = (idx + 1) % items.length
  } else if (e.key === 'Home') nextIdx = 0
  else if (e.key === 'End') nextIdx = items.length - 1
  else if (e.key === ' ' || e.key === 'Enter') {
    e.preventDefault()
    setSelected(selected)
    return
  } else return
  e.preventDefault()
  const value = items[nextIdx]!
  setSelected(value)
  const group = e.currentTarget.closest('[data-radio-group]')
  const btn = group?.querySelector(`[data-radio="${value}"]`)
  if (btn instanceof HTMLElement) btn.focus()
}

export function Language() {
  const saved = getPrefs()
  const [lang, setLang] = useState<PackLang>(saved?.lang ?? 'en')
  const [cefr, setCefr] = useState<PackCefr>(saved?.cefr ?? 'a1')
  const [preparing, setPreparing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const nav = useNavigate()
  const alive = useRef(true)

  useEffect(() => {
    return () => {
      alive.current = false
    }
  }, [])

  async function continuePlay() {
    if (preparing) return
    setPreparing(true)
    setError(null)
    try {
      const ok = await precacheSelectedLanguage(lang, cefr)
      if (!alive.current) return
      if (!ok) {
        setError(
          'Could not load the selected pack. Check your connection and try again.',
        )
        setPreparing(false)
        return
      }
      setPrefs({ lang, cefr })
      nav('/play?mode=daily')
    } catch {
      if (!alive.current) return
      setError(
        'Could not load the selected pack. Check your connection and try again.',
      )
      setPreparing(false)
    }
  }

  return (
    <Layout
      footer={
        <div className="pt-2 pb-4">
          {error ? (
            <p role="alert" className="mb-2 text-sm text-accent">
              {error}
            </p>
          ) : null}
          <Button
            fullWidth
            disabled={preparing}
            aria-busy={preparing}
            onClick={() => void continuePlay()}
          >
            {preparing ? 'Preparing packs…' : 'Continue to daily'}
          </Button>
        </div>
      }
    >
      <TopBar
        left={
          <button
            type="button"
            className="motion-press text-sm text-ink-muted disabled:opacity-40"
            disabled={preparing}
            onClick={() => {
              if (!preparing) nav('/')
            }}
          >
            ← Back
          </button>
        }
        center={<span className="text-sm font-semibold tracking-tight text-ink">Your level</span>}
      />

      <h1 id="language-heading" className="text-title text-ink">
        Language
      </h1>
      <p className="text-body mt-1 text-ink-muted">Pick the language you’re learning.</p>
      <div
        role="radiogroup"
        data-radio-group
        aria-labelledby="language-heading"
        aria-orientation="horizontal"
        className="mt-4 grid grid-cols-2 gap-2"
      >
        {PACK_LANGS.map((l) => (
          <button
            key={l}
            type="button"
            role="radio"
            data-radio={l}
            aria-checked={lang === l}
            tabIndex={lang === l ? 0 : -1}
            disabled={preparing}
            onClick={() => {
              if (!preparing) setLang(l)
            }}
            onKeyDown={(e) => moveRadio(e, PACK_LANGS, lang, setLang)}
            className={[
              'motion-press min-h-14 rounded-xl border-2 px-3 py-3 text-left disabled:opacity-40',
              'transition-[border-color,background-color] duration-200',
              lang === l
                ? 'border-accent bg-accent-soft'
                : 'border-line bg-white hover:bg-cream-dark',
            ].join(' ')}
          >
            <div className="text-xs font-medium text-ink-faint">{LANG_CODES[l]}</div>
            <div className="font-semibold text-ink">{LANG_LABELS[l]}</div>
          </button>
        ))}
      </div>

      <h2 id="cefr-heading" className="text-title mt-8 text-ink">
        CEFR level
      </h2>
      <p id="cefr-help" className="text-body mt-1 text-ink-muted">
        A1–A2 prefill vowels. B1–C2 start empty.
      </p>
      <div
        role="radiogroup"
        data-radio-group
        aria-labelledby="cefr-heading"
        aria-describedby="cefr-help"
        aria-orientation="vertical"
        className="mt-4 flex flex-col gap-2"
      >
        {PACK_CEFRS.map((c) => (
          <button
            key={c}
            type="button"
            role="radio"
            data-radio={c}
            aria-checked={cefr === c}
            tabIndex={cefr === c ? 0 : -1}
            disabled={preparing}
            onClick={() => {
              if (!preparing) setCefr(c)
            }}
            onKeyDown={(e) => moveRadio(e, PACK_CEFRS, cefr, setCefr)}
            className={[
              'motion-press min-h-12 rounded-xl border-2 px-4 py-3 text-left font-medium disabled:opacity-40',
              'transition-[border-color,background-color,color] duration-200',
              cefr === c
                ? 'border-accent bg-accent-soft text-accent'
                : 'border-line bg-white text-ink hover:bg-cream-dark',
            ].join(' ')}
          >
            {CEFR_LABELS[c]}
          </button>
        ))}
      </div>
    </Layout>
  )
}
