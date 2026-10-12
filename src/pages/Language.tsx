import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { InstallHelpLink } from '@/components/InstallHelp'
import { Layout, TopBar } from '@/components/Layout'
import { Button } from '@/components/ui/button'
import { getPrefs, setPrefs } from '@/lib/prefs'
import { precacheSelectedLanguage } from '@/packs/cache'
import { CEFR_CODES, CEFR_LINES, LANG_CODES, LANG_LABELS } from '@/packs/labels'
import { packInfoLabel, provenanceCaption } from '@/packs/provenance'
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

export type CachePhase = 'idle' | 'caching' | 'ready' | 'error'

/** Hold "Saving…" back this long so a fast cache goes straight to Ready (#182). */
export const SAVING_DELAY_MS = 300

/** Check mark on the selected tile so selection isn't colour-only (#190). */
function SelectedCheck({ on }: { on: boolean }) {
  return on ? (
    <span aria-hidden="true" data-selected-check className="absolute top-1 right-1.5 text-xs font-bold leading-none">
      ✓
    </span>
  ) : null
}

/** Selected pair, provenance (#80/#99), offline status and A2HS once ready (#103). */
export function SelectionCard({
  lang,
  cefr,
  phase,
  showSaving,
}: {
  lang: PackLang
  cefr: PackCefr
  phase: CachePhase
  showSaving: boolean
}) {
  const caption = provenanceCaption(lang, cefr)
  const status =
    phase === 'ready'
      ? '✓ Ready offline'
      : phase === 'error'
        ? 'Not saved yet — connect and try again.'
        : phase === 'caching' && showSaving
          ? 'Saving for offline…'
          : '\u00a0'
  return (
    <section
      data-selection-card
      className="mt-3 rounded-xl border border-line bg-raised px-3 pt-2 pb-1"
    >
      {/* Status sits beside the pair so it stays above the footer at 320×568 (#182 W5) */}
      <div className="flex items-baseline justify-between gap-2" data-pack-cache-status>
        <p className="font-semibold text-ink">
          {LANG_LABELS[lang]} · {CEFR_CODES[cefr]}
        </p>
        <p
          className={
            phase === 'ready'
              ? 'shrink-0 text-sm font-medium text-ink'
              : 'min-w-0 text-right text-sm text-ink-muted'
          }
          aria-live="polite"
        >
          {status}
        </p>
      </div>
      {/* Selected-only provenance: muted non-link caption; Pack info → About */}
      <div className="flex items-center gap-2" data-provenance-caption>
        <span className="min-w-0 flex-1 line-clamp-2 text-xs text-ink-muted" title={caption}>
          {caption}
        </span>
        <Link
          to="/about"
          className="motion-press inline-flex min-h-11 min-w-11 shrink-0 items-center justify-end text-xs font-medium text-ink underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-fg rounded-sm"
        >
          {packInfoLabel(lang)}
        </Link>
      </div>
      <InstallHelpLink visible={phase === 'ready'} />
    </section>
  )
}

export function Language() {
  const saved = getPrefs()
  const [lang, setLang] = useState<PackLang>(saved?.lang ?? 'en')
  const [cefr, setCefr] = useState<PackCefr>(saved?.cefr ?? 'a1')
  const [preparing, setPreparing] = useState(false)
  const [cachePhase, setCachePhase] = useState<CachePhase>('idle')
  const [error, setError] = useState<string | null>(null)
  const [showSaving, setShowSaving] = useState(false)
  const nav = useNavigate()
  const alive = useRef(true)
  const cacheGen = useRef(0)

  useEffect(() => {
    return () => {
      alive.current = false
    }
  }, [])

  // Choosing lang×CEFR triggers pack download/cache for that selection (#103).
  useEffect(() => {
    const gen = ++cacheGen.current
    setCachePhase('caching')
    setShowSaving(false)
    setError(null)
    const t = setTimeout(() => {
      if (gen === cacheGen.current) setShowSaving(true)
    }, SAVING_DELAY_MS)
    void precacheSelectedLanguage(lang, cefr)
      .then((ok) => {
        if (!alive.current || gen !== cacheGen.current) return
        setCachePhase(ok ? 'ready' : 'error')
      })
      .catch(() => {
        if (!alive.current || gen !== cacheGen.current) return
        setCachePhase('error')
      })
    return () => clearTimeout(t)
  }, [lang, cefr])

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
        setCachePhase('error')
        setPreparing(false)
        return
      }
      setCachePhase('ready')
      setPrefs({ lang, cefr })
      nav('/play?mode=daily')
    } catch {
      if (!alive.current) return
      setError(
        'Could not load the selected pack. Check your connection and try again.',
      )
      setCachePhase('error')
      setPreparing(false)
    }
  }

  return (
    <Layout
      footer={
        <div className="pt-2 pb-4">
          {error ? (
            <p role="alert" className="mb-2 text-sm text-accent-fg">
              {error}
            </p>
          ) : null}
          <Button
            fullWidth
            disabled={preparing || cachePhase === 'caching'}
            aria-busy={preparing || cachePhase === 'caching'}
            onClick={() => void continuePlay()}
          >
            {preparing
              ? 'Preparing packs…'
              : cachePhase === 'caching' && showSaving
                ? 'Caching…'
                : 'Continue to daily'}
          </Button>
        </div>
      }
    >
      <TopBar
        left={
          <button
            type="button"
            className="motion-press -ml-2 inline-flex min-h-11 min-w-11 items-center px-2 text-sm text-ink-muted disabled:opacity-40"
            disabled={preparing}
            onClick={() => {
              if (!preparing) nav('/')
            }}
          >
            ← Back
          </button>
        }
      />

      <h1 className="text-title text-ink">Choose language &amp; level</h1>
      <h2 id="language-heading" className="mt-4 text-sm font-semibold text-ink">
        Language
      </h2>
      <div
        role="radiogroup"
        data-radio-group
        aria-labelledby="language-heading"
        className="mt-3 grid grid-cols-3 gap-2"
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
              'motion-press relative min-h-12 min-w-0 rounded-xl border-2 px-2 py-1.5 text-left disabled:opacity-40',
              'transition-[border-color,background-color] duration-200',
              lang === l
                ? 'border-accent-fg bg-accent-soft text-accent-fg ring-2 ring-accent-fg'
                : 'border-line bg-raised hover:bg-cream-dark',
            ].join(' ')}
          >
            <SelectedCheck on={lang === l} />
            <div className="text-xs font-medium text-ink-muted">{LANG_CODES[l]}</div>
            <div
              className={[
                'truncate text-sm font-semibold',
                lang === l ? 'text-accent-fg' : 'text-ink',
              ].join(' ')}
            >
              {LANG_LABELS[l]}
            </div>
          </button>
        ))}
      </div>

      <h2 id="cefr-heading" className="mt-4 text-sm font-semibold text-ink">
        Level
      </h2>
      <div
        role="radiogroup"
        data-radio-group
        aria-labelledby="cefr-heading"
        aria-describedby="cefr-help"
        className="mt-2 grid grid-cols-3 gap-2"
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
              'motion-press relative min-h-11 rounded-xl border-2 px-2 text-center font-semibold disabled:opacity-40',
              'transition-[border-color,background-color,color] duration-200',
              cefr === c
                ? 'border-accent-fg bg-accent-soft text-accent-fg ring-2 ring-accent-fg'
                : 'border-line bg-raised text-ink hover:bg-cream-dark',
            ].join(' ')}
          >
            <SelectedCheck on={cefr === c} />
            {CEFR_CODES[c]}
          </button>
        ))}
      </div>
      <p id="cefr-help" className="mt-2 text-sm text-ink-muted">
        {CEFR_LINES[cefr]}
      </p>

      <SelectionCard lang={lang} cefr={cefr} phase={cachePhase} showSaving={showSaving} />
    </Layout>
  )
}
