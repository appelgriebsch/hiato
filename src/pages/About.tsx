import { useEffect, useState, type KeyboardEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { Layout, TopBar } from '@/components/Layout'
import { PixelIcon } from '@/components/PixelIcon'
import { Card } from '@/components/ui/card'
import { useT, useUiLocaleSetting } from '@/i18n/use-ui-locale'
import { UI_LOCALES, type UILocale } from '@/i18n'
import { setUiLocale } from '@/lib/ui-locale'
import { moveRadio } from '@/pages/Language'
import { PACK_LICENSES } from '@/packs/licenses'
import { LANG_CODES, LANG_LABELS } from '@/packs/labels'
import { getSoundOn, playCue, setSoundOn, subscribeSoundChange } from '@/lib/sound'

const CC_BY_SA_DEED = 'https://creativecommons.org/licenses/by-sa/4.0/'
const CEFRJ_TERMS = 'http://www.cefr-j.org/download.html'
const CC_BY_2_FR_DEED = 'https://creativecommons.org/licenses/by/2.0/fr/'
const TATOEBA = 'https://tatoeba.org'
const WIKTEXTRACT = 'https://kaikki.org/dictionary/'

function licenseDeedHref(license: string): string | null {
  if (/CC-BY-SA/i.test(license)) return CC_BY_SA_DEED
  if (/CEFR-J/i.test(license)) return CEFRJ_TERMS
  if (/CC-BY 2\.0 FR/i.test(license)) return CC_BY_2_FR_DEED
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
            className="inline-flex min-h-11 items-center break-all text-accent-fg underline-offset-2 hover:underline"
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
        className="inline-flex min-h-11 items-center break-all underline-offset-2 hover:underline"
        href={href}
        rel="noreferrer"
        target="_blank"
      >
        {license}
      </a>
    </p>
  )
}

/**
 * "Sound effects" switch (ADR 0052 decision 3 / §5.9). Off by default, stored
 * in `hiato.sound`. role="switch" named "Sound effects", described by the
 * helper line; the visible Off/On word plus the thumb position mean colour is
 * never the only cue. Turning it on plays one coin cue from the same tap.
 */
function SoundCard() {
  const t = useT()
  const [on, setOn] = useState(getSoundOn)

  useEffect(() => subscribeSoundChange(() => setOn(getSoundOn())), [])

  function toggle() {
    const next = !on
    setSoundOn(next)
    setOn(next)
    if (next) playCue('coin')
  }

  return (
    <Card className="mb-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-start gap-2.5">
          <PixelIcon
            name="speaker"
            size={24}
            className="mt-1 shrink-0 text-ink-muted"
            aria-hidden="true"
          />
          <div className="min-w-0">
            <p id="sound-label" className="text-pixel-title text-ink">
              {t('about.soundTitle')}
            </p>
            <p id="sound-help" className="mt-1 text-sm leading-snug text-ink-muted">
              {t('about.soundHelp')}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2.5">
          <span aria-hidden="true" className="text-pixel-label text-ink">
            {on ? t('common.on') : t('common.off')}
          </span>
          <button
            type="button"
            role="switch"
            aria-checked={on}
            aria-labelledby="sound-label"
            aria-describedby="sound-help"
            onClick={toggle}
            className="motion-press relative flex min-h-11 w-12 items-center justify-center"
          >
            <span
              aria-hidden="true"
              className={[
                'px-frame flex h-7 w-12 items-center px-1',
                on ? 'bg-accent [--px-edge:var(--color-edge)]' : 'bg-cream-dark',
              ].join(' ')}
            >
              <span
                className={[
                  'block h-[18px] w-[18px] transition-[transform] duration-150 [transition-timing-function:steps(2,end)] motion-reduce:transition-none',
                  on ? 'translate-x-[22px] bg-white' : 'translate-x-0 bg-ink',
                ].join(' ')}
              />
            </span>
          </button>
        </div>
      </div>
    </Card>
  )
}

type UiLocaleOption = UILocale | 'system'

const UI_LOCALE_OPTIONS: readonly UiLocaleOption[] = ['system', ...UI_LOCALES]

/**
 * "Interface language" card (ADR 0063 / #379): radiogroup reusing the
 * Language.tsx pattern (aria-checked, roving tabindex, min-h-11 rows) with a
 * System entry first. Writes only `hiato.ui-locale`, never `hiato.prefs`.
 */
function UiLanguageCard() {
  const t = useT()
  const setting = useUiLocaleSetting()
  const select = (value: UiLocaleOption) => setUiLocale(value)
  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>) =>
    moveRadio(e, UI_LOCALE_OPTIONS, setting, select)
  return (
    <Card className="mb-4" data-ui-locale-card>
      <div className="flex items-start gap-2.5">
        <PixelIcon
          name="spark"
          size={24}
          className="mt-1 shrink-0 text-ink-muted"
          aria-hidden="true"
        />
        <div className="min-w-0 flex-1">
          <h2 id="ui-language-heading" className="text-pixel-title text-ink">
            {t('about.uiLanguage')}
          </h2>
          <p id="ui-language-help" className="mt-1 text-sm leading-snug text-ink-muted">
            {t('about.uiLanguageHelp')}
          </p>
        </div>
      </div>
      <div
        role="radiogroup"
        data-radio-group
        data-ui-locale-picker
        aria-labelledby="ui-language-heading"
        aria-describedby="ui-language-help"
        className="mt-3 grid grid-cols-2 gap-2"
      >
        {UI_LOCALE_OPTIONS.map((opt) => (
          <button
            key={opt}
            type="button"
            role="radio"
            data-radio={opt}
            aria-checked={setting === opt}
            tabIndex={setting === opt ? 0 : -1}
            onClick={() => select(opt)}
            onKeyDown={onKeyDown}
            className={[
              'motion-press relative min-h-11 border-2 px-4 py-1.5 text-left',
              'transition-[border-color,background-color,color] duration-200',
              setting === opt
                ? 'border-accent-fg bg-accent-soft text-accent-fg'
                : 'border-line bg-raised text-ink hover:bg-cream-dark',
            ].join(' ')}
          >
            {opt === 'system' ? (
              t('common.system')
            ) : (
              <span lang={opt}>{LANG_LABELS[opt]}</span>
            )}
          </button>
        ))}
      </div>
    </Card>
  )
}

export function About() {
  const nav = useNavigate()
  const t = useT()

  return (
    <Layout>
      <TopBar
        left={
          <button
            type="button"
            className="motion-press -ml-2 inline-flex min-h-11 min-w-11 items-center px-2 text-sm text-ink-muted"
            onClick={() => nav('/')}
          >
            {t('common.back')}
          </button>
        }
        center={<span className="text-pixel-title text-ink">{t('about.title')}</span>}
      />

      <SoundCard />

      <UiLanguageCard />

      <h1 className="text-pixel-display text-ink">{t('about.whatWeCount')}</h1>
      <p className="mt-1 mb-4 text-sm leading-relaxed text-ink-muted">
        {t('about.whatWeCountBody')}
      </p>

      <h1 className="text-pixel-display text-ink">{t('about.licenses')}</h1>
      <p className="mt-1 mb-4 text-sm leading-relaxed text-ink-muted">
        {t('about.licensesBody')}
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
        <div className="mb-1 text-xs font-medium text-ink-faint">{t('about.kickerEndcard')}</div>
        <h2 className="text-[15px] font-semibold text-ink">{t('about.exampleSentences')}</h2>
        <p className="mt-1.5 text-xs font-medium text-accent-fg">
          <a
            className="inline-flex min-h-11 items-center break-all underline-offset-2 hover:underline"
            href={CC_BY_2_FR_DEED}
            rel="noreferrer"
            target="_blank"
          >
            CC-BY 2.0 FR
          </a>
        </p>
        <ul className="mt-2 list-disc space-y-1 pl-4 text-[13px] leading-snug text-ink-muted">
          <li>
            {t('about.exampleFromPrefix')}{' '}
            <a
              className="inline-flex min-h-11 items-center break-all text-accent-fg underline-offset-2 hover:underline"
              href={TATOEBA}
              rel="noreferrer"
              target="_blank"
            >
              tatoeba.org
            </a>{' '}
            {t('about.exampleFromSuffix')}
          </li>
          <li>
            {t('about.exampleOriginal')}
          </li>
        </ul>
      </Card>

      <Card className="mb-3">
        <div className="mb-1 text-xs font-medium text-ink-faint">{t('about.kickerEndcard')}</div>
        <h2 className="text-[15px] font-semibold text-ink">
          {t('about.pronFamily')}
        </h2>
        <p className="mt-1.5 text-xs font-medium text-accent-fg">
          <a
            className="inline-flex min-h-11 items-center break-all underline-offset-2 hover:underline"
            href={CC_BY_SA_DEED}
            rel="noreferrer"
            target="_blank"
          >
            CC-BY-SA 4.0
          </a>
        </p>
        <ul className="mt-2 list-disc space-y-1 pl-4 text-[13px] leading-snug text-ink-muted">
          <li>
            {t('about.ipaFromPrefix')}{' '}
            <a
              className="inline-flex min-h-11 items-center break-all text-accent-fg underline-offset-2 hover:underline"
              href={WIKTEXTRACT}
              rel="noreferrer"
              target="_blank"
            >
              Wiktionary via wiktextract (kaikki.org)
            </a>{' '}
            {t('about.ipaFromSuffix')}
          </li>
          <li>
            {t('about.ipaOriginal')}
          </li>
        </ul>
      </Card>

      <Card className="mb-3">
        <div className="mb-1 text-xs font-medium text-ink-faint">{t('about.kickerTypeface')}</div>
        <h2 className="text-[15px] font-semibold text-ink">Inter</h2>
        <p className="mt-1.5 text-xs font-medium text-accent-fg">
          SIL Open Font License 1.1
        </p>
        <ul className="mt-2 list-disc space-y-1 pl-4 text-[13px] leading-snug text-ink-muted">
          <li>
            {t('about.copyrightInter')}
            <a
              className="inline-flex min-h-11 items-center break-all text-accent-fg underline-offset-2 hover:underline"
              href="https://github.com/rsms/inter"
            >
              github.com/rsms/inter
            </a>
            ).
          </li>
          <li>
            {t('about.interSelfHostedPrefix')}{' '}
            <code className="text-[12px]">public/fonts</code>
            {t('about.interSelfHostedSuffix')}
          </li>
          <li>
            {t('about.fullLicensePrefix')}{' '}
            <a
              className="inline-flex min-h-11 items-center break-all text-accent-fg underline-offset-2 hover:underline"
              href="/fonts/LICENSE.txt"
            >
              /fonts/LICENSE.txt
            </a>
            {t('about.fullLicenseMid')}
            <code className="text-[12px]">NOTICE</code>.
          </li>
        </ul>
      </Card>

      <Card className="mb-3">
        <div className="mb-1 text-xs font-medium text-ink-faint">{t('about.kickerTypeface')}</div>
        <h2 className="text-[15px] font-semibold text-ink">Jersey 10</h2>
        <p className="mt-1.5 text-xs font-medium text-accent-fg">
          SIL Open Font License 1.1
        </p>
        <ul className="mt-2 list-disc space-y-1 pl-4 text-[13px] leading-snug text-ink-muted">
          <li>
            {t('about.copyrightJersey')}
            <a
              className="inline-flex min-h-11 items-center break-all text-accent-fg underline-offset-2 hover:underline"
              href="https://github.com/scfried/soft-type-jersey"
            >
              github.com/scfried/soft-type-jersey
            </a>
            ).
          </li>
          <li>
            {t('about.jerseySelfHostedPrefix')}{' '}
            <code className="text-[12px]">public/fonts</code>
            {t('about.jerseySelfHostedSuffix')}
          </li>
          <li>
            {t('about.fullLicensePrefix')}{' '}
            <a
              className="inline-flex min-h-11 items-center break-all text-accent-fg underline-offset-2 hover:underline"
              href="/fonts/Jersey10-OFL.txt"
            >
              /fonts/Jersey10-OFL.txt
            </a>
            {t('about.fullLicenseMid')}
            <code className="text-[12px]">NOTICE</code>.
          </li>
        </ul>
      </Card>

      <p className="mt-2 mb-2 text-center text-[11px] leading-relaxed text-ink-faint">
        {t('about.offlineNote')}
      </p>
      <p className="mb-6 text-center text-[12px] leading-relaxed text-ink-muted">
        <img
          src="/brand/mistral-mark.svg"
          alt=""
          width={12}
          height={12}
          className="mr-1 inline-block h-3 w-3 select-none align-[-2px]"
          draggable={false}
        />
        {t('about.builtBy')}{' '}
        <span className="font-mono">{__HIATO_BUILD_SHA__}</span>
      </p>
    </Layout>
  )
}
