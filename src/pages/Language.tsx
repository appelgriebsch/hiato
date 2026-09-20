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
  const nav = useNavigate()

  function continuePlay() {
    setPrefs({ lang, cefr })
    void precacheSelectedLanguage(lang).catch(() => {})
    nav('/play')
  }

  return (
    <Layout
      footer={
        <div className="pb-6 pt-2">
          <Button fullWidth onClick={continuePlay}>
            Continue to daily
          </Button>
        </div>
      }
    >
      <TopBar
        left={
          <button
            type="button"
            className="text-sm text-ink-muted"
            onClick={() => nav('/')}
          >
            ← Back
          </button>
        }
        center={<span className="text-sm font-semibold text-ink">Your level</span>}
      />

      <h1 className="text-xl font-semibold text-ink">Language</h1>
      <p className="mt-1 text-sm text-ink-muted">Pick the language you’re learning.</p>
      <div className="mt-4 grid grid-cols-2 gap-2">
        {PACK_LANGS.map((l) => (
          <button
            key={l}
            type="button"
            onClick={() => setLang(l)}
            className={[
              'min-h-14 rounded-xl border-2 px-3 py-3 text-left transition-all',
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

      <h2 className="mt-8 text-xl font-semibold text-ink">CEFR level</h2>
      <p className="mt-1 text-sm text-ink-muted">
        A1–A2 prefill vowels. B1 starts empty.
      </p>
      <div className="mt-4 flex flex-col gap-2">
        {PACK_CEFRS.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => setCefr(c)}
            className={[
              'min-h-12 rounded-xl border-2 px-4 py-3 text-left font-medium transition-all',
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
