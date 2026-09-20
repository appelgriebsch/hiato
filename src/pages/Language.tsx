import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Layout, TopBar } from '@/components/Layout'
import { Button } from '@/components/ui/button'
import { getPrefs, setPrefs } from '@/lib/prefs'
import { precacheSelectedLanguage } from '@/packs/cache'
import { CEFR_LABELS, LANG_CODES, LANG_LABELS } from '@/packs/labels'
import { PACK_CEFRS, PACK_LANGS, type PackCefr, type PackLang } from '@/packs/schema'

export function Language() {
  const saved = getPrefs()
  const [lang, setLang] = useState<PackLang>(saved?.lang ?? 'en')
  const [cefr, setCefr] = useState<PackCefr>(saved?.cefr ?? 'a1')
  const [preparing, setPreparing] = useState(false)
  const nav = useNavigate()

  async function continuePlay() {
    if (preparing) return
    setPreparing(true)
    setPrefs({ lang, cefr })
    try {
      await precacheSelectedLanguage(lang)
    } catch {
      // Still navigate — Play can fetch on demand.
    }
    nav('/play?mode=daily')
  }

  return (
    <Layout
      footer={
        <div className="pt-2 pb-4">
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
            className="motion-press text-sm text-ink-muted"
            onClick={() => nav('/')}
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
        aria-labelledby="language-heading"
        className="mt-4 grid grid-cols-2 gap-2"
      >
        {PACK_LANGS.map((l) => (
          <button
            key={l}
            type="button"
            role="radio"
            aria-checked={lang === l}
            onClick={() => setLang(l)}
            className={[
              'motion-press min-h-14 rounded-xl border-2 px-3 py-3 text-left',
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
      <p className="text-body mt-1 text-ink-muted">
        A1–A2 prefill vowels. B1–C2 start empty.
      </p>
      <div
        role="radiogroup"
        aria-labelledby="cefr-heading"
        className="mt-4 flex flex-col gap-2"
      >
        {PACK_CEFRS.map((c) => (
          <button
            key={c}
            type="button"
            role="radio"
            aria-checked={cefr === c}
            onClick={() => setCefr(c)}
            className={[
              'motion-press min-h-12 rounded-xl border-2 px-4 py-3 text-left font-medium',
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
