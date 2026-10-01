import { describe, expect, test } from 'bun:test'

async function pageSrc(name: string): Promise<string> {
  return Bun.file(new URL(`./${name}`, import.meta.url)).text()
}

describe('Language picker (gh-30)', () => {
  test('CEFR subtitle covers B1–C2 empty start; one vertical list', async () => {
    const src = await pageSrc('Language.tsx')
    expect(src).toContain('A1–A2 prefill vowels. B1–C2 start empty.')
    expect(src).not.toContain('B1 starts empty.')
    expect(src).toContain('flex flex-col gap-2')
    expect(src).toContain('min-h-12')
  })

  test('language and CEFR are labelled radiogroups with aria-checked', async () => {
    const src = await pageSrc('Language.tsx')
    expect(src.match(/role="radiogroup"/g)?.length).toBe(2)
    expect(src).toContain('aria-labelledby="language-heading"')
    expect(src).toContain('aria-labelledby="cefr-heading"')
    expect(src).toContain('role="radio"')
    expect(src).toContain('aria-checked={lang === l}')
    expect(src).toContain('aria-checked={cefr === c}')
    expect(src).toContain('tabIndex={lang === l ? 0 : -1}')
    expect(src).toContain('tabIndex={cefr === c ? 0 : -1}')
    expect(src).toContain('aria-describedby="cefr-help"')
    expect(src).toContain('aria-orientation="horizontal"')
    expect(src).toContain('aria-orientation="vertical"')
    expect(src).toContain("e.key === 'ArrowUp' || e.key === 'ArrowLeft'")
    expect(src).toContain("e.key === 'ArrowDown' || e.key === 'ArrowRight'")
    expect(src).toContain('aria-busy={preparing}')
    expect(src).toContain('disabled={preparing}')
    expect(src).toContain('precacheSelectedLanguage(lang, cefr)')
    const prefsAt = src.indexOf('setPrefs({ lang, cefr })')
    const failedAt = src.indexOf('if (!ok)')
    expect(prefsAt).toBeGreaterThan(failedAt)
  })
})

describe('Layout pinned Continue footer', () => {
  test('footer is sticky on cream with safe-area; content scrolls above', async () => {
    const src = await Bun.file(
      new URL('../components/Layout.tsx', import.meta.url),
    ).text()
    expect(src).toContain('h-dvh')
    expect(src).toContain('overflow-y-auto')
    expect(src).toContain('sticky bottom-0 z-10')
    expect(src).toContain('border-t border-line')
    expect(src).toContain('bg-cream')
    expect(src).toContain('pb-[env(safe-area-inset-bottom)]')
  })

  test('PwaPrompt stays above the footer (z-50)', async () => {
    const src = await Bun.file(
      new URL('../components/PwaPrompt.tsx', import.meta.url),
    ).text()
    expect(src).toContain('z-50')
    expect(src).toContain('fixed')
  })
})

describe('Home daily copy', () => {
  test('soft vowel help only when prefs are A1/A2', async () => {
    const src = await pageSrc('Home.tsx')
    expect(src).toContain('precacheSelectedLanguage(selectedLang, selectedCefr)')
    expect(src).toContain("selectedCefr === 'a1' || selectedCefr === 'a2'")
    expect(src).toContain('soft vowel help')
    expect(src).toContain(
      'Guess today’s word with six lives and learner hints.',
    )
  })
})

describe('About license bands', () => {
  test('renders info.bands and CC deeds; does not loadPack', async () => {
    const src = await pageSrc('About.tsx')
    expect(src).toContain('info.bands.map')
    expect(src).not.toContain('info.attribution')
    expect(src).not.toContain('loadPack')
    expect(src).toContain('creativecommons.org/publicdomain/zero/1.0')
    expect(src).toContain('creativecommons.org/licenses/by-sa/4.0')
    expect(src).toContain('Tono Lab')
    expect(src).toContain('frequency-rank bands')
    expect(src).toContain('English A1–B1 lemmas are')
    expect(src).not.toContain('English A1–B2 lemmas are')
    expect(src).not.toContain('A1–B1 only')
  })
})

describe('Home pocket control (gh-85)', () => {
  test('Pocket (n) uses the stored slot, outline, and sits before nav', async () => {
    const src = await pageSrc('Home.tsx')
    expect(src).toContain('listPocketStored')
    expect(src).toContain('Pocket (')
    expect(src).toContain('variant="outline"')
    expect(src).toContain('pocketCount > 0')
    expect(src).toContain('Pocket cleared')
    expect(src).toContain('tabIndex={-1}')
    const pocketAt = src.indexOf('Pocket (')
    const navAt = src.indexOf('<nav')
    expect(pocketAt).toBeGreaterThan(src.indexOf('listPocketStored'))
    expect(navAt).toBeGreaterThan(pocketAt)
    expect(src).not.toContain('to="/pocket"')
    expect(src).not.toContain('Pocket (0)')
  })

  test('count is read beside getStreakCount during render, not a useState cache', async () => {
    const src = await pageSrc('Home.tsx')
    const streakAt = src.indexOf(
      'getStreakCount(selectedLang, selectedCefr, dateKey)',
    )
    const countAt = src.indexOf(
      'listPocketStored(selectedLang, selectedCefr)',
      streakAt,
    )
    const returnAt = src.indexOf('return (', streakAt)
    expect(streakAt).toBeGreaterThan(0)
    expect(countAt).toBeGreaterThan(streakAt)
    expect(returnAt).toBeGreaterThan(countAt)
    expect(src).not.toMatch(/useState\(\(\)\s*=>[\s\S]{0,240}listPocketStored/)
    expect(src).toMatch(
      /useEffect\(\(\) => \{[\s\S]*repairPocket\(\)[\s\S]*\}, \[selectedLang, selectedCefr\]\)/,
    )
  })
})

describe('Pocket sheet (gh-85)', () => {
  test('gloss-only dialog; no lemma in the row', async () => {
    const src = await Bun.file(
      new URL('../components/PocketSheet.tsx', import.meta.url),
    ).text()
    expect(src).toContain('pocketListLabel')
    expect(src).toContain('showModal')
    expect(src).toContain('role="dialog"')
    expect(src).toContain('aria-modal="true"')
    expect(src).toContain('aria-labelledby="pocket-sheet-heading"')
    expect(src).toContain('listPocketStored')
    expect(src).toContain('removeFromPocket')
    expect(src).toContain('pocketRetryHref')
    expect(src).toContain('text-ink-muted')
    expect(src).toContain('data-pocket-retry')
    expect(src).not.toContain('Pocket cleared')
    expect(src).not.toContain('entry.word')
    expect(src).not.toContain('dangerouslySetInnerHTML')
    expect(src).not.toContain('data-word')
    expect(src).not.toContain('title={')
    expect(src).not.toMatch(/streak|sign-in|account|Clerk|D1|cloud/i)
  })
})

describe('Play EndCard Save (gh-83 / ADR 0034)', () => {
  test('Save gated on shouldShowPocketSave; uses addToPocket; no Save auto-add', async () => {
    const src = await pageSrc('Play.tsx')
    expect(src).toContain("from '@/lib/pocket-save'")
    expect(src).toContain('shouldShowPocketSave(mode, won)')
    expect(src).toContain('needsReplaceOldestConfirm')
    expect(src).toContain('addToPocket({ lang, cefr, word, gloss })')
    expect(src).toContain('listPocketStored(lang, cefr)')
    expect(src).toContain('Replace oldest word?')
    expect(src).toContain('Confirm replace')
    expect(src).toContain('onClick={onSavePress}')
    expect(src).toMatch(/onClick=\{onSavePress\}[\s\S]*?>\s*Save to pocket\s*<\/Button>/)
    expect(src).toContain('pocketConfirmLabel(oldest)')
    expect(src).toContain('decideConfirmReCheck')
    expect(src).toContain('role="dialog"')
    expect(src).toContain('aria-modal="true"')
    expect(src).toContain('Pocket is full ({POCKET_CAP}).')
    const commitAt = src.indexOf('const commitSave = useCallback')
    const commitEnd = src.indexOf('}, [lang, cefr, word, gloss])', commitAt)
    expect(commitAt).toBeGreaterThan(0)
    expect(commitEnd).toBeGreaterThan(commitAt)
    const commitBody = src.slice(commitAt, commitEnd)
    expect(commitBody).toContain('addToPocket')
    expect(commitBody).toContain('if (!result.added && !result.duplicate) return false')
    expect(commitBody).not.toMatch(/recordDailyWin\s*\(/)
    expect(commitBody).not.toMatch(/setDailyRecord\s*\(/)
    const confirmAt = src.indexOf('const onConfirmReplace = useCallback')
    const confirmEnd = src.indexOf(
      '}, [lang, cefr, word, snapshotOldestId, commitSave])',
      confirmAt,
    )
    expect(confirmAt).toBeGreaterThan(0)
    expect(confirmEnd).toBeGreaterThan(confirmAt)
    const confirmBody = src.slice(confirmAt, confirmEnd)
    const storedAt = confirmBody.indexOf('const stored = commitSave()')
    const bailAt = confirmBody.indexOf('if (!stored) return', storedAt)
    const clearAt = confirmBody.indexOf("setOldestLabel('')", bailAt)
    expect(storedAt).toBeGreaterThan(0)
    expect(bailAt).toBeGreaterThan(storedAt)
    expect(clearAt).toBeGreaterThan(bailAt)
  })
})

describe('Play LearnerHint after finish (gh-95 / ADR 0035)', () => {
  test('LearnerHint gated on !finished; not shown alongside EndCard', async () => {
    const src = await pageSrc('Play.tsx')

    // Parent Play: strip only while in-progress (!finished) — ADR 0035 Decision 4
    // Addresses Avery blind spot: EndCard-only slices miss this parent coupling.
    expect(src).toContain('{!finished && (')
    expect(src).toContain('<LearnerHint entry={wordEntry} lang={lang} />')
    const gateAt = src.indexOf('{!finished && (')
    const hintAt = src.indexOf('<LearnerHint entry={wordEntry} lang={lang} />', gateAt)
    const gateClose = src.indexOf(')}', hintAt)
    expect(gateAt).toBeGreaterThan(0)
    expect(hintAt).toBeGreaterThan(gateAt)
    expect(gateClose).toBeGreaterThan(hintAt)
    // Gate wraps LearnerHint tightly (no hybrid keep-after-finish)
    expect(src.slice(gateAt, gateClose)).toContain('<LearnerHint')
    expect(src.slice(gateAt, gateClose)).not.toContain('EndCard')

    // EndCard still mounts when finished is truthy (sibling branch under playing UI)
    const finishedAt = src.indexOf('{finished ? (')
    expect(finishedAt).toBeGreaterThan(hintAt)
    const endCardCall = src.indexOf('<EndCard', finishedAt)
    expect(endCardCall).toBeGreaterThan(finishedAt)
    expect(endCardCall).toBeLessThan(src.indexOf(') : (', finishedAt))

    // EndCard itself never mounts LearnerHint (empty gloss still hides strip via parent gate)
    const endFn = src.indexOf('function EndCard(')
    expect(endFn).toBeGreaterThan(0)
    expect(src.slice(endFn)).not.toContain('<LearnerHint')
  })
})

describe('Play EndCard teach headline (gh-94 / ADR 0035)', () => {
  test('gloss elevated as teach headline; lemma demoted; synonyms wired; silent omit', async () => {
    const src = await pageSrc('Play.tsx')
    const endAt = src.indexOf('function EndCard(')
    expect(endAt).toBeGreaterThan(0)
    const endCard = src.slice(endAt)

    // Synonyms passed from pack lemma; EndCard accepts synonyms prop
    expect(src).toContain('synonyms={wordEntry.synonyms}')
    expect(endCard).toContain('synonyms?: string[]')
    expect(endCard).toContain("const teachGloss = gloss?.trim() ?? ''")
    expect(endCard).toContain('(synonyms ?? [])')
    expect(endCard).toContain('.slice(0, 3)')

    // Gloss is teach headline (larger / ink) — not muted buried chip
    expect(endCard).toContain(
      'className="mt-3 text-lg font-semibold leading-snug text-ink"',
    )
    expect(endCard).toContain('{teachGloss}')
    // Old buried gloss chip must not remain
    expect(endCard).not.toContain(
      'mt-2 text-[13px] leading-relaxed text-ink-muted">{gloss}',
    )

    // Lemma revealed but not sole hero when gloss present (demoted vs text-lg font-semibold)
    expect(endCard).toContain("'mt-0.5 text-base font-medium'")
    expect(endCard).toContain('The word was')
    expect(endCard).toContain('{word}')

    // Synonym chips lean layout (same spirit as LearnerHint)
    expect(endCard).toContain(
      'inline-flex items-center rounded-full bg-cream-dark/90 px-2.5 py-1 text-[11px] font-medium text-ink-muted',
    )
    expect(endCard).toContain('teachSynonyms.map')

    // Silent omit: trim empty gloss; no NO_HINT_COPY / faint placeholder in teach panel
    expect(endCard).toContain('{teachGloss ? (')
    expect(endCard).not.toContain('NO_HINT_COPY')
    expect(endCard).not.toMatch(/No hint|no hint available|Add a gloss/i)
    const panelStart = endCard.indexOf('rounded-xl border border-line bg-raised/80')
    const panelEnd = endCard.indexOf('<Card className="w-full text-left">', panelStart)
    expect(panelStart).toBeGreaterThan(0)
    expect(panelEnd).toBeGreaterThan(panelStart)
    const teachPanel = endCard.slice(panelStart, panelEnd)
    expect(teachPanel).not.toContain('text-ink-faint')
    expect(teachPanel).not.toContain('NO_HINT_COPY')
    expect(teachPanel).toContain('{teachGloss}')
    expect(teachPanel).toContain('teachSynonyms')

    // Do not couple LearnerHint empty-state into EndCard
    expect(endCard).not.toContain('LearnerHint')
    expect(endCard).not.toContain("from '@/components/play/LearnerHint'")
  })
})

describe('Play pocket mode (gh-84 / ADR 0034)', () => {
  test('mode=pocket wires canPlay gate, win remove, manual Remove; no recordDailyWin', async () => {
    const src = await pageSrc('Play.tsx')
    expect(src).toContain("from '@/lib/pocket-play'")
    expect(src).toContain("raw === 'pocket'")
    expect(src).toContain('canPlayPocketEntry')
    expect(src).toContain('findPocketEntryById')
    expect(src).toContain('parsePocketEntryId')
    expect(src).toContain('pocketOutcomeOnFinish')
    expect(src).toContain('removeFromPocket')
    expect(src).toContain('Remove from pocket')
    expect(src).toContain(
      '/play?mode=pocket&id=${encodeURIComponent(pocketId)}&seed=${Date.now()}',
    )
    expect(src).toContain('This pocket link isn’t valid.')
    expect(src).toContain(
      'Today’s daily is already won — pocket retry waits until tomorrow.',
    )
    expect(src).toContain("Pocket doesn’t affect your streak")
    expect(src).toContain('setActivePocketId(null)')
    const pocketBranch = src.indexOf("if (mode === 'pocket') {")
    const repairAt = src.indexOf('repairPocket()', pocketBranch)
    const listAt = src.indexOf('listPocketStored(lang, cefr)', pocketBranch)
    expect(pocketBranch).toBeGreaterThan(0)
    expect(repairAt).toBeGreaterThan(pocketBranch)
    expect(listAt).toBeGreaterThan(repairAt)
    const endAt = src.indexOf('const endGame = useCallback')
    const endDeps = src.indexOf('[mode, persistDaily, activePocketId]', endAt)
    expect(endAt).toBeGreaterThan(0)
    expect(endDeps).toBeGreaterThan(endAt)
    const endBody = src.slice(endAt, endDeps)
    expect(endBody).toContain("mode === 'pocket'")
    expect(endBody).toContain('removeFromPocket')
    expect(endBody).not.toMatch(/recordDailyWin\s*\(/)
  })

  test('View pocket is daily-lose saved only, not the replace confirm', async () => {
    const src = await pageSrc('Play.tsx')
    const start = src.indexOf('confirming ? (')
    const end = src.indexOf(') : (', start)
    expect(start).toBeGreaterThan(0)
    expect(end).toBeGreaterThan(start)
    const confirmingSlice = src.slice(start, end)
    expect(confirmingSlice).not.toContain('View pocket')
    expect(confirmingSlice).not.toContain('PocketSheet')
    const viewAt = src.indexOf('View pocket')
    const shareAt = src.indexOf('\n            Share\n')
    expect(viewAt).toBeGreaterThan(end)
    expect(shareAt).toBeGreaterThan(viewAt)
    expect(src).toContain("mode !== 'pocket'")
    expect(src).toContain('pocketRetryHref(id, Date.now())')
    expect(src).toContain('listPocketStored(lang, cefr).length')
    expect(src).toContain('Pocket cleared')
    const savedAt = src.indexOf(
      "savePhase === 'saved' || savePhase === 'duplicate'",
      end,
    )
    expect(savedAt).toBeGreaterThan(end)
    expect(src.indexOf('Pocket cleared', savedAt)).toBeGreaterThan(savedAt)
  })
})
