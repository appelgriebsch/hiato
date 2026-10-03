import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { BrandMark } from '@/components/brand/BrandMark'
import { Layout, TopBar } from '@/components/Layout'
import { OfflineChip } from '@/components/OfflineChip'
import { StreakChip } from '@/components/StreakChip'
import { Keyboard } from '@/components/play/Keyboard'
import { LearnerHint } from '@/components/play/LearnerHint'
import { LetterGrid } from '@/components/play/LetterGrid'
import { Lives } from '@/components/play/Lives'
import { PocketSheet } from '@/components/PocketSheet'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import {
  TOTAL_LIVES,
  applyGuess,
  buildInitialCells,
  correctKeysFromCells,
  graphemeKey,
  isDiacriticHintMiss,
  isDiacriticHintReady,
  isPracticeAvailable,
  isWon,
  lemmaIdentity,
  localDateKey,
  pickDailyLemma,
  pickPracticeLemma,
  revealOneDiacritic,
  revealAllCells,
  type CellState,
} from '@/engine'
import { getDailyRecord, setDailyRecord } from '@/lib/daily-record'
import {
  addToPocket,
  listPocketStored,
  pocketEntryId,
  removeFromPocket,
  repairPocket,
  POCKET_CAP,
} from '@/lib/pocket'
import {
  canPlayPocketEntry,
  findPocketEntryById,
  parsePocketEntryId,
  pocketOutcomeOnFinish,
} from '@/lib/pocket-play'
import {
  decideConfirmReCheck,
  needsReplaceOldestConfirm,
  pocketConfirmLabel,
  pocketRetryHref,
  shouldShowPocketSave,
} from '@/lib/pocket-save'
import { getPrefs } from '@/lib/prefs'
import { buildShareCardPayload } from '@/lib/share-card'
import { sharePathWithToken } from '@/lib/share-url'
import {
  ensureStreakPersisted,
  getStreakCount,
  recordDailyWin,
} from '@/lib/streaks'
import { CEFR_CODES, LANG_CODES, speakLemmaAriaLabel } from '@/packs/labels'
import { primeSpeechVoices, speakLemma, subscribeSpeakActivity, subscribeSpeechAvailability, unlockSpeechGesture } from '@/lib/speech'
import { loadPack } from '@/packs/load'
import type { PackCefr, PackLang, PackLemma } from '@/packs/schema'

type PlayMode = 'daily' | 'practice' | 'pocket'

function parseMode(raw: string | null): PlayMode {
  if (raw === 'practice') return 'practice'
  if (raw === 'pocket') return 'pocket'
  return 'daily'
}

function parseSeed(raw: string | null): number {
  if (raw == null || raw === '') return 0
  const n = Number(raw)
  return Number.isFinite(n) ? n : 0
}

function modeBadgeLabel(mode: PlayMode): string {
  if (mode === 'daily') return 'Daily'
  if (mode === 'pocket') return 'Pocket'
  return 'Practice'
}

export function Play() {
  const nav = useNavigate()
  const [params] = useSearchParams()
  const mode = parseMode(params.get('mode'))
  const practiceSeed = parseSeed(params.get('seed'))
  const pocketParamId = parsePocketEntryId(params.get('id'))
  const prefs = getPrefs()
  const lang = prefs?.lang
  const cefr = prefs?.cefr

  useEffect(() => {
    if (!lang || !cefr) {
      nav('/language', { replace: true })
    }
  }, [lang, cefr, nav])

  if (!lang || !cefr) return null

  // Remount the round subtree on identity change — StrictMode-safe, no
  // setState-during-render, no stale EndCard flash (#103 / Avery).
  const roundId = `${mode}|${practiceSeed}|${pocketParamId ?? ''}|${lang}|${cefr}`
  return (
    <PlayRound
      key={roundId}
      mode={mode}
      practiceSeed={practiceSeed}
      pocketParamId={pocketParamId}
      lang={lang}
      cefr={cefr}
    />
  )
}

function PlayRound({
  mode,
  practiceSeed,
  pocketParamId,
  lang,
  cefr,
}: {
  mode: PlayMode
  practiceSeed: number
  pocketParamId: string | null
  lang: PackLang
  cefr: PackCefr
}) {
  const nav = useNavigate()
  // Freeze local date for this remounted round (midnight cannot reseed).
  const [dateKey] = useState(() => localDateKey())

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [wordEntry, setWordEntry] = useState<PackLemma | null>(null)
  const [cells, setCells] = useState<CellState[]>([])
  const [lives, setLives] = useState(TOTAL_LIVES)
  const [misses, setMisses] = useState(0)
  const [usedWrong, setUsedWrong] = useState<Set<string>>(() => new Set())
  const [usedCorrect, setUsedCorrect] = useState<Set<string>>(() => new Set())
  const [hintUsed, setHintUsed] = useState(false)
  const [finished, setFinished] = useState<'win' | 'lose' | null>(null)
  /** Practice Reveal lose — EndCard says "Word revealed", not "Out of lives". */
  const [revealedWord, setRevealedWord] = useState(false)
  const [alreadyPlayed, setAlreadyPlayed] = useState(false)
  const [streak, setStreak] = useState(0)
  const [practiceOk, setPracticeOk] = useState(true)
  const [shakeKey, setShakeKey] = useState<string | null>(null)
  const [streakPulse, setStreakPulse] = useState(false)
  const [activePocketId, setActivePocketId] = useState<string | null>(null)
  const streakShown = useRef(0)
  const shakeTimer = useRef(0)
  /** Latched after unlockSpeechGesture returns true (prime succeeded). */
  const speechGestureRef = useRef(false)

  // Daily + practice only. Prime on mount (getVoices + voiceschanged) and
  // again on an earlier play gesture (card/reveal taps) — never unlock
  // speak on the EndCard speak control. Unlock is prime-only (no platform
  // speak). That button's own click is speakLemma only. Pocket never
  // speaks. No timer and no promise before speak().
  useEffect(() => {
    if (mode === 'pocket') return
    primeSpeechVoices()
    const onPointerDown = (event: PointerEvent) => {
      if (speechGestureRef.current) return
      const raw = event.target
      const el =
        raw instanceof Element
          ? raw
          : raw instanceof Node
            ? raw.parentElement
            : null
      // First tap on daily already-played is often the speak button itself.
      // Skip unlock/latch there — EndCard click is speakLemma only.
      if (el?.closest('[data-endcard-speak]')) {
        primeSpeechVoices()
        return
      }
      // Latch only when prime unlock succeeds (synth present). Failed
      // unlock leaves the ref false so a later tap retries.
      if (unlockSpeechGesture()) {
        speechGestureRef.current = true
      }
      primeSpeechVoices()
    }
    document.addEventListener('pointerdown', onPointerDown, true)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true)
    }
  }, [mode])

  const roundRef = useRef({
    cells,
    lives,
    misses,
    usedWrong,
    usedCorrect,
    hintUsed,
    finished,
    wordEntry,
    loading,
    alreadyPlayed,
  })
  roundRef.current = {
    cells,
    lives,
    misses,
    usedWrong,
    usedCorrect,
    hintUsed,
    finished,
    wordEntry,
    loading,
    alreadyPlayed,
  }

  useEffect(() => {
    ensureStreakPersisted(lang, cefr, dateKey)
    setStreak(getStreakCount(lang, cefr, dateKey))
  }, [lang, cefr, dateKey])

  useEffect(() => {
    if (streak > streakShown.current) {
      setStreakPulse(true)
      const t = window.setTimeout(() => setStreakPulse(false), 280)
      streakShown.current = streak
      return () => clearTimeout(t)
    }
    streakShown.current = streak
  }, [streak])

  const persistDaily = useCallback(
    (result: 'win' | 'lose', entry: PackLemma) => {
      if (!lang || !cefr) return
      if (result === 'win') {
        const next = recordDailyWin(lang, cefr, dateKey)
        setStreak(next.count)
      } else {
        setStreak(getStreakCount(lang, cefr, dateKey))
      }
      setDailyRecord({
        dateKey,
        lang,
        cefr,
        word: entry.word,
        gloss: entry.gloss,
        won: result === 'win',
        completed: true,
      })
    },
    [lang, cefr, dateKey],
  )

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    setFinished(null)
    setAlreadyPlayed(false)
    setActivePocketId(null)

    void loadPack(lang, cefr)
      .then((pack) => {
        if (cancelled) return

        setPracticeOk(isPracticeAvailable(pack.lemmas, dateKey, lang, cefr))

        if (mode === 'daily') {
          const rec = getDailyRecord(lang, cefr)
          if (rec && rec.dateKey === dateKey && rec.completed) {
            setAlreadyPlayed(true)
            setWordEntry({
              word: rec.word,
              gloss: rec.gloss,
            })
            setFinished(rec.won ? 'win' : 'lose')
            setLoading(false)
            return
          }
          const entry = pickDailyLemma(pack.lemmas, dateKey, lang, cefr)
          const initial = buildInitialCells(entry.word, cefr)
          setWordEntry(entry)
          setCells(initial)
          setUsedCorrect(correctKeysFromCells(initial))
          setUsedWrong(new Set())
          setLives(TOTAL_LIVES)
          setMisses(0)
          setHintUsed(false)
          // A1/A2 vowel-prefill can already reveal the whole word (W3).
          if (isWon(initial)) {
            setFinished('win')
            persistDaily('win', entry)
          } else {
            setFinished(null)
          }
          setLoading(false)
          return
        }

        if (mode === 'pocket') {
          repairPocket()
          if (!pocketParamId) {
            setWordEntry(null)
            setError('This pocket link isn’t valid.')
            setLoading(false)
            return
          }
          const slot = listPocketStored(lang, cefr)
          const pocketEntry = findPocketEntryById(slot, pocketParamId)
          if (!pocketEntry) {
            setWordEntry(null)
            setError('That pocket word is gone.')
            setLoading(false)
            return
          }
          const daily = pickDailyLemma(pack.lemmas, dateKey, lang, cefr)
          const rec = getDailyRecord(lang, cefr)
          const dailyCompleted =
            rec && rec.dateKey === dateKey && rec.completed
              ? { won: rec.won, word: rec.word }
              : null
          if (
            !canPlayPocketEntry(pocketEntry.word, {
              dateKey,
              dailyWord: daily.word,
              dailyCompleted,
            })
          ) {
            setWordEntry(null)
            const wonTodayDaily =
              Boolean(dailyCompleted?.won) &&
              lemmaIdentity(pocketEntry.word) === lemmaIdentity(daily.word)
            setError(
              wonTodayDaily
                ? 'Today’s daily is already won — pocket retry waits until tomorrow.'
                : 'Today’s daily isn’t ready for pocket retry — finish or miss it first.',
            )
            setLoading(false)
            return
          }
          const entry: PackLemma = {
            word: pocketEntry.word,
            gloss: pocketEntry.gloss,
          }
          const initial = buildInitialCells(entry.word, cefr)
          setActivePocketId(pocketEntry.id)
          setWordEntry(entry)
          setCells(initial)
          setUsedCorrect(correctKeysFromCells(initial))
          setUsedWrong(new Set())
          setLives(TOTAL_LIVES)
          setMisses(0)
          setHintUsed(false)
          // Prefill win still clears pocket — never recordDailyWin.
          if (isWon(initial)) {
            setFinished('win')
            if (pocketOutcomeOnFinish(true) === 'remove') {
              removeFromPocket(pocketEntry.id)
            }
          } else {
            setFinished(null)
          }
          setLoading(false)
          return
        }

        const entry = pickPracticeLemma(
          pack.lemmas,
          dateKey,
          lang,
          cefr,
          practiceSeed,
        )
        if (!entry) {
          setWordEntry(null)
          setError(null)
          setLoading(false)
          return
        }
        const initial = buildInitialCells(entry.word, cefr)
        setWordEntry(entry)
        setCells(initial)
        setUsedCorrect(correctKeysFromCells(initial))
        setUsedWrong(new Set())
        setLives(TOTAL_LIVES)
        setMisses(0)
        setHintUsed(false)
        setFinished(isWon(initial) ? 'win' : null)
        setLoading(false)
      })
      .catch((e: unknown) => {
        if (cancelled) return
        setError(e instanceof Error ? e.message : 'Failed to load pack')
        setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [dateKey, lang, cefr, mode, practiceSeed, pocketParamId, persistDaily])

  const showHint = useMemo(() => {
    if (!wordEntry) return false
    return isDiacriticHintReady(cells, wordEntry.word, misses, {
      hintUsed,
      finished: Boolean(finished),
    })
  }, [misses, cells, wordEntry, hintUsed, finished])

  const endGame = useCallback(
    (result: 'win' | 'lose', entry: PackLemma) => {
      setFinished(result)
      if (mode === 'daily') persistDaily(result, entry)
      // Pocket: win removes; lose keeps. Never streaks / Clerk / D1.
      if (
        mode === 'pocket' &&
        activePocketId &&
        pocketOutcomeOnFinish(result === 'win') === 'remove'
      ) {
        removeFromPocket(activePocketId)
        setActivePocketId(null)
      }
    },
    [mode, persistDaily, activePocketId],
  )

  function onKey(letter: string) {
    const r = roundRef.current
    if (!r.wordEntry || r.finished || r.loading || r.alreadyPlayed) return
    const k = graphemeKey(letter)
    if (r.usedWrong.has(k) || r.usedCorrect.has(k)) return

    const { cells: next, hit } = applyGuess(r.cells, r.wordEntry.word, letter)
    if (hit) {
      const usedCorrect = new Set(r.usedCorrect).add(k)
      const won = isWon(next)
      roundRef.current = {
        ...r,
        cells: next,
        usedCorrect,
        finished: won ? 'win' : r.finished,
      }
      setCells(next)
      setUsedCorrect(usedCorrect)
      if (won) endGame('win', r.wordEntry)
    } else {
      const usedWrong = new Set(r.usedWrong).add(k)
      const misses =
        r.misses +
        (isDiacriticHintMiss(r.cells, r.wordEntry.word, letter) ? 1 : 0)
      const lives = r.lives - 1
      const lost = lives <= 0
      roundRef.current = {
        ...r,
        usedWrong,
        misses,
        lives,
        finished: lost ? 'lose' : r.finished,
      }
      setUsedWrong(usedWrong)
      if (misses !== r.misses) setMisses(misses)
      setLives(lives)
      window.clearTimeout(shakeTimer.current)
      setShakeKey(k)
      shakeTimer.current = window.setTimeout(() => setShakeKey(null), 240)
      if (lost) endGame('lose', r.wordEntry)
    }
  }

  function onHint() {
    const r = roundRef.current
    if (!r.wordEntry || r.hintUsed || r.finished) return
    if (
      !isDiacriticHintReady(r.cells, r.wordEntry.word, r.misses, {
        hintUsed: r.hintUsed,
        finished: Boolean(r.finished),
      })
    ) {
      return
    }
    const next = revealOneDiacritic(r.cells, r.wordEntry.word)
    const usedCorrect = correctKeysFromCells(next)
    const won = isWon(next)
    roundRef.current = {
      ...r,
      cells: next,
      hintUsed: true,
      usedCorrect,
      finished: won ? 'win' : r.finished,
    }
    setCells(next)
    setHintUsed(true)
    setUsedCorrect(usedCorrect)
    if (won) endGame('win', r.wordEntry)
  }

  /** Practice give-up: shame-free tertiary Reveal (#103). */
  function onReveal() {
    const r = roundRef.current
    if (!r.wordEntry || r.finished || r.loading || mode !== 'practice') return
    const next = revealAllCells(r.wordEntry.word)
    const usedCorrect = correctKeysFromCells(next)
    roundRef.current = {
      ...r,
      cells: next,
      usedCorrect,
      finished: 'lose',
    }
    setCells(next)
    setUsedCorrect(usedCorrect)
    setRevealedWord(true)
    endGame('lose', r.wordEntry)
  }

  function goPractice() {
    if (!practiceOk) return
    nav(`/play?mode=practice&seed=${Date.now()}`)
  }

  const vowelHelp = cefr === 'a1' || cefr === 'a2'

  if (!loading && !error && mode === 'practice' && !wordEntry) {
    return (
      <Layout>
        <TopBar
          left={
            <div className="flex items-center gap-2">
              <BrandMark size="sm" className="opacity-90" />
              <OfflineChip />
            </div>
          }
          center={<Badge>Practice</Badge>}
          right={<StreakChip count={streak} pulse={streakPulse} />}
        />
        <div className="motion-result-enter flex flex-1 flex-col items-center justify-center gap-4 text-center">
          <h1 className="text-title text-ink">Practice unavailable</h1>
          <p className="max-w-xs text-sm text-ink-muted">
            This pack only has today’s daily word, so endless practice would
            spoil it.
          </p>
          <div className="mt-2 flex w-full flex-col gap-2">
            <Button fullWidth onClick={() => nav('/play?mode=daily')}>
              Back to daily
            </Button>
            <Button fullWidth variant="ghost" onClick={() => nav('/')}>
              Back home
            </Button>
          </div>
        </div>
      </Layout>
    )
  }

  if (alreadyPlayed && !loading && mode === 'daily') {
    const rec = getDailyRecord(lang, cefr)
    return (
      <Layout>
        <TopBar
          left={
            <div className="flex items-center gap-2">
              <BrandMark size="sm" className="opacity-90" />
              <OfflineChip />
            </div>
          }
          center={<Badge tone="accent">Daily</Badge>}
          right={<StreakChip count={streak} pulse={streakPulse} />}
        />
        <div className="motion-result-enter flex flex-1 flex-col items-center justify-center gap-4 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-accent-soft text-2xl text-accent-fg">
            ✓
          </div>
          <h1 className="text-title text-ink">Today’s daily is done</h1>
          <p className="text-body max-w-xs text-ink-muted">
            Come back tomorrow for a new word — or stretch with practice.
            Practice does not affect your streak.
          </p>
          {rec && (
            <p className="text-sm text-ink">
              You {rec.won ? 'solved' : 'missed'} today’s puzzle
              {rec.word ? (
                <>
                  :{' '}
                  <span className="font-semibold tracking-wide">{rec.word}</span>
                </>
              ) : null}
              .
            </p>
          )}
          <Card className="w-full text-left">
            <div className="flex items-center justify-between text-sm">
              <span className="text-ink-muted">
                {LANG_CODES[lang]} · {CEFR_CODES[cefr]}
              </span>
              <StreakChip count={streak} />
            </div>
            {rec?.won ? (
              <p className="mt-2 text-xs text-accent-fg">
                Streak updated for {dateKey}
              </p>
            ) : (
              <p className="mt-2 text-xs text-ink-faint">
                Streak pauses — try again tomorrow
              </p>
            )}
          </Card>
          <div className="mt-2 flex w-full flex-col gap-2">
            {rec ? (
              <Button
                fullWidth
                onClick={() => {
                  try {
                    const sharePayload = buildShareCardPayload({
                      lang,
                      cefr,
                      streak,
                      dateKey,
                      word: rec.word,
                      won: rec.won,
                      mode: 'daily',
                    })
                    nav(sharePathWithToken(sharePayload), {
                      state: sharePayload,
                    })
                  } catch {
                    /* invalid payload — soft-fail; don’t blow onClick */
                  }
                }}
              >
                Share
              </Button>
            ) : null}
            <Button
              fullWidth
              variant={rec ? 'secondary' : 'primary'}
              onClick={goPractice}
              disabled={!practiceOk}
            >
              Practice (endless)
            </Button>
            {!practiceOk ? (
              <p className="text-xs text-ink-faint">
                Practice isn’t available — this pack only has today’s daily word.
              </p>
            ) : null}
            <Button fullWidth variant="ghost" onClick={() => nav('/')}>
              Back home
            </Button>
            <Button
              fullWidth
              variant="ghost"
              onClick={() => nav('/language')}
            >
              Change level
            </Button>
          </div>
        </div>
      </Layout>
    )
  }

  return (
    <Layout>
      <TopBar
        left={
          <div className="flex items-center gap-2">
            <BrandMark size="sm" className="opacity-90" />
            <OfflineChip />
          </div>
        }
        center={
          mode === 'daily' ? (
            <Badge tone="accent">Daily</Badge>
          ) : (
            <Badge>{modeBadgeLabel(mode)}</Badge>
          )
        }
        right={<StreakChip count={streak} pulse={streakPulse} />}
      />

      <div className="mb-3 flex items-center justify-between">
        <Lives remaining={lives} total={TOTAL_LIVES} />
        <span className="text-caption tracking-wide">
          {LANG_CODES[lang]} · {CEFR_CODES[cefr]}
        </span>
      </div>

      {loading && (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 py-16">
          <div className="h-8 w-8 animate-spin motion-reduce:animate-none rounded-full border-2 border-line border-t-accent" />
          <p className="text-sm text-ink-muted">
            {mode === 'daily'
              ? 'Loading today’s word…'
              : mode === 'pocket'
                ? 'Loading pocket word…'
                : 'Loading a practice word…'}
          </p>
        </div>
      )}

      {error && !loading && (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 py-12 text-center">
          <p className="text-sm text-danger">{error}</p>
          <Button
            fullWidth
            variant={mode === 'pocket' ? undefined : 'secondary'}
            onClick={() => nav('/')}
          >
            Back home
          </Button>
          {mode !== 'pocket' ? (
            <Button variant="ghost" onClick={() => window.location.reload()}>
              Retry
            </Button>
          ) : null}
        </div>
      )}

      {!loading && !error && wordEntry && (
        <>
          <div className="my-5">
            <LetterGrid cells={cells} />
            {vowelHelp && cells.some((c) => c.helped && c.revealed) && (
              <p className="mt-3 text-center text-[11px] text-ink-muted">
                Soft green = vowel help (A1–A2)
              </p>
            )}
            {!finished && (
              <LearnerHint entry={wordEntry} lang={lang} />
            )}
          </div>

          {showHint && (
            <div className="motion-onboarding-enter mb-4">
              <Button fullWidth variant="secondary" onClick={onHint}>
                Hint — reveal one accent
              </Button>
              <p className="text-caption mt-1.5 text-center">
                Optional. After 2 accent or base-letter misses while a diacritic remains.
              </p>
            </div>
          )}

          {finished ? (
            <EndCard
              won={finished === 'win'}
              revealed={revealedWord}
              mode={mode}
              word={wordEntry.word}
              gloss={wordEntry.gloss}
              synonyms={wordEntry.synonyms}
              lang={lang}
              cefr={cefr}
              dateKey={dateKey}
              streak={streak}
              streakPulse={streakPulse}
              practiceOk={practiceOk}
              onPractice={goPractice}
              pocketId={activePocketId}
              onPocketCleared={() => setActivePocketId(null)}
            />
          ) : (
            <>
              {mode === 'practice' ? (
                <div className="mb-3 flex justify-center">
                  <button
                    type="button"
                    data-reveal-word
                    aria-label="Reveal word and end this practice round"
                    onClick={onReveal}
                    className="motion-press min-h-11 px-3 text-sm font-medium text-ink-muted underline-offset-2 hover:underline focus-visible:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-fg/40 rounded-sm"
                  >
                    Reveal word
                  </button>
                </div>
              ) : null}
              <Keyboard
                lang={lang}
                usedWrong={usedWrong}
                usedCorrect={usedCorrect}
                disabled={false}
                onKey={onKey}
                shakeKey={shakeKey}
              />
            </>
          )}

          {!finished && mode === 'daily' && (
            <div className="mt-6 text-center">
              {practiceOk ? (
                <button
                  type="button"
                  onClick={goPractice}
                  className="text-sm font-medium text-accent-fg underline-offset-2 hover:underline"
                >
                  Practice (endless)
                </button>
              ) : (
                <p className="text-xs text-ink-faint">
                  Practice isn’t available for this pack.
                </p>
              )}
            </div>
          )}
          {!finished && mode === 'practice' && (
            <div className="mt-6 flex justify-center gap-4 text-sm">
              <Link
                to="/play?mode=daily"
                className="font-medium text-ink-muted hover:text-ink"
              >
                ← Daily
              </Link>
              {practiceOk ? (
                <button
                  type="button"
                  onClick={goPractice}
                  className="font-medium text-accent-fg hover:underline"
                >
                  Next word
                </button>
              ) : null}
            </div>
          )}
          {!finished && mode === 'pocket' && (
            <div className="mt-6 text-center">
              <Link
                to="/"
                className="text-sm font-medium text-ink-muted hover:text-ink"
              >
                ← Home
              </Link>
            </div>
          )}
        </>
      )}
    </Layout>
  )
}

function EndCard({
  won,
  revealed = false,
  mode,
  word,
  gloss,
  synonyms,
  lang,
  cefr,
  dateKey,
  streak,
  streakPulse,
  practiceOk,
  onPractice,
  pocketId,
  onPocketCleared,
}: {
  won: boolean
  /** Practice Reveal — badge "Word revealed" instead of "Out of lives". */
  revealed?: boolean
  mode: PlayMode
  word: string
  gloss?: string
  synonyms?: string[]
  lang: PackLang
  cefr: PackCefr
  dateKey: string
  streak: number
  streakPulse: boolean
  practiceOk: boolean
  onPractice: () => void
  pocketId: string | null
  onPocketCleared: () => void
}) {
  const nav = useNavigate()
  const showSave = shouldShowPocketSave(mode, won)
  const [savePhase, setSavePhase] = useState<
    'idle' | 'confirm' | 'saved' | 'duplicate'
  >('idle')
  const [oldestLabel, setOldestLabel] = useState('')
  const [snapshotOldestId, setSnapshotOldestId] = useState('')
  const [pocketRemoved, setPocketRemoved] = useState(false)
  const [pocketCount, setPocketCount] = useState(0)
  const [pocketOpen, setPocketOpen] = useState(false)
  const [pocketCleared, setPocketCleared] = useState(false)
  const confirmBtnRef = useRef<HTMLButtonElement>(null)
  const saveBtnRef = useRef<HTMLButtonElement>(null)
  const clearedStatusRef = useRef<HTMLParagraphElement>(null)
  const speakBtnRef = useRef<HTMLButtonElement>(null)
  const confirmHeadingId = 'pocket-replace-confirm-heading'

  const commitSave = useCallback(() => {
    // Pocket only — never touches streaks, Clerk, or D1.
    const result = addToPocket({ lang, cefr, word, gloss })
    setPocketCount(listPocketStored(lang, cefr).length)
    // Quota / private mode: nothing was stored. Stay on the current phase
    // so a replace confirm keeps its gloss and Confirm can retry.
    if (!result.added && !result.duplicate) return false
    setSavePhase(result.duplicate ? 'duplicate' : 'saved')
    return true
  }, [lang, cefr, word, gloss])

  const cancelConfirm = useCallback(() => {
    setSavePhase('idle')
    setOldestLabel('')
    setSnapshotOldestId('')
  }, [])

  const onSavePress = useCallback(() => {
    const slot = listPocketStored(lang, cefr)
    const id = pocketEntryId(lang, cefr, word)
    const already = slot.some((e) => e.id === id)
    if (needsReplaceOldestConfirm(slot.length, already)) {
      const oldest = slot[0]!
      setOldestLabel(pocketConfirmLabel(oldest))
      setSnapshotOldestId(oldest.id)
      setSavePhase('confirm')
      return
    }
    commitSave()
  }, [lang, cefr, word, commitSave])

  const onConfirmReplace = useCallback(() => {
    const slot = listPocketStored(lang, cefr)
    const id = pocketEntryId(lang, cefr, word)
    const decision = decideConfirmReCheck(snapshotOldestId, slot, id)
    if (decision === 'duplicate') {
      setPocketCount(listPocketStored(lang, cefr).length)
      setSavePhase('duplicate')
      setOldestLabel('')
      setSnapshotOldestId('')
      return
    }
    if (decision === 'refresh') {
      const oldest = slot[0]!
      setOldestLabel(pocketConfirmLabel(oldest))
      setSnapshotOldestId(oldest.id)
      // stay in confirm so the user sees the refreshed gloss-only label
      return
    }
    // commit — either still replace-oldest or slot no longer full.
    // A failed write stays on confirm with the same gloss so Confirm retries it.
    const stored = commitSave()
    if (!stored) return
    setOldestLabel('')
    setSnapshotOldestId('')
  }, [lang, cefr, word, snapshotOldestId, commitSave])

  const onManualRemove = useCallback(() => {
    if (!pocketId) return
    removeFromPocket(pocketId)
    setPocketRemoved(true)
    onPocketCleared()
  }, [pocketId, onPocketCleared])

  const prevSavePhase = useRef(savePhase)

  // W2: focus Confirm on enter; restore Save (or blur) on leave
  useEffect(() => {
    const prev = prevSavePhase.current
    prevSavePhase.current = savePhase
    if (savePhase === 'confirm') {
      confirmBtnRef.current?.focus()
      return
    }
    if (prev !== 'confirm') return
    // Left confirm via Cancel → Save remounts; via commit → status replaces Save
    if (savePhase === 'idle' && saveBtnRef.current) {
      saveBtnRef.current.focus()
    } else {
      ;(document.activeElement as HTMLElement | null)?.blur?.()
    }
  }, [savePhase])

  // W2: Escape cancels confirm (same as Cancel)
  useEffect(() => {
    if (savePhase !== 'confirm') return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        cancelConfirm()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [savePhase, cancelConfirm])

  useLayoutEffect(() => {
    if (!pocketCleared) return
    clearedStatusRef.current?.focus()
  }, [pocketCleared])

  const confirming = showSave && savePhase === 'confirm'
  const showViewPocket =
    mode !== 'pocket' &&
    showSave &&
    (savePhase === 'saved' || savePhase === 'duplicate') &&
    pocketCount > 0
  const shareMode = mode === 'practice' || mode === 'pocket' ? 'practice' : 'daily'
  const endBadge =
    mode === 'daily' ? ' · Daily' : mode === 'pocket' ? ' · Pocket' : ' · Practice'
  // ADR 0035 / #94: gloss is teach headline; lemma secondary; silent omit when empty
  const teachGloss = gloss?.trim() ?? ''
  const teachSynonyms = (synonyms ?? [])
    .filter((s) => s.trim().length > 0)
    .slice(0, 3)

  // ADR 0037 / #113: EndCard tap-to-speak on daily + practice only (not pocket).
  const speakSurface = mode === 'daily' || mode === 'practice'
  const [speechOk, setSpeechOk] = useState(false)
  const [speaking, setSpeaking] = useState(false)
  useEffect(() => {
    if (!speakSurface) {
      setSpeechOk(false)
      return
    }
    // Mount prime only. voiceschanged / the poll may show the control later.
    // Do not speak here — iOS drops speak() outside a user gesture.
    primeSpeechVoices()
    return subscribeSpeechAvailability(lang, setSpeechOk)
  }, [speakSurface, lang])
  useEffect(() => subscribeSpeakActivity(setSpeaking), [])
  const showSpeakControl = speakSurface && speechOk
  // iOS Safari only treats speak() as user-activated inside the button's
  // own listener. React onClick is delegated at the root, so this tap
  // stays silent there. One listener — do not also set onClick.
  useEffect(() => {
    const btn = speakBtnRef.current
    if (!btn) return
    const onClick = () => {
      void speakLemma(word, lang)
    }
    btn.addEventListener('click', onClick)
    return () => {
      btn.removeEventListener('click', onClick)
    }
  }, [showSpeakControl, word, lang])

  return (
    <div className="motion-result-enter mb-4 space-y-3">
      <div
        className="rounded-xl border border-line bg-raised/80 px-4 py-4 text-center"
        data-endcard-teach
      >
        <Badge tone={won ? 'accent' : 'warm'} pulse={won}>
          {won ? 'You got it' : revealed ? 'Word revealed' : 'Out of lives'}
          {endBadge}
        </Badge>
        {teachGloss ? (
          <p className="mt-3 text-lg font-semibold leading-snug text-ink">
            {teachGloss}
          </p>
        ) : null}
        <p
          className={[
            'text-sm text-ink-muted',
            teachGloss ? 'mt-2' : 'mt-3',
          ].join(' ')}
        >
          The word was
        </p>
        <div className="flex items-center justify-center gap-1">
          <p
            className={[
              'tracking-wide text-ink',
              teachGloss
                ? 'mt-0.5 text-base font-medium'
                : 'mt-1 text-lg font-semibold',
            ].join(' ')}
          >
            {word}
          </p>
          {showSpeakControl ? (
            <button
              ref={speakBtnRef}
              type="button"
              data-endcard-speak
              data-speaking={speaking ? 'true' : 'false'}
              aria-label={speakLemmaAriaLabel(lang)}
              aria-busy={speaking}
              className={[
                'motion-press inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-xl hover:bg-cream-dark active:bg-cream-dark focus-visible:outline-none focus-visible:bg-accent-soft focus-visible:ring-2 focus-visible:ring-accent-fg',
                speaking ? 'text-accent-fg' : 'text-ink-muted',
                teachGloss ? 'mt-0.5' : 'mt-1',
              ].join(' ')}
            >
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
                <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
              </svg>
            </button>
          ) : null}
        </div>
        {teachSynonyms.length > 0 ? (
          <div className="mt-2.5 flex flex-wrap justify-center gap-1.5">
            {teachSynonyms.map((s) => (
              <span
                key={s}
                className="inline-flex items-center rounded-full bg-cream-dark/90 px-2.5 py-1 text-[11px] font-medium text-ink"
              >
                {s}
              </span>
            ))}
          </div>
        ) : null}
      </div>

      <Card className="w-full text-left">
        <div className="flex items-center justify-between text-sm">
          <span className="text-ink-muted">
            {LANG_CODES[lang]} · {CEFR_CODES[cefr]}
          </span>
          <StreakChip count={streak} pulse={streakPulse} />
        </div>
        {mode === 'daily' && won && (
          <p className="mt-2 text-xs text-accent-fg">Streak updated for {dateKey}</p>
        )}
        {mode === 'daily' && !won && (
          <p className="mt-2 text-xs text-ink-faint">
            Streak pauses — try again tomorrow
          </p>
        )}
        {mode === 'practice' && (
          <p className="mt-2 text-xs text-ink-faint">
            Practice doesn’t affect your streak
          </p>
        )}
        {mode === 'pocket' && (
          <p className="mt-2 text-xs text-ink-faint">
            Pocket doesn’t affect your streak
            {won || pocketRemoved ? ' · cleared from pocket' : ''}
          </p>
        )}
      </Card>

      {confirming ? (
        <Card
          className="w-full text-left"
          role="dialog"
          aria-modal="true"
          aria-labelledby={confirmHeadingId}
        >
          <p
            id={confirmHeadingId}
            className="text-sm font-medium text-ink"
          >
            Replace oldest word?
          </p>
          <p className="mt-1 text-xs leading-relaxed text-ink-muted">
            Pocket is full ({POCKET_CAP}). “{oldestLabel}” will be removed so you can save
            this one.
          </p>
          <div className="mt-3 flex flex-col gap-2">
            <Button ref={confirmBtnRef} fullWidth onClick={onConfirmReplace}>
              Confirm replace
            </Button>
            <Button fullWidth variant="ghost" onClick={cancelConfirm}>
              Cancel
            </Button>
          </div>
        </Card>
      ) : (
        <div className="flex flex-col gap-2">
          {showSave ? (
            savePhase === 'saved' || savePhase === 'duplicate' ? (
              <>
                <p
                  ref={clearedStatusRef}
                  tabIndex={pocketCleared ? -1 : undefined}
                  className="text-center text-sm text-accent-fg"
                  role="status"
                >
                  {pocketCleared
                    ? 'Pocket cleared'
                    : savePhase === 'duplicate'
                      ? 'Already in pocket'
                      : 'Saved to pocket'}
                </p>
                {showViewPocket ? (
                  <Button
                    fullWidth
                    variant="ghost"
                    onClick={() => setPocketOpen(true)}
                  >
                    View pocket
                  </Button>
                ) : null}
              </>
            ) : (
              <Button
                ref={saveBtnRef}
                fullWidth
                variant="secondary"
                onClick={onSavePress}
              >
                Save to pocket
              </Button>
            )
          ) : null}
          {mode === 'pocket' && !won && pocketId && !pocketRemoved ? (
            <Button
              fullWidth
              onClick={() =>
                nav(
                  `/play?mode=pocket&id=${encodeURIComponent(pocketId)}&seed=${Date.now()}`,
                )
              }
            >
              Retry
            </Button>
          ) : null}
          <Button
            fullWidth
            variant={mode === 'pocket' && !won ? 'secondary' : undefined}
            onClick={() => {
              try {
                const sharePayload = buildShareCardPayload({
                  lang,
                  cefr,
                  streak,
                  dateKey,
                  word,
                  won,
                  mode: shareMode,
                })
                nav(sharePathWithToken(sharePayload), {
                  state: sharePayload,
                })
              } catch {
                /* invalid payload — soft-fail; don’t blow onClick */
              }
            }}
          >
            Share
          </Button>
          {mode === 'pocket' && !won && pocketId && !pocketRemoved ? (
            <Button fullWidth variant="outline" onClick={onManualRemove}>
              Remove from pocket
            </Button>
          ) : null}
          {mode === 'pocket' && pocketRemoved ? (
            <p className="text-center text-sm text-accent-fg" role="status">
              Removed from pocket
            </p>
          ) : null}
          {mode !== 'pocket' ? (
            <Button
              fullWidth
              variant="secondary"
              onClick={onPractice}
              disabled={!practiceOk}
            >
              {mode === 'practice' ? 'Next word' : 'Practice (endless)'}
            </Button>
          ) : null}
          {mode !== 'pocket' && !practiceOk ? (
            <p className="text-center text-xs text-ink-faint">
              Practice isn’t available — this pack only has today’s daily word.
            </p>
          ) : null}
          {mode === 'practice' ? (
            <Button
              fullWidth
              variant="outline"
              onClick={() => nav('/play?mode=daily')}
            >
              Back to daily
            </Button>
          ) : null}
          <Button fullWidth variant="ghost" onClick={() => nav('/')}>
            Back home
          </Button>
        </div>
      )}
      {mode !== 'pocket' &&
      showSave &&
      (savePhase === 'saved' || savePhase === 'duplicate') ? (
        <PocketSheet
          lang={lang}
          cefr={cefr}
          open={pocketOpen}
          onClose={() => setPocketOpen(false)}
          onCount={(n) => {
            setPocketCount(n)
            if (n === 0) setPocketCleared(true)
          }}
          onRetry={(id) => nav(pocketRetryHref(id, Date.now()))}
        />
      ) : null}
    </div>
  )
}
