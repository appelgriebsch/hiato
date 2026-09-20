import { useNavigate } from 'react-router-dom'
import { Layout, TopBar } from '@/components/Layout'
import { Card } from '@/components/ui/card'
import { PACK_LICENSES } from '@/packs/licenses'
import { LANG_CODES } from '@/packs/labels'

export function About() {
  const nav = useNavigate()

  return (
    <Layout>
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
        center={<span className="text-sm font-semibold text-ink">About</span>}
      />

      <h1 className="text-xl font-semibold text-ink">Licenses</h1>
      <p className="mt-1 mb-4 text-sm leading-relaxed text-ink-muted">
        Word packs ship with per-source attribution. Portuguese lemmas are
        curated from openly licensed Wiktionary-derived lists (CC-BY-SA).
        Gloss and synonym copy is original to Hiato.
      </p>

      {PACK_LICENSES.map((info) => (
        <Card key={info.lang} className="mb-3">
          <div className="mb-1 text-xs font-medium text-ink-faint">
            {LANG_CODES[info.lang]}
          </div>
          <h2 className="text-[15px] font-semibold text-ink">{info.title}</h2>
          <p className="mt-1.5 text-xs font-medium text-accent">{info.license}</p>
          <ul className="mt-2 list-disc space-y-1 pl-4 text-[13px] leading-snug text-ink-muted">
            {info.attribution.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </Card>
      ))}

      <p className="mt-2 mb-6 text-center text-[11px] leading-relaxed text-ink-faint">
        Selected-language packs are cached for offline play; other languages
        download on demand (ADR 0006).
      </p>
    </Layout>
  )
}
