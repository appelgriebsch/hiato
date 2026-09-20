import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Layout, TopBar } from '@/components/Layout'
import { OfflineChip } from '@/components/OfflineChip'
import { Keyboard } from '@/components/play/Keyboard'
import { LearnerHint } from '@/components/play/LearnerHint'
import { LetterGrid } from '@/components/play/LetterGrid'
import { Lives } from '@/components/play/Lives'
import { Button } from '@/components/ui/button'
import {
  TOTAL_LIVES,
  applyGuess,
  buildInitialCells,
  correctKeysFromCells,
  graphemeKey,
  hasUnrevealedDiacritic,
  isDiacriticHintMiss,
  isWon,
  localDateKey,
  pickDailyLemma,
  revealOneDiacritic,
  type CellState,
} from '@/engine'
import { getPrefs } from '@/lib/prefs'
import { CEFR_CODES, LANG_CODES } from '@/packs/labels'
import { loadPack } from '@/packs/load'
import type { PackLemma } from '@/packs/schema'

export function Play() {
  const nav = useNavigate()
  const prefs = getPrefs()
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

  // Mount-time dateKey; midnight rollover without remount is T4 (ADR 0004 follow-up).
  const dateKey = localDateKey()
  const lang = prefs?.lang
  const cefr = prefs?.cefr

  useEffect(() => {
    if (!lang || !cefr) {
      nav('/language', { replace: true })
    }
  }, [lang, cefr, nav])

  useEffect(() => {
    if (!lang || !cefr) return
    let cancelled = false
    setLoading(true)
    setError(null)
    setFinished(null)

    void loadPack(lang, cefr)
      .then((pack) => {
        if (cancelled) return
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
  }, [dateKey, lang, cefr])

  const showHint = useMemo(() => {
    if (!wordEntry || hintUsed || finished) return false
    return misses >= 2 && hasUnrevealedDiacritic(cells, wordEntry.word)
  }, [misses, cells, wordEntry, hintUsed, finished])

  const endGame = useCallback((result: 'win' | 'lose') => {
    setFinished(result)
  }, [])

  function onKey(letter: string) {
    if (!wordEntry || finished || loading) return
    const k = graphemeKey(letter)
    if (usedWrong.has(k) || usedCorrect.has(k)) return

    const { cells: next, hit } = applyGuess(cells, wordEntry.word, letter)
    if (hit) {
      setCells(next)
      setUsedCorrect((s) => new Set(s).add(k))
      if (isWon(next)) endGame('win')
    } else {
      setUsedWrong((s) => new Set(s).add(k))
      // ADR 0015: only diacritic-cell misses (see isDiacriticHintMiss), not every wrong key.
      if (isDiacriticHintMiss(cells, wordEntry.word, letter)) {
        setMisses((m) => m + 1)
      }
      setLives((lv) => {
        const n = lv - 1
        if (n <= 0) endGame('lose')
        return n
      })
    }
  }

  function onHint() {
    if (!wordEntry || !showHint) return
    const next = revealOneDiacritic(cells, wordEntry.word)
    setCells(next)
    setHintUsed(true)
    setUsedCorrect(correctKeysFromCells(next))
    if (isWon(next)) endGame('win')
  }

  if (!lang || !cefr) return null

  const vowelHelp = cefr === 'a1' || cefr === 'a2'

  return (
    <Layout>
      <TopBar
        left={<OfflineChip />}
        center={
          <span className="rounded-full bg-accent-soft px-2.5 py-1 text-xs font-medium text-accent">
            Daily
          </span>
        }
        right={
          <span className="text-xs text-ink-faint">
            {LANG_CODES[lang]} · {CEFR_CODES[cefr]}
          </span>
        }
      />

      <div className="mb-3 flex items-center justify-between">
        <Lives remaining={lives} total={TOTAL_LIVES} />
        <span className="text-xs text-ink-faint">{dateKey}</span>
      </div>

      {loading && (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 py-16">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-line border-t-accent" />
          <p className="text-sm text-ink-muted">Loading today’s word…</p>
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
            <div className="mb-4 rounded-xl border border-line bg-white/80 px-4 py-4 text-center">
              <p className="text-lg font-semibold text-ink">
                {finished === 'win' ? 'Solved!' : 'Out of lives'}
              </p>
              <p className="mt-1 text-sm text-ink-muted">
                Today’s word was{' '}
                <span className="font-semibold text-ink">{wordEntry.word}</span>
              </p>
              <Link
                to="/"
                className="mt-4 inline-flex min-h-11 w-full items-center justify-center rounded-xl bg-accent-soft px-5 text-[15px] font-medium text-accent"
              >
                Back home
              </Link>
            </div>
          ) : (
            <Keyboard
              lang={lang}
              usedWrong={usedWrong}
              usedCorrect={usedCorrect}
              disabled={false}
              onKey={onKey}
            />
          )}
        </>
      )}
    </Layout>
  )
}
