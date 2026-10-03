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
    expect(src).toContain("aria-busy={preparing || cachePhase === 'caching'}")
    expect(src).toContain('disabled={preparing}')
    expect(src).toContain('precacheSelectedLanguage(lang, cefr)')
    const prefsAt = src.indexOf('setPrefs({ lang, cefr })')
    const failedAt = src.indexOf('if (!ok)')
    expect(prefsAt).toBeGreaterThan(failedAt)
  })
})

describe('Language picker provenance caption (gh-80 / #99 / #101)', () => {
  test('selected-only muted caption under CEFR; Pack info sole About link; ellipsis', async () => {
    const src = await pageSrc('Language.tsx')
    expect(src).toContain("from '@/packs/provenance'")
    expect(src).toContain('provenanceCaption(lang, cefr)')
    expect(src).toContain('packInfoLabel(lang)')
    expect(src).toContain('data-provenance-caption')
    expect(src).toContain('truncate')
    // One caption block — not mapped onto every lang/CEFR row
    expect(src.match(/data-provenance-caption/g)?.length).toBe(1)
    expect(src.match(/provenanceCaption\(/g)?.length).toBe(1)
    const cefrGroupAt = src.indexOf('aria-labelledby="cefr-heading"')
    const captionAt = src.indexOf('data-provenance-caption')
    expect(captionAt).toBeGreaterThan(cefrGroupAt)
    // Caption sits outside radio buttons (title-only rows)
    const radioMap = src.indexOf('{PACK_CEFRS.map((c) => (')
    const radioEnd = src.indexOf('</div>', src.indexOf('{CEFR_LABELS[c]}', radioMap))
    expect(src.slice(radioMap, radioEnd)).not.toContain('provenanceCaption')
    expect(src.slice(radioMap, radioEnd)).not.toContain('data-provenance-caption')
    // Provenance block: caption is muted non-link; Pack info is sole /about Link
    const block = src.slice(captionAt, src.indexOf('</Layout>', captionAt))
    expect(block.match(/to="\/about"/g)?.length).toBe(1)
    expect(block).toContain('text-ink-muted')
    expect(block).toMatch(/<span[\s\S]*truncate[\s\S]*\{caption\}/)
    expect(block).not.toMatch(/<Link[\s\S]*\{caption\}/)
    expect(block).toContain('min-h-8')
    expect(block).toContain('focus-visible:underline')
  })

  test('omit provenance from Play / EndCard / Share / Home chrome', async () => {
    for (const name of ['Play.tsx', 'Share.tsx', 'Home.tsx', 'About.tsx'] as const) {
      const src = await pageSrc(name)
      expect(src).not.toContain('provenanceCaption')
      expect(src).not.toContain('data-provenance-caption')
      expect(src).not.toContain("from '@/packs/provenance'")
    }
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

describe('Play LearnerHint in-progress teach cue (gh-93 / ADR 0035)', () => {
  test('gloss elevated as mid-round teach cue; no lemma; empty keeps NO_HINT_COPY', async () => {
    const src = await Bun.file(
      new URL('../components/play/LearnerHint.tsx', import.meta.url),
    ).text()

    // Teach hierarchy: exactly one mid-round gloss class (ink + medium; leaner than EndCard)
    const teachGlossClass = 'text-sm font-medium leading-snug text-ink'
    expect(src.split(teachGlossClass).length - 1).toBe(1)
    expect(src).toContain('{gloss}')
    // Old muted buried gloss must not remain
    expect(src).not.toContain('text-[13px] leading-snug text-ink-muted')
    // Stay leaner than EndCard post-finish climax
    expect(src).not.toContain('text-lg font-semibold')

    // Synonym chips: exactly one cream-pill ink class (cross-surface match with EndCard)
    const chipClass =
      'inline-flex items-center rounded-full bg-cream-dark/90 px-2.5 py-1 text-[11px] font-medium text-ink'
    expect(src.split(chipClass).length - 1).toBe(1)
    expect(src).toContain('.slice(0, 3)')

    // ADR 0023: never show the answer word
    expect(src).not.toContain('entry.word')
    expect(src).not.toContain('{entry.word}')
    expect(src).not.toMatch(/\{[^}]*\.word[^}]*\}/)

    // Graceful empty state still uses NO_HINT_COPY (ADR 0023); not silent omit
    expect(src).toContain('NO_HINT_COPY')
    expect(src).toContain('NO_HINT_COPY[lang]')
    expect(src).toContain('text-ink-faint')
    expect(src).toContain('border-dashed')

    // No translation-first / L1 schooling copy
    expect(src).not.toMatch(/translation|translate|L1|English meaning|means in/i)
    expect(src).not.toMatch(/Add a gloss|no hint available/i)
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

    // Synonym chips match mid-round LearnerHint ink (Avery cross-surface hierarchy)
    expect(endCard).toContain(
      'inline-flex items-center rounded-full bg-cream-dark/90 px-2.5 py-1 text-[11px] font-medium text-ink',
    )
    expect(endCard).not.toContain(
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

describe('Home offline-ready signal (gh-103)', () => {
  test('landing drops API health; shows OfflineChip packReady instead', async () => {
    const src = await pageSrc('Home.tsx')
    expect(src).not.toMatch(/API health:/)
    expect(src).not.toContain('getHealth')
    expect(src).not.toContain('useShellStore')
    expect(src).toContain('data-home-offline-signal')
    expect(src).toContain('packReady={Boolean(prefs) && packCached}')
    expect(src).toContain('isPackCachedLocally')
    expect(src).not.toMatch(/Install app|Add to Home Screen/i)
  })

  test('precache race uses cacheGen/alive cancel (Critical #2)', async () => {
    const src = await pageSrc('Home.tsx')
    expect(src).toContain('cacheGen')
    expect(src).toContain('cacheAlive')
    expect(src).toContain('gen !== cacheGen.current')
    expect(src).toContain('!cacheAlive.current')
    expect(src).toContain('precacheSelectedLanguage(selectedLang, selectedCefr)')
  })
})

describe('Language pack cache + quiet Install (gh-103)', () => {
  test('selection triggers precache; quiet A2HS after/with cache; sticky CTA scroll pad', async () => {
    const src = await pageSrc('Language.tsx')
    expect(src).toContain('precacheSelectedLanguage(lang, cefr)')
    expect(src).toContain('data-pack-cache-status')
    expect(src).toContain('InstallHelpLink')
    expect(src).toContain('Offline ready for')
    expect(src).toContain('const showInstall = cachePhase === \'ready\'')
    expect(src).toContain("cachePhase === 'caching'")
    expect(src).toContain("'Caching…'")
    // Provenance preserved
    expect(src).toContain('data-provenance-caption')
    expect(src).toContain('provenanceCaption(lang, cefr)')
  })

  test('InstallHelp is optional dismissible sheet, not a sales wall', async () => {
    const src = await Bun.file(
      new URL('../components/InstallHelp.tsx', import.meta.url),
    ).text()
    expect(src).toContain('data-install-link')
    expect(src).toContain('data-install-sheet')
    expect(src).toContain('Optional: install Hiato')
    expect(src).toContain('No store')
    expect(src).toContain('no account')
    expect(src).toContain('showModal')
    expect(src).toContain('min-h-11')
    expect(src).toContain('openerRef')
    expect(src).toContain('restoreFocusRef')
    expect(src).not.toMatch(/sign[- ]?in|account required|app store/i)
  })
})

describe('Play tiles / Reveal / vowel caption (gh-103)', () => {
  test('LetterGrid uses equal row helper; Keyboard ≥44px; Practice Reveal; B1–C2 no vowel caption', async () => {
    const grid = await Bun.file(
      new URL('../components/play/LetterGrid.tsx', import.meta.url),
    ).text()
    expect(grid).toContain('letterGridRowLengths')
    expect(grid).toContain('data-letter-grid')
    expect(grid).toContain('data-letter-row')

    const kb = await Bun.file(
      new URL('../components/play/Keyboard.tsx', import.meta.url),
    ).text()
    expect(kb).toContain('min-h-[44px]')
    expect(kb).toContain('data-tap-min="44"')

    const src = await pageSrc('Play.tsx')
    expect(src).toContain('data-reveal-word')
    expect(src).toContain('Reveal word')
    expect(src).toContain('function onReveal()')
    expect(src).toContain("mode !== 'practice'")
    expect(src).toContain('revealAllCells')
    // Vowel caption only when vowelHelp (A1/A2)
    expect(src).toContain("const vowelHelp = cefr === 'a1' || cefr === 'a2'")
    expect(src).toContain('vowelHelp && cells.some')
    expect(src).toContain('Soft green = vowel help (A1–A2)')
    expect(src).toContain('text-ink-muted')
    expect(src).toContain('aria-label="Reveal word and end this practice round"')
  })

  test('EndCard teach hierarchy + keyed PlayRound identity; Reveal badge copy', async () => {
    const src = await pageSrc('Play.tsx')
    // Critical #1: remount round subtree — no ref+setState-during-render
    expect(src).not.toContain('playIdentityRef')
    expect(src).toContain('function PlayRound(')
    expect(src).toContain('key={roundId}')
    expect(src).toContain('data-endcard-teach')
    expect(src).toContain('{!finished && (')
    expect(src).toContain('<LearnerHint entry={wordEntry} lang={lang} />')
    const endAt = src.indexOf('function EndCard(')
    const endCard = src.slice(endAt)
    expect(endCard).toContain('text-lg font-semibold leading-snug text-ink')
    expect(endCard).toContain('{teachGloss}')
    expect(endCard).toContain('The word was')
    expect(endCard).not.toContain('<LearnerHint')
    // Warning #1: Reveal → "Word revealed"; lives → "Out of lives"
    expect(endCard).toContain("revealed ? 'Word revealed' : 'Out of lives'")
    expect(src).toContain('setRevealedWord(true)')
    expect(src).not.toMatch(/Win\/Lose|prototype.*toggle/i)
  })
})

describe('Layout sticky Continue scroll padding (gh-103 / #80)', () => {
  test('footer content area gets scroll-pb when footer present', async () => {
    const src = await Bun.file(
      new URL('../components/Layout.tsx', import.meta.url),
    ).text()
    expect(src).toContain('scroll-pb-6')
    expect(src).toContain("footer ? 'scroll-pb-6 pb-2' : ''")
    expect(src).toContain('sticky bottom-0 z-10')
  })
})

describe('OfflineChip packReady vs network (#103 Avery W3)', () => {
  test('packReady path returns null while offline (no duplicate Offline chrome)', async () => {
    const src = await Bun.file(
      new URL('../components/OfflineChip.tsx', import.meta.url),
    ).text()
    expect(src).toContain('if (packReady) return null')
    expect(src).toContain('data-offline-ready')
    expect(src).toContain('Offline ready')
  })
})

/** Bodies of useEffect / useLayoutEffect calls. Skips the other hook. */
function effectCallbackBodies(
  src: string,
  hook: 'useEffect' | 'useLayoutEffect',
): string[] {
  const bodies: string[] = []
  const needle = `${hook}(`
  let from = 0
  while (from < src.length) {
    const at = src.indexOf(needle, from)
    if (at < 0) break
    // `useLayoutEffect(` contains the substring `useEffect(`.
    if (hook === 'useEffect' && src.slice(at - 6, at) === 'Layout') {
      from = at + needle.length
      continue
    }
    const open = at + hook.length
    let depth = 0
    let end = -1
    for (let i = open; i < src.length; i++) {
      const c = src[i]
      if (c === '(') depth++
      else if (c === ')') {
        depth--
        if (depth === 0) {
          end = i
          break
        }
      }
    }
    if (end < 0) break
    bodies.push(src.slice(open + 1, end))
    from = end + 1
  }
  return bodies
}

describe('Hear the word EndCard Web Speech (gh-113 / ADR 0037)', () => {
  test('autoplay scan covers useLayoutEffect, not only useEffect split on `}, [`', () => {
    // A decoy `}, [` sits before speakLemma. Slicing each useEffect( chunk at the
    // first `}, [` drops the call; useLayoutEffect( also contains the substring
    // useEffect(, so that split never names the hook that actually speaks.
    const sample = `
      useLayoutEffect(() => {
        const decoy = '}, ['
        speakLemma(word, lang)
      })
      useEffect(() => {
        return subscribeSpeechAvailability(lang, setSpeechOk)
      }, [speakSurface, lang])
    `
    const layout = effectCallbackBodies(sample, 'useLayoutEffect')
    expect(layout).toHaveLength(1)
    expect(layout[0]).toContain('speakLemma(')
    const effects = effectCallbackBodies(sample, 'useEffect')
    expect(effects).toHaveLength(1)
    expect(effects[0]).not.toContain('speakLemma(')
    expect(effects[0]).toContain('subscribeSpeechAvailability')
    const oldChunks = sample.split('useEffect(').slice(1)
    const oldMisses = oldChunks.some((block) => {
      const body = block.slice(0, block.indexOf('}, ['))
      return !body.includes('speakLemma(')
    })
    expect(oldMisses).toBe(true)
  })

  test('HTW-endcard-button (#116): speak control next to lemma; daily+practice; no autoplay', async () => {
    const src = await pageSrc('Play.tsx')
    const endAt = src.indexOf('function EndCard(')
    expect(endAt).toBeGreaterThan(0)
    const endCard = src.slice(endAt)

    expect(src).toContain("from '@/lib/speech'")
    expect(endCard).toContain('data-endcard-speak')
    expect(endCard).toContain('speakLemma(word, lang)')
    expect(endCard).toContain('speakLemmaAriaLabel(lang)')
    expect(endCard).toContain('min-h-11')
    expect(endCard).toContain('min-w-11')

    // Daily + practice only — not pocket
    expect(endCard).toContain(
      "const speakSurface = mode === 'daily' || mode === 'practice'",
    )
    expect(endCard).toContain('showSpeakControl = speakSurface && speechOk')
    expect(endCard).toContain('subscribeSpeechAvailability(lang, setSpeechOk)')

    // No auto-play. The only speakLemma call is inside the button's own
    // native click listener (iOS user-activation). React onClick on this
    // button would double-fire, so the control must not set onClick.
    expect(endCard).toContain('speakLemma(word, lang)')
    expect(endCard.split('speakLemma(').length - 1).toBe(1)
    expect(endCard).toContain("addEventListener('click', onClick)")
    expect(endCard).toContain("removeEventListener('click', onClick)")
    expect(endCard).toContain('ref={speakBtnRef}')
    // Lemma only — not gloss. Options must not replace (word, lang).
    expect(endCard).toMatch(/speakLemma\(\s*word\s*,\s*lang\s*\)/)
    expect(endCard).not.toMatch(/speakLemma\(\s*gloss/)
    expect(endCard).not.toMatch(/speakLemma\(\s*teachGloss/)
    const speakEffects: string[] = []
    for (const hook of ['useEffect', 'useLayoutEffect'] as const) {
      const bodies = effectCallbackBodies(endCard, hook)
      expect(bodies.length).toBeGreaterThan(0)
      for (const body of bodies) {
        if (!body.includes('speakLemma(')) continue
        expect(hook).toBe('useEffect')
        speakEffects.push(body)
      }
    }
    expect(speakEffects).toHaveLength(1)
    const speakEffect = speakEffects[0]!
    const fnAt = speakEffect.indexOf('const onClick = () => {')
    const lemmaCallAt = speakEffect.indexOf('speakLemma(')
    const addAt = speakEffect.indexOf("addEventListener('click'")
    expect(fnAt).toBeGreaterThan(-1)
    expect(fnAt).toBeLessThan(lemmaCallAt)
    expect(lemmaCallAt).toBeLessThan(addAt)
    // Registered, not invoked, when the effect runs.
    expect(speakEffect).not.toContain('onClick()')

    // ≥44px icon-only target; focus ring nearer 3:1 (not accent-fg/40 ~1.8:1)
    const btnAt = endCard.indexOf('data-endcard-speak')
    const btn = endCard.slice(btnAt, endCard.indexOf('</button>', btnAt))
    expect(btn).toContain('min-h-11')
    expect(btn).toContain('min-w-11')
    expect(btn).toContain('focus-visible:ring-2')
    expect(btn).toContain('focus-visible:ring-accent-fg')
    expect(btn).not.toContain('focus-visible:ring-accent-fg/')
    expect(btn).toContain('focus-visible:bg-accent-soft')
    expect(btn).toContain('active:bg-cream-dark')
    expect(btn).toContain('data-speaking=')
    expect(btn).not.toContain('onClick')
    expect(btn).not.toMatch(/>\s*[A-Za-zÀ-ÿ]{2,}/)
    expect(btn).not.toMatch(/Stop|voice picker|autoplay/i)

    // Control sits next to the revealed lemma
    const wordAt = endCard.indexOf('{word}')
    const speakAt = endCard.indexOf('data-endcard-speak')
    expect(wordAt).toBeGreaterThan(0)
    expect(speakAt).toBeGreaterThan(wordAt)
    expect(speakAt - wordAt).toBeLessThan(400)
  })

  test('HTW-i18n-a11y (#117): aria-label via speakLemmaAriaLabel / SPEAK_LEMMA_ARIA', async () => {
    const src = await pageSrc('Play.tsx')
    expect(src).toContain('speakLemmaAriaLabel')
    expect(src).toContain("from '@/packs/labels'")

    const labels = await Bun.file(
      new URL('../packs/labels.ts', import.meta.url),
    ).text()
    expect(labels).toContain('SPEAK_LEMMA_ARIA')
    expect(labels).toContain("en: 'Hear the word'")
    expect(labels).toContain("pt: 'Ouvir a palavra'")
    expect(labels).toContain("de: 'Wort anhören'")
    expect(labels).toContain("es: 'Escuchar la palabra'")
    expect(labels).toContain('speakLemmaAriaLabel')
    expect(labels).toContain('SPEAK_LEMMA_ARIA.en')
    // No Settings voice picker / accent teaching copy
    expect(labels).not.toMatch(/voice picker|Settings|accent score|pronunciation drill/i)
  })

  test('HTW-tests (#118): no mid-round speak; PocketSheet gloss-only does not speak', async () => {
    const hint = await Bun.file(
      new URL('../components/play/LearnerHint.tsx', import.meta.url),
    ).text()
    expect(hint).not.toContain('speech')
    expect(hint).not.toContain('speakLemma')
    expect(hint).not.toContain('speechSynthesis')
    expect(hint).not.toContain("from '@/lib/speech'")

    const pocket = await Bun.file(
      new URL('../components/PocketSheet.tsx', import.meta.url),
    ).text()
    expect(pocket).not.toContain('speech')
    expect(pocket).not.toContain('speakLemma')
    expect(pocket).not.toContain('speechSynthesis')
    expect(pocket).not.toContain("from '@/lib/speech'")
    expect(pocket).not.toContain('data-endcard-speak')

    const play = await pageSrc('Play.tsx')
    // In-round branch (Keyboard / Reveal) must not call speak
    const finishedGate = play.indexOf('{finished ? (')
    expect(finishedGate).toBeGreaterThan(0)
    const inRound = play.slice(
      finishedGate,
      play.indexOf('function EndCard('),
    )
    // The EndCard call is inside finished ? — exclude that; look at the else arm
    const elseArmStart = inRound.indexOf(') : (')
    expect(elseArmStart).toBeGreaterThan(0)
    const elseArm = inRound.slice(elseArmStart)
    expect(elseArm).not.toContain('speakLemma')
    expect(elseArm).not.toContain('data-endcard-speak')
    expect(elseArm).not.toContain('speechSynthesis')

    // Keyboard / Lives / LetterGrid never import speech
    for (const name of [
      'Keyboard.tsx',
      'Lives.tsx',
      'LetterGrid.tsx',
    ] as const) {
      const comp = await Bun.file(
        new URL(`../components/play/${name}`, import.meta.url),
      ).text()
      expect(comp).not.toContain("from '@/lib/speech'")
      expect(comp).not.toContain('speakLemma')
      expect(comp).not.toContain('speechSynthesis')
    }
  })

  test('HTW-tests (#118): hide when unsupported; utterance is lemma; win and lose share control', async () => {
    const src = await pageSrc('Play.tsx')
    const endCard = src.slice(src.indexOf('function EndCard('))

    // Hidden when speech unsupported / no usable voice
    expect(endCard).toContain('showSpeakControl')
    expect(endCard).toContain('{showSpeakControl ? (')
    expect(endCard).toContain('subscribeSpeechAvailability')

    // Speaks lemma (`word`) only — not gloss
    expect(endCard).toContain('speakLemma(word, lang)')
    expect(endCard).not.toMatch(/speakLemma\(\s*gloss/)
    expect(endCard).not.toMatch(/speakLemma\(\s*teachGloss/)

    // Same EndCard for win and lose — speak gate is mode-based, not won-based
    expect(endCard).toContain("mode === 'daily' || mode === 'practice'")
    expect(endCard).not.toMatch(/showSpeakControl.*won/)
    expect(endCard).not.toMatch(/speakSurface.*won/)
  })
})
