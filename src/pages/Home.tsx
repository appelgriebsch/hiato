import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { BrandLockup } from '@/components/brand/BrandMark'
import { Layout, TopBar } from '@/components/Layout'
import { PixelIcon } from '@/components/PixelIcon'
import { OfflineChip } from '@/components/OfflineChip'
import { PocketSheet } from '@/components/PocketSheet'
import { StatsSheet } from '@/components/StatsSheet'
import { StreakChip } from '@/components/StreakChip'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { isPracticeAvailable } from '@/engine'
import { isDailyComplete } from '@/lib/daily-record'
import { historySlot, listHistory } from '@/lib/history'
import { isDue, listPocketStored, pocketSlot, repairPocket } from '@/lib/pocket'
import { pocketRetryHref } from '@/lib/pocket-save'
import { getPrefs } from '@/lib/prefs'
import { ensureStreakPersisted, getStreak, visibleStreak } from '@/lib/streaks'
import { useLocalDateKey } from '@/lib/use-local-date-key'
import { precacheSelectedLanguage } from '@/packs/cache'
import { CEFR_CODES, LANG_CODES } from '@/packs/labels'
import { isPackCachedLocally, loadPack } from '@/packs/load'

export function Home() {
  const nav = useNavigate()
  const prefs = getPrefs()
  const selectedLang = prefs?.lang
  const selectedCefr = prefs?.cefr
  const dateKey = useLocalDateKey()
  const streakState =
    selectedLang && selectedCefr
      ? getStreak(selectedLang, selectedCefr, dateKey)
      : null
  const streak = streakState ? visibleStreak(streakState, dateKey) : 0
  const freezes = streakState?.freezes ?? 0
  const pocketEntries =
    selectedLang && selectedCefr
      ? listPocketStored(selectedLang, selectedCefr)
      : []
  const pocketCount = pocketEntries.length
  const pocketDue = pocketEntries.filter((entry) => isDue(entry, dateKey)).length
  const slotKey =
    selectedLang && selectedCefr ? pocketSlot(selectedLang, selectedCefr) : null
  const dailyDone =
    selectedLang && selectedCefr
      ? isDailyComplete(selectedLang, selectedCefr, dateKey)
      : false
  const historyCount =
    selectedLang && selectedCefr
      ? listHistory(historySlot(selectedLang, selectedCefr)).length
      : 0
  const [practiceOk, setPracticeOk] = useState(true)
  const [packCached, setPackCached] = useState(() =>
    selectedLang && selectedCefr
      ? isPackCachedLocally(selectedLang, selectedCefr)
      : false,
  )
  const [, bumpPocket] = useState(0)
  const [pocketOpen, setPocketOpen] = useState(false)
  const [statsOpen, setStatsOpen] = useState(false)
  const [clearedSlot, setClearedSlot] = useState<string | null>(null)
  // A slot change must not paint the previous slot's "Pocket cleared".
  if (clearedSlot !== null && clearedSlot !== slotKey) {
    setClearedSlot(null)
  }
  const pocketCleared = clearedSlot !== null && clearedSlot === slotKey
  const clearedRef = useRef<HTMLParagraphElement>(null)

  useLayoutEffect(() => {
    if (!pocketCleared) return
    const nodes = document.querySelectorAll<HTMLElement>('[data-pocket-cleared]')
    for (const n of nodes) {
      if (n.getClientRects().length > 0) {
        n.focus()
        return
      }
    }
    clearedRef.current?.focus()
  }, [pocketCleared])

  useEffect(() => {
    if (!selectedLang || !selectedCefr) return
    repairPocket()
  }, [selectedLang, selectedCefr])


  // Warm selected-language packs (all CEFR) into SW + localStorage (ADR 0006).
  // cacheGen + alive cancel stale lang×CEFR .then so Offline ready cannot flash wrong (#103).
  const cacheAlive = useRef(true)
  const cacheGen = useRef(0)
  useEffect(() => {
    return () => {
      cacheAlive.current = false
    }
  }, [])

  useEffect(() => {
    if (!selectedLang || !selectedCefr) {
      setPackCached(false)
      return
    }
    const gen = ++cacheGen.current
    setPackCached(isPackCachedLocally(selectedLang, selectedCefr))
    void precacheSelectedLanguage(selectedLang, selectedCefr)
      .then((ok) => {
        if (!cacheAlive.current || gen !== cacheGen.current) return
        setPackCached(
          ok || isPackCachedLocally(selectedLang, selectedCefr),
        )
      })
      .catch(() => {
        if (!cacheAlive.current || gen !== cacheGen.current) return
        setPackCached(isPackCachedLocally(selectedLang, selectedCefr))
      })
  }, [selectedLang, selectedCefr])

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

  const pocketControl = (clearedRefTarget: boolean) => {
    if (!prefs) return null
    if (pocketCount > 0) {
      return (
        <Button
          variant="outline"
          fullWidth
          className="mt-2"
          aria-label={
            pocketDue > 0
              ? `Pocket, ${pocketCount} words, ${pocketDue} due for review`
              : undefined
          }
          onClick={() => setPocketOpen(true)}
        >
          <PixelIcon name="pocket" size={24} className="shrink-0" aria-hidden="true" />
          {pocketDue > 0
            ? `Pocket (${pocketCount} · ${pocketDue} due)`
            : `Pocket (${pocketCount})`}
        </Button>
      )
    }
    if (pocketCleared) {
      return (
        <p
          ref={clearedRefTarget ? clearedRef : undefined}
          data-pocket-cleared
          tabIndex={-1}
          role="status"
          className="mt-2 text-center text-sm text-accent-fg"
        >
          Pocket cleared
        </p>
      )
    }
    return null
  }

  const statsButton = () => {
    if (!prefs || historyCount === 0) return null
    return (
      <Button
        variant="outline"
        fullWidth
        className="mt-2"
        aria-label={`Stats, ${historyCount} ${historyCount === 1 ? 'round' : 'rounds'}`}
        onClick={() => setStatsOpen(true)}
      >
        <PixelIcon name="chart" size={24} className="shrink-0 text-accent-fg" aria-hidden="true" />
        Stats
      </Button>
    )
  }

  return (
    <Layout
      aside={
        <div className="flex w-full min-w-0 flex-col items-center justify-center">
          {pocketControl(false)}
          {statsButton()}
          <nav className="mt-3 flex items-center justify-center gap-4 text-sm">
            <Link
              to="/language"
              className="inline-flex min-h-11 items-center px-3 text-accent-fg underline decoration-2 underline-offset-4"
            >
              {prefs ? 'Change language' : 'Language'}
            </Link>
            <span className="text-ink-faint">·</span>
            <Link
              to="/about"
              className="inline-flex min-h-11 items-center px-3 text-accent-fg underline decoration-2 underline-offset-4"
            >
              About
            </Link>
          </nav>
        </div>
      }
      columns="minmax(0, 1.25fr) minmax(0, 1fr)"
    >
      <TopBar
        left={<BrandLockup size="md" />}
        right={
          <div className="flex items-center gap-2">
            {prefs ? <StreakChip count={streak} freezes={freezes} /> : null}
            <OfflineChip />
            <span className="hidden short-land:inline-flex" data-home-offline-signal>
              <OfflineChip packReady={Boolean(prefs) && packCached} />
            </span>
          </div>
        }
      />

      <Card className="motion-onboarding-enter mb-4 overflow-hidden p-0 short-land:mb-0 short-land:col-start-1 short-land:row-start-2 short-land:self-center">
        <div className="px-stripe" aria-hidden="true" />
        <div className="p-5">
        <h1 className="text-pixel-display mb-2 text-ink">{dailyLabel}</h1>
        <p className="text-body mb-4 text-ink-muted">
          {prefs
            ? dailyDone
              ? 'Today’s daily is done. Come back after local midnight — or stretch with practice (practice does not affect your streak).'
              : selectedCefr === 'a1' || selectedCefr === 'a2'
                ? 'Guess today’s word with soft vowel help, six lives, and learner hints. Offline after the pack is cached.'
                : 'Guess today’s word with six lives and learner hints. Offline after the pack is cached.'
            : 'Pick a language and CEFR level, then play today’s word. Packs for your language stay cached for offline play.'}
        </p>
        {prefs ? (
          <Link
            to="/play?mode=daily"
            className="text-pixel-title px-frame px-drop motion-press inline-flex min-h-11 w-full items-center justify-center gap-2 bg-accent px-5 text-white hover:bg-accent-mid"
          >
            {dailyDone ? 'View today’s result' : 'Play today'}
            {!dailyDone ? (
              <span aria-hidden="true">▸</span>
            ) : null}
          </Link>
        ) : (
          <Link
            to="/language"
            className="text-pixel-title px-frame px-drop motion-press inline-flex min-h-11 w-full items-center justify-center gap-2 bg-accent px-5 text-white hover:bg-accent-mid"
          >
            Choose language
          </Link>
        )}
        {prefs ? (
          <>
            <Button
              fullWidth
              variant="secondary"
              className="mt-2"
              disabled={!practiceOk}
              onClick={() => nav(`/play?mode=practice&seed=${Date.now()}`)}
            >
              Practice
            </Button>
            {!practiceOk ? (
              <p className="mt-2 text-center text-xs text-ink-faint">
                Practice isn’t available — this pack only has today’s daily word.
              </p>
            ) : null}
            <div className="short-land:hidden">
              {pocketControl(true)}
              {statsButton()}
            </div>
            <StatsSheet
              lang={prefs.lang}
              cefr={prefs.cefr}
              open={statsOpen}
              onClose={() => setStatsOpen(false)}
            />
            <PocketSheet
              lang={prefs.lang}
              cefr={prefs.cefr}
              today={dateKey}
              open={pocketOpen}
              onClose={() => setPocketOpen(false)}
              onCount={(n) => {
                bumpPocket((tick) => tick + 1)
                if (
                  n === 0 &&
                  selectedLang &&
                  selectedCefr &&
                  listPocketStored(selectedLang, selectedCefr).length === 0
                ) {
                  setClearedSlot(pocketSlot(selectedLang, selectedCefr))
                }
              }}
              onRetry={(id) => nav(pocketRetryHref(id, Date.now()))}
            />
          </>
        ) : null}
        </div>
      </Card>

      <nav className="mb-6 flex items-center justify-center gap-4 text-sm short-land:hidden">
        <Link
          to="/language"
          className="inline-flex min-h-11 items-center px-3 text-accent-fg underline decoration-2 underline-offset-4"
        >
          {prefs ? 'Change language' : 'Language'}
        </Link>
        <span className="text-ink-faint">·</span>
        <Link
          to="/about"
          className="inline-flex min-h-11 items-center px-3 text-accent-fg underline decoration-2 underline-offset-4"
        >
          About
        </Link>
      </nav>

      {/* Quiet offline-ready trust signal — not loud Install (#103) */}
      <div className="flex justify-center short-land:hidden" data-home-offline-signal>
        <OfflineChip packReady={Boolean(prefs) && packCached} />
      </div>
    </Layout>
  )
}
