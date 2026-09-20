import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { getHealth } from '@/api'
import { BrandLockup } from '@/components/brand/BrandMark'
import { Layout, TopBar } from '@/components/Layout'
import { OfflineChip } from '@/components/OfflineChip'
import { StreakChip } from '@/components/StreakChip'
import { Card } from '@/components/ui/card'
import { isPracticeAvailable } from '@/engine'
import { isDailyComplete } from '@/lib/daily-record'
import { getPrefs } from '@/lib/prefs'
import { ensureStreakPersisted, getStreakCount } from '@/lib/streaks'
import { useLocalDateKey } from '@/lib/use-local-date-key'
import { precacheSelectedLanguage } from '@/packs/cache'
import { CEFR_CODES, LANG_CODES } from '@/packs/labels'
import { loadPack } from '@/packs/load'
import { useShellStore } from '@/store/shell'

export function Home() {
  const nav = useNavigate()
  const healthOk = useShellStore((s) => s.healthOk)
  const setHealthOk = useShellStore((s) => s.setHealthOk)
  const prefs = getPrefs()
  const selectedLang = prefs?.lang
  const selectedCefr = prefs?.cefr
  const dateKey = useLocalDateKey()
  const streak =
    selectedLang && selectedCefr
      ? getStreakCount(selectedLang, selectedCefr, dateKey)
      : 0
  const dailyDone =
    selectedLang && selectedCefr
      ? isDailyComplete(selectedLang, selectedCefr, dateKey)
      : false
  const [practiceOk, setPracticeOk] = useState(true)

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

  useEffect(() => {
    if (!selectedLang || !selectedCefr) return
    ensureStreakPersisted(selectedLang, selectedCefr, dateKey)
  }, [selectedLang, selectedCefr, dateKey])

  useEffect(() => {
    if (!selectedLang || !selectedCefr) return
    let cancelled = false
    void loadPack(selectedLang, selectedCefr)
      .then((pack) => {
        if (cancelled) return
        setPracticeOk(
          isPracticeAvailable(pack.lemmas, dateKey, selectedLang, selectedCefr),
        )
      })
      .catch(() => {
        if (!cancelled) setPracticeOk(true)
      })
    return () => {
      cancelled = true
    }
  }, [selectedLang, selectedCefr, dateKey])

  const dailyLabel = prefs
    ? `Daily ${LANG_CODES[prefs.lang]} ${CEFR_CODES[prefs.cefr]}`
    : 'Choose language & level'

  return (
    <Layout>
      <TopBar
        left={<BrandLockup size="md" />}
        right={
          <div className="flex items-center gap-2">
            {prefs ? <StreakChip count={streak} /> : null}
            <OfflineChip />
          </div>
        }
      />

      <Card className="motion-onboarding-enter mb-4">
        <h1 className="text-title mb-2 text-ink">{dailyLabel}</h1>
        <p className="text-body mb-4 text-ink-muted">
          {prefs
            ? dailyDone
              ? 'Today’s daily is done. Come back after local midnight — or stretch with practice (practice does not affect your streak).'
              : 'Guess today’s word with soft vowel help, six lives, and learner hints. Offline after the pack is cached.'
            : 'Pick a language and CEFR level, then play today’s word. Packs for your language stay cached for offline play.'}
        </p>
        {prefs ? (
          <Link
            to="/play?mode=daily"
            className="motion-press inline-flex min-h-11 w-full items-center justify-center rounded-xl bg-accent px-5 text-[15px] font-medium text-white shadow-sm hover:bg-accent-mid"
          >
            {dailyDone ? 'View today’s result' : 'Play today'}
          </Link>
        ) : (
          <Link
            to="/language"
            className="motion-press inline-flex min-h-11 w-full items-center justify-center rounded-xl bg-accent px-5 text-[15px] font-medium text-white shadow-sm hover:bg-accent-mid"
          >
            Choose language
          </Link>
        )}
        {prefs ? (
          <>
            <button
              type="button"
              disabled={!practiceOk}
              className="motion-press mt-2 inline-flex min-h-11 w-full items-center justify-center rounded-xl bg-accent-soft px-5 text-[15px] font-medium text-accent hover:bg-helped disabled:pointer-events-none disabled:opacity-45"
              onClick={() => nav(`/play?mode=practice&seed=${Date.now()}`)}
            >
              Practice (endless)
            </button>
            {!practiceOk ? (
              <p className="mt-2 text-center text-xs text-ink-faint">
                Practice isn’t available — this pack only has today’s daily word.
              </p>
            ) : null}
          </>
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
