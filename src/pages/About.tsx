import { useNavigate } from 'react-router-dom'
import { Layout, TopBar } from '@/components/Layout'
import { Card } from '@/components/ui/card'
import { PACK_LICENSES } from '@/packs/licenses'
import { LANG_CODES } from '@/packs/labels'

const CC_BY_SA_DEED = 'https://creativecommons.org/licenses/by-sa/4.0/'
const CEFRJ_TERMS = 'http://www.cefr-j.org/download.html'

function licenseDeedHref(license: string): string | null {
  if (/CC-BY-SA/i.test(license)) return CC_BY_SA_DEED
  if (/CEFR-J/i.test(license)) return CEFRJ_TERMS
  return null
}

function NoteText({ line }: { line: string }) {
  const parts = line.split(/(https?:\/\/[^\s)]+)/)
  return (
    <>
      {parts.map((part, i) =>
        /^https?:\/\//.test(part) ? (
          <a
            key={`${part}-${i}`}
            className="text-accent-fg underline-offset-2 hover:underline"
            href={part}
            rel="noreferrer"
            target="_blank"
          >
            {part}
          </a>
        ) : (
          <span key={`${i}-${part.slice(0, 12)}`}>{part}</span>
        ),
      )}
    </>
  )
}

function LicenseLine({ license }: { license: string }) {
  const href = licenseDeedHref(license)
  if (!href) {
    return <p className="mt-1.5 text-xs font-medium text-accent-fg">{license}</p>
  }
  return (
    <p className="mt-1.5 text-xs font-medium text-accent-fg">
      <a
        className="underline-offset-2 hover:underline"
        href={href}
        rel="noreferrer"
        target="_blank"
      >
        {license}
      </a>
    </p>
  )
}

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
        Word packs ship with per-source attribution. English A1–B2 lemmas are
        selected from the CEFR-J Wordlist (free use with citation; © Tono
        Laboratory, TUFS). C1–C2 come from the Octanove Vocabulary Profile
        (CC-BY-SA). German, Spanish, and Portuguese are CC-BY-SA at every
        level. German CEFR labels are calibrated against Goethe-Institut
        lists, not copied from them. Spanish and Portuguese C-levels are
        frequency-rank bands, not Instituto Cervantes or CAPLE lists.
        Portuguese lemmas come from hermitdave/FrequencyWords pt_50k
        (OpenSubtitles; content CC-BY-SA-4.0, code MIT). Gloss and synonym
        copy is original to Hiato and is always in the pack language.
      </p>

      {PACK_LICENSES.map((info) => (
        <Card key={info.lang} className="mb-3">
          <div className="mb-1 text-xs font-medium text-ink-faint">
            {LANG_CODES[info.lang]}
          </div>
          <h2 className="text-[15px] font-semibold text-ink">{info.title}</h2>
          {info.bands.map((band) => (
            <div key={band.levels} className="mt-3">
              <p className="text-xs font-semibold text-ink">{band.levels}</p>
              <LicenseLine license={band.license} />
              <ul className="mt-2 list-disc space-y-1 pl-4 text-[13px] leading-snug text-ink-muted">
                {band.notes.map((line) => (
                  <li key={line}>
                    <NoteText line={line} />
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </Card>
      ))}

      <Card className="mb-3">
        <div className="mb-1 text-xs font-medium text-ink-faint">Typeface</div>
        <h2 className="text-[15px] font-semibold text-ink">Inter</h2>
        <p className="mt-1.5 text-xs font-medium text-accent-fg">
          SIL Open Font License 1.1
        </p>
        <ul className="mt-2 list-disc space-y-1 pl-4 text-[13px] leading-snug text-ink-muted">
          <li>
            Copyright (c) 2016 The Inter Project Authors (
            <a
              className="text-accent-fg underline-offset-2 hover:underline"
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
              className="text-accent-fg underline-offset-2 hover:underline"
              href="/fonts/LICENSE.txt"
            >
              /fonts/LICENSE.txt
            </a>
            {' · '}
            repo <code className="text-[12px]">NOTICE</code>.
          </li>
        </ul>
      </Card>

      <p className="mt-2 mb-2 text-center text-[11px] leading-relaxed text-ink-faint">
        Selected-language packs are cached for offline play; other languages
        download on demand (ADR 0006).
      </p>
      <p className="mb-6 text-center text-[12px] leading-relaxed text-ink-muted">
        Built by Grok Bot ·{' '}
        <span className="font-mono">{__HIATO_BUILD_SHA__}</span>
      </p>
    </Layout>
  )
}
