import { useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { getHealth } from '@/api'
import { Layout, TopBar } from '@/components/Layout'
import { OfflineChip } from '@/components/OfflineChip'
import { StreakChip } from '@/components/StreakChip'
import { Card } from '@/components/ui/card'
import { isDailyComplete } from '@/lib/daily-record'
import { getPrefs } from '@/lib/prefs'
import { getStreakCount } from '@/lib/streaks'
import { useLocalDateKey } from '@/lib/use-local-date-key'
import { precacheSelectedLanguage } from '@/packs/cache'
import { CEFR_CODES, LANG_CODES } from '@/packs/labels'
import { useShellStore } from '@/store/shell'

export function Home() {
  const nav = useNavigate()
  const healthOk = useShellStore((s) => s.healthOk)
  const setHealthOk = useShellStore((s) => s.setHealthOk)
  const prefs = getPrefs()
  const selectedLang = prefs?.lang
  const dateKey = useLocalDateKey()
  const streak = prefs ? getStreakCount(prefs.lang, prefs.cefr, dateKey) : 0
  const dailyDone = prefs
    ? isDailyComplete(prefs.lang, prefs.cefr, dateKey)
    : false

  useEffect(() => {
    let cancelled = false
    void getHealth()
      .then((r) => {
        if (!cancelled) setHealthOk(r.ok === true)
      })
      .catch(() => {
        if (!cancelled) setHealthOk(false)
      })
    return () => {
      cancelled = true
    }
  }, [setHealthOk])

  // Warm selected-language packs (all CEFR) into SW + localStorage (ADR 0006).
  useEffect(() => {
    if (!selectedLang) return
    void precacheSelectedLanguage(selectedLang).catch(() => {})
  }, [selectedLang])

  const dailyLabel = prefs
    ? `Daily ${LANG_CODES[prefs.lang]} ${CEFR_CODES[prefs.cefr]}`
    : 'Choose language & level'

  return (
    <Layout>
      <TopBar
        left={
          <span className="text-lg font-semibold tracking-tight text-ink">
            Hiato
          </span>
        }
        right={
          <div className="flex items-center gap-2">
            {prefs ? <StreakChip count={streak} /> : null}
            <OfflineChip />
          </div>
        }
      />

      <Card className="mb-4">
        <h1 className="mb-2 text-xl font-semibold text-ink">{dailyLabel}</h1>
        <p className="mb-4 text-[15px] leading-relaxed text-ink-muted">
          {prefs
            ? dailyDone
              ? 'Today’s daily is done. Come back after local midnight — or stretch with practice (practice does not affect your streak).'
              : 'Guess today’s word with soft vowel help, six lives, and learner hints. Offline after the pack is cached.'
            : 'Pick a language and CEFR level, then play today’s word. Packs for your language stay cached for offline play.'}
        </p>
        {prefs ? (
          <Link
            to="/play?mode=daily"
            className="inline-flex min-h-11 w-full items-center justify-center rounded-xl bg-accent px-5 text-[15px] font-medium text-white shadow-sm hover:bg-accent-mid active:scale-[0.98]"
          >
            {dailyDone ? 'View today’s result' : 'Play today'}
          </Link>
        ) : (
          <Link
            to="/language"
            className="inline-flex min-h-11 w-full items-center justify-center rounded-xl bg-accent px-5 text-[15px] font-medium text-white shadow-sm hover:bg-accent-mid active:scale-[0.98]"
          >
            Choose language
          </Link>
        )}
        {prefs ? (
          <button
            type="button"
            className="mt-2 inline-flex min-h-11 w-full items-center justify-center rounded-xl bg-accent-soft px-5 text-[15px] font-medium text-accent hover:bg-helped active:scale-[0.98]"
            onClick={() => nav(`/play?mode=practice&seed=${Date.now()}`)}
          >
            Practice (endless)
          </button>
        ) : null}
      </Card>

      <nav className="mb-6 flex items-center justify-center gap-4 text-sm">
        <Link to="/language" className="text-accent hover:underline">
          {prefs ? 'Change language' : 'Language'}
        </Link>
        <span className="text-ink-faint">·</span>
        <Link to="/about" className="text-accent hover:underline">
          About
        </Link>
      </nav>

      <p className="text-center text-xs text-ink-faint">
        API health:{' '}
        {healthOk === null
          ? '…'
          : healthOk
            ? 'ok'
            : 'unreachable (expected in local vite)'}
      </p>
    </Layout>
  )
}
