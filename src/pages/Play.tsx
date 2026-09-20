import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { Layout, TopBar } from '@/components/Layout'
import { OfflineChip } from '@/components/OfflineChip'
import { StreakChip } from '@/components/StreakChip'
import { Keyboard } from '@/components/play/Keyboard'
import { LearnerHint } from '@/components/play/LearnerHint'
import { LetterGrid } from '@/components/play/LetterGrid'
import { Lives } from '@/components/play/Lives'
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
  localDateKey,
  pickDailyLemma,
  pickPracticeLemma,
  revealOneDiacritic,
  type CellState,
} from '@/engine'
import { getDailyRecord, setDailyRecord } from '@/lib/daily-record'
import { getPrefs } from '@/lib/prefs'
import { buildShareCardPayload } from '@/lib/share-card'
import {
  ensureStreakPersisted,
  getStreakCount,
  recordDailyWin,
} from '@/lib/streaks'
import { CEFR_CODES, LANG_CODES } from '@/packs/labels'
import { loadPack } from '@/packs/load'
import type { PackCefr, PackLang, PackLemma } from '@/packs/schema'

type PlayMode = 'daily' | 'practice'

function parseMode(raw: string | null): PlayMode {
  return raw === 'practice' ? 'practice' : 'daily'
}

function parseSeed(raw: string | null): number {
  if (raw == null || raw === '') return 0
  const n = Number(raw)
  return Number.isFinite(n) ? n : 0
}

export function Play() {
  const nav = useNavigate()
  const [params] = useSearchParams()
  const mode = parseMode(params.get('mode'))
  const practiceSeed = parseSeed(params.get('seed'))
  const prefs = getPrefs()
  const lang = prefs?.lang
  const cefr = prefs?.cefr
  // Freeze the local date when a round opens so a midnight tick cannot
  // remount/reseed pickDaily, persist, or alreadyPlayed. Recapture only
  // when the round identity (mode/seed/lang/cefr) changes.
  const roundId = `${mode}|${practiceSeed}|${lang ?? ''}|${cefr ?? ''}`
  const dateFreezeRef = useRef({ roundId, dateKey: localDateKey() })
  if (dateFreezeRef.current.roundId !== roundId) {
    dateFreezeRef.current = { roundId, dateKey: localDateKey() }
  }
  const dateKey = dateFreezeRef.current.dateKey

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
  const [alreadyPlayed, setAlreadyPlayed] = useState(false)
  const [streak, setStreak] = useState(0)
  const [practiceOk, setPracticeOk] = useState(true)

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
    if (!lang || !cefr) {
      nav('/language', { replace: true })
    }
  }, [lang, cefr, nav])

  useEffect(() => {
    if (!lang || !cefr) return
    ensureStreakPersisted(lang, cefr, dateKey)
    setStreak(getStreakCount(lang, cefr, dateKey))
  }, [lang, cefr, dateKey])

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
    if (!lang || !cefr) return
    let cancelled = false
    setLoading(true)
    setError(null)
    setFinished(null)
    setAlreadyPlayed(false)

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
  }, [dateKey, lang, cefr, mode, practiceSeed, persistDaily])

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
    },
    [mode, persistDaily],
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
      const misses = r.misses + (isDiacriticHintMiss(r.cells, r.wordEntry.word, letter) ? 1 : 0)
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

  function goPractice() {
    if (!practiceOk) return
    nav(`/play?mode=practice&seed=${Date.now()}`)
  }

  if (!lang || !cefr) return null

  const vowelHelp = cefr === 'a1' || cefr === 'a2'

  if (!loading && !error && mode === 'practice' && !wordEntry) {
    return (
      <Layout>
        <TopBar
          left={<OfflineChip />}
          center={<Badge>Practice</Badge>}
          right={<StreakChip count={streak} />}
        />
        <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center">
          <h1 className="text-xl font-semibold text-ink">Practice unavailable</h1>
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
          left={<OfflineChip />}
          center={<Badge tone="accent">Daily</Badge>}
          right={<StreakChip count={streak} />}
        />
        <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-accent-soft text-2xl text-accent">
            ✓
          </div>
          <h1 className="text-xl font-semibold text-ink">Today’s daily is done</h1>
          <p className="max-w-xs text-sm text-ink-muted">
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
              <p className="mt-2 text-xs text-accent">
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
                onClick={() =>
                  nav('/share', {
                    state: buildShareCardPayload({
                      lang,
                      cefr,
                      streak,
                      dateKey,
                      word: rec.word,
                      won: rec.won,
                      mode: 'daily',
                    }),
                  })
                }
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
        left={<OfflineChip />}
        center={
          mode === 'daily' ? (
            <Badge tone="accent">Daily</Badge>
          ) : (
            <Badge>Practice</Badge>
          )
        }
        right={<StreakChip count={streak} />}
      />

      <div className="mb-3 flex items-center justify-between">
        <Lives remaining={lives} total={TOTAL_LIVES} />
        <span className="text-xs text-ink-faint">
          {LANG_CODES[lang]} · {CEFR_CODES[cefr]}
        </span>
      </div>

      {loading && (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 py-16">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-line border-t-accent" />
          <p className="text-sm text-ink-muted">
            {mode === 'daily' ? 'Loading today’s word…' : 'Loading a practice word…'}
          </p>
        </div>
      )}

      {error && !loading && (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 py-12 text-center">
          <p className="text-sm text-danger">{error}</p>
          <Button variant="secondary" onClick={() => window.location.reload()}>
            Retry
          </Button>
        </div>
      )}

      {!loading && !error && wordEntry && (
        <>
          <div className="my-5">
            <LetterGrid cells={cells} />
            {vowelHelp && cells.some((c) => c.helped && c.revealed) && (
              <p className="mt-3 text-center text-[11px] text-ink-faint">
                Soft green = vowel help (A1–A2)
              </p>
            )}
            <LearnerHint entry={wordEntry} lang={lang} />
          </div>

          {showHint && (
            <div className="mb-4">
              <Button fullWidth variant="secondary" onClick={onHint}>
                Hint — reveal one accent
              </Button>
              <p className="mt-1.5 text-center text-[11px] text-ink-faint">
                Optional. After 2 misses on a diacritic cell.
              </p>
            </div>
          )}

          {finished ? (
            <EndCard
              won={finished === 'win'}
              mode={mode}
              word={wordEntry.word}
              gloss={wordEntry.gloss}
              lang={lang}
              cefr={cefr}
              dateKey={dateKey}
              streak={streak}
              practiceOk={practiceOk}
              onPractice={goPractice}
            />
          ) : (
            <Keyboard
              lang={lang}
              usedWrong={usedWrong}
              usedCorrect={usedCorrect}
              disabled={false}
              onKey={onKey}
            />
          )}

          {!finished && mode === 'daily' && (
            <div className="mt-6 text-center">
              {practiceOk ? (
                <button
                  type="button"
                  onClick={goPractice}
                  className="text-sm font-medium text-accent underline-offset-2 hover:underline"
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
                  className="font-medium text-accent hover:underline"
                >
                  Next word
                </button>
              ) : null}
            </div>
          )}
        </>
      )}
    </Layout>
  )
}

function EndCard({
  won,
  mode,
  word,
  gloss,
  lang,
  cefr,
  dateKey,
  streak,
  practiceOk,
  onPractice,
}: {
  won: boolean
  mode: PlayMode
  word: string
  gloss?: string
  lang: PackLang
  cefr: PackCefr
  dateKey: string
  streak: number
  practiceOk: boolean
  onPractice: () => void
}) {
  const nav = useNavigate()
  return (
    <div className="mb-4 space-y-3">
      <div className="rounded-xl border border-line bg-white/80 px-4 py-4 text-center">
        <Badge tone={won ? 'accent' : 'warm'}>
          {won ? 'You got it' : 'Out of lives'}
          {mode === 'daily' ? ' · Daily' : ' · Practice'}
        </Badge>
        <p className="mt-3 text-sm text-ink-muted">The word was</p>
        <p className="mt-1 text-lg font-semibold tracking-wide text-ink">{word}</p>
        {gloss ? (
          <p className="mt-2 text-[13px] leading-relaxed text-ink-muted">{gloss}</p>
        ) : null}
      </div>

      <Card className="w-full text-left">
        <div className="flex items-center justify-between text-sm">
          <span className="text-ink-muted">
            {LANG_CODES[lang]} · {CEFR_CODES[cefr]}
          </span>
          <StreakChip count={streak} />
        </div>
        {mode === 'daily' && won && (
          <p className="mt-2 text-xs text-accent">Streak updated for {dateKey}</p>
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
      </Card>

      <div className="flex flex-col gap-2">
        <Button
          fullWidth
          onClick={() =>
            nav('/share', {
              state: buildShareCardPayload({
                lang,
                cefr,
                streak,
                dateKey,
                word,
                won,
                mode,
              }),
            })
          }
        >
          Share
        </Button>
        <Button
          fullWidth
          variant="secondary"
          onClick={onPractice}
          disabled={!practiceOk}
        >
          {mode === 'practice' ? 'Next word' : 'Practice (endless)'}
        </Button>
        {!practiceOk ? (
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
    </div>
  )
}
