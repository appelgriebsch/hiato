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
            className="motion-press text-sm text-ink-muted"
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

      <Card className="mb-3">
        <div className="mb-1 text-xs font-medium text-ink-faint">Typeface</div>
        <h2 className="text-[15px] font-semibold text-ink">Inter</h2>
        <p className="mt-1.5 text-xs font-medium text-accent">
          SIL Open Font License 1.1
        </p>
        <ul className="mt-2 list-disc space-y-1 pl-4 text-[13px] leading-snug text-ink-muted">
          <li>
            Copyright (c) 2016 The Inter Project Authors (
            <a
              className="text-accent underline-offset-2 hover:underline"
              href="https://github.com/rsms/inter"
            >
              github.com/rsms/inter
            </a>
            ).
          </li>
          <li>
            Self-hosted latin woff2 (400 / 500 / 600) under{' '}
            <code className="text-[12px]">public/fonts</code>. Share cards load
            these same-origin files only — no Google Fonts or remote CDN (ADR
            0020).
          </li>
          <li>
            Full license:{' '}
            <a
              className="text-accent underline-offset-2 hover:underline"
              href="/fonts/LICENSE.txt"
            >
              /fonts/LICENSE.txt
            </a>
            {' · '}
            repo <code className="text-[12px]">NOTICE</code>.
          </li>
        </ul>
      </Card>

      <p className="mt-2 mb-6 text-center text-[11px] leading-relaxed text-ink-faint">
        Selected-language packs are cached for offline play; other languages
        download on demand (ADR 0006).
      </p>
    </Layout>
  )
}
