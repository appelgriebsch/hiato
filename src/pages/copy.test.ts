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
    expect(commitBody).not.toMatch(/recordDailyWin\s*\(/)
    expect(commitBody).not.toMatch(/setDailyRecord\s*\(/)
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
    expect(src).toContain("`/play?mode=pocket&id=${encodeURIComponent(pocketId)}`")
    expect(src).toContain("Pocket doesn’t affect your streak")
    const endAt = src.indexOf('const endGame = useCallback')
    const endEnd = src.indexOf('}, [mode, persistDaily, activePocketId])', endAt)
    expect(endAt).toBeGreaterThan(0)
    expect(endEnd).toBeGreaterThan(endAt)
    const endBody = src.slice(endAt, endEnd)
    expect(endBody).toContain("mode === 'pocket'")
    expect(endBody).toContain('removeFromPocket')
    expect(endBody).not.toMatch(/recordDailyWin\s*\(/)
  })
})
