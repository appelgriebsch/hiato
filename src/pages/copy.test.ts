import { describe, expect, test } from 'bun:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { ACCENT_TEACH_FORGIVEN_CUE, accentTeachLine, accentTeachParts } from '@/engine'
import { t, UI_COPY, UI_LOCALES, type UiKey } from '@/i18n'
import { PACK_LANGS } from '@/packs/schema'
import { buildShareCardPayload } from '@/lib/share-card'
import { sharePathWithToken } from '@/lib/share-url'
import { Share } from './Share'

async function pageSrc(name: string): Promise<string> {
  return Bun.file(new URL(`./${name}`, import.meta.url)).text()
}

describe('Language picker (gh-30)', () => {
  test('mechanic helper replaced by selected-level line; 3-column grids (#182)', async () => {
    const src = await pageSrc('Language.tsx')
    expect(src).not.toContain('A1–A2 prefill vowels')
    expect(src).toContain('{t(`language.cefrLine.${cefr}`)}')
    expect(UI_COPY.en['language.cefrLine.a1']).toContain('Beginner')
    // #401: language grid is 2-col at 320px, 3-col from 360px up; level grid stays 3-col
    expect(src.match(/grid grid-cols-3 gap-2/g)?.length).toBe(1)
    expect(src).toContain('grid grid-cols-2 min-[360px]:grid-cols-3 gap-2')
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
    expect(src).not.toContain("aria-orientation")
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
    // #307 m2 / #401: the language radio label must not truncate or wrap mid-word
    // ('Português' at 320px) — whitespace-nowrap on the label's own lang.
    expect(src).toContain('whitespace-nowrap text-sm font-semibold')
    expect(src).toContain('lang={l}')
    expect(src).not.toContain('truncate text-sm font-semibold')
    // One caption block — not mapped onto every lang/CEFR row
    expect(src.match(/data-provenance-caption/g)?.length).toBe(1)
    expect(src.match(/provenanceCaption\(/g)?.length).toBe(1)
    const cefrGroupAt = src.indexOf('aria-labelledby="cefr-heading"')
    const captionAt = src.indexOf('data-provenance-caption')
    // #182: caption lives in SelectionCard, rendered after the level grid
    expect(src.indexOf('<SelectionCard', cefrGroupAt)).toBeGreaterThan(cefrGroupAt)
    // Caption sits outside radio buttons (title-only rows)
    const radioMap = src.indexOf('{PACK_CEFRS.map((c) => (')
    const radioEnd = src.indexOf('</div>', src.indexOf('{CEFR_CODES[c]}', radioMap))
    expect(src.indexOf('{CEFR_CODES[c]}', radioMap)).toBeGreaterThan(radioMap)
    expect(radioEnd).toBeGreaterThan(radioMap)
    expect(src.slice(radioMap, radioEnd)).not.toContain('provenanceCaption')
    expect(src.slice(radioMap, radioEnd)).not.toContain('data-provenance-caption')
    // Provenance block: caption is muted non-link; Pack info is sole /about Link
    const block = src.slice(captionAt, src.indexOf('</section>', captionAt))
    expect(block.match(/to="\/about"/g)?.length).toBe(1)
    expect(block).toContain('text-ink-muted')
    expect(block).toMatch(/<span[\s\S]*line-clamp-2[\s\S]*\{caption\}/)
    expect(block).not.toMatch(/<Link[\s\S]*\{caption\}/)
    expect(block).toContain('min-h-11')
    expect(block).not.toContain('focus-visible:outline-none')
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
  test('footer is sticky on cream with safe-area', async () => {
    const src = await Bun.file(
      new URL('../components/Layout.tsx', import.meta.url),
    ).text()
    // min-h-dvh (not a fixed h-dvh): with a sticky footer the shell grows past
    // the viewport so the document scrolls and the card clears the footer (#307).
    expect(src).toContain('min-h-dvh')
    expect(src).not.toContain("'mx-auto flex h-dvh ")
    // Root scroll padding reserves the footer height for scrollIntoView (#307).
    expect(src).toContain('scroll-padding-bottom')
    // A scrollport on this column clips pixel frames on the right.
    expect(src).not.toContain('overflow-y-auto')
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
    expect(src).toContain("t('home.bodySoft')")
    expect(src).toContain("t('home.body')")
    expect(UI_COPY.en['home.bodySoft']).toContain('soft vowel help')
    expect(UI_COPY.en['home.body']).toContain('Guess today’s word with six lives and learner hints.')
  })
})

describe('About license bands', () => {
  test('renders info.bands and CC deeds; does not loadPack', async () => {
    const src = await pageSrc('About.tsx')
    expect(src).toContain('info.bands.map')
    expect(src).not.toContain('info.attribution')
    expect(src).not.toContain('loadPack')
    expect(src).not.toContain('creativecommons.org/publicdomain/zero/1.0')
    expect(src).toContain('cefr-j.org')
    expect(src).toContain('creativecommons.org/licenses/by-sa/4.0')
    expect(src).toContain("t('about.licensesBody')")
    expect(UI_COPY.en['about.licensesBody']).toContain('Tono')
    expect(UI_COPY.en['about.licensesBody']).toContain('frequency-rank bands')
    expect(UI_COPY.en['about.licensesBody']).toContain('English A1–B2 lemmas are')
    expect(src).not.toContain('English A1–B1 lemmas are')
    expect(src).not.toContain('CC0')
    expect(src).not.toContain('A1–B1 only')
  })
})

describe('About build SHA footer (gh-166)', () => {
  test('footer bakes SHA via constant; middle-dot mono format; no fetch', async () => {
    const src = await pageSrc('About.tsx')
    expect(src).toContain("t('about.builtBy')")
    expect(UI_COPY.en['about.builtBy']).toBe('Built by Mistral AI ·')
    expect(src).toContain('/brand/mistral-mark.svg')
    expect(src).toContain('__HIATO_BUILD_SHA__')
    expect(src).toContain('font-mono')
    expect(src).not.toMatch(/Built by Mistral AI ·\s*[0-9a-f]{7}/)
    expect(src).not.toMatch(/\bfetch\s*\(/)
    expect(src).not.toContain('api.github.com')
    const footer = src.slice(src.indexOf("t('about.builtBy')"))
    expect(footer).not.toContain('github.com')
    expect(footer).not.toContain('fetch')
  })
})

describe('Home pocket control (gh-85)', () => {
  test('Pocket (n) uses the stored slot, outline, and sits before nav', async () => {
    const src = await pageSrc('Home.tsx')
    expect(src).toContain('listPocketStored')
    expect(src).toContain("t('home.pocketDue',")
    expect(src).toContain('variant="outline"')
    expect(src).toContain('pocketCount > 0')
    expect(src).toContain("t('home.pocketCleared')")
    expect(UI_COPY.en['home.pocketCleared']).toBe('Pocket cleared')
    expect(src).toContain('tabIndex={-1}')
    const pocketAt = src.indexOf("t('home.pocketDue',")
    const navAt = src.indexOf('<nav')
    expect(pocketAt).toBeGreaterThan(src.indexOf('listPocketStored'))
    expect(navAt).toBeGreaterThan(pocketAt)
    expect(src).not.toContain('to="/pocket"')
    expect(src).not.toContain('Pocket (0)')
  })

  test('count is read from one midnight-broken getStreak during render, not a useState cache', async () => {
    const src = await pageSrc('Home.tsx')
    const streakAt = src.indexOf(
      'getStreak(selectedLang, selectedCefr, dateKey)',
    )
    const visibleAt = src.indexOf('visibleStreak(streakState, dateKey)', streakAt)
    const countAt = src.indexOf(
      'listPocketStored(selectedLang, selectedCefr)',
      streakAt,
    )
    const returnAt = src.indexOf('return (', streakAt)
    expect(streakAt).toBeGreaterThan(0)
    expect(visibleAt).toBeGreaterThan(streakAt)
    expect(countAt).toBeGreaterThan(visibleAt)
    expect(returnAt).toBeGreaterThan(countAt)
    expect(src).not.toContain('getStreakCount')
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

describe('Play EndCard Practice this word (gh-219 / ADR 0043)', () => {
  test('gated on shouldShowPractice; saves then opens pocket play immediately; no Save', async () => {
    const src = await pageSrc('Play.tsx')
    expect(src).toContain("from '@/lib/pocket-save'")
    expect(src).toContain('shouldShowPractice(mode, won)')
    expect(src).not.toContain('shouldShowPocketSave')
    expect(src).not.toContain('Save to pocket')
    expect(src).not.toContain('Already in pocket')
    expect(src).not.toContain('Confirm replace')
    expect(src).not.toContain('practiceNoteDelayMs')
    expect(src).not.toContain('pocketNewLabel')
    expect(src).not.toContain('View pocket')
    expect(src).toContain('needsReplaceOldestConfirm')
    expect(src).toContain('addToPocket({ lang, cefr, word, gloss })')
    expect(src).toContain('listPocketStored(lang, cefr)')
    expect(src).toContain("t('play.replaceTitle')")
    expect(src).toContain("t('play.replaceConfirm')")
    expect(UI_COPY.en['play.replaceTitle']).toBe('Replace oldest word?')
    expect(UI_COPY.en['play.replaceConfirm']).toBe('Replace and practice')
    expect(src).toContain('onClick={onSavePress}')
    expect(src).toMatch(/onClick=\{onSavePress\}[\s\S]*?>\s*\{t\('play\.practiceThisWord'\)\}\s*<\/Button>/)
    expect(src).toContain('pocketListLabel(oldest)')
    expect(src).toContain('pocketListLabel({ gloss })')
    expect(src).not.toContain('pocketConfirmLabel')
    expect(src).toContain('decideConfirmReCheck')
    expect(src).toContain('role="dialog"')
    expect(src).toContain('aria-modal="true"')
    expect(src).toContain("t('play.replaceBody'")
    expect(UI_COPY.en['play.replaceBody']).toContain('Pocket is full ({cap})')
    expect(src).toContain('oldest: oldestLabel ??')
    expect(src).toContain('word: pocketListLabel({ gloss }) ??')
    expect(UI_COPY.en['play.replaceBody']).toBe('Pocket is full ({cap}). “{oldest}” will be removed so you can practice “{word}”.')
    expect(src).toContain("state: { pocketNote: note }")
    expect(src).toContain('pocketRetryHref(pocketEntryId(lang, cefr, word), Date.now())')
    const endAt = src.indexOf('function EndCard(')
    expect(endAt).toBeGreaterThan(0)
    const endCard = src.slice(endAt)
    expect(endCard).not.toContain('setTimeout')
    expect(endCard).not.toContain('matchMedia')
    expect(endCard).not.toContain('Already saved')
    expect(endCard).not.toContain('Saved to pocket')
    const commitAt = src.indexOf('const commitSave = useCallback')
    const commitEnd = src.indexOf('}, [lang, cefr, word, gloss])', commitAt)
    expect(commitAt).toBeGreaterThan(0)
    expect(commitEnd).toBeGreaterThan(commitAt)
    const commitBody = src.slice(commitAt, commitEnd)
    expect(commitBody).toContain('addToPocket')
    expect(commitBody).toContain('if (!result.added && !result.duplicate) return false')
    expect(commitBody).toContain("return result.duplicate ? 'already' : 'saved'")
    expect(commitBody).not.toMatch(/recordDailyWin\s*\(/)
    expect(commitBody).not.toMatch(/setDailyRecord\s*\(/)
    const pressAt = src.indexOf('const onSavePress = useCallback')
    const pressEnd = src.indexOf(
      '}, [lang, cefr, word, commitSave, goPracticeWord, t])',
      pressAt,
    )
    expect(pressAt).toBeGreaterThan(commitEnd)
    expect(pressEnd).toBeGreaterThan(pressAt)
    const pressBody = src.slice(pressAt, pressEnd)
    const alreadyAt = pressBody.indexOf("goPracticeWord('already')")
    const saveAt = pressBody.indexOf('goPracticeWord(stored)')
    expect(alreadyAt).toBeGreaterThan(0)
    expect(saveAt).toBeGreaterThan(alreadyAt)
    expect(pressBody.slice(0, alreadyAt)).not.toContain('commitSave')
    expect(pressBody.slice(0, alreadyAt)).not.toContain('addToPocket')
    const confirmAt = src.indexOf('const onConfirmReplace = useCallback')
    const confirmEnd = src.indexOf(
      '}, [lang, cefr, word, snapshotOldestId, commitSave, goPracticeWord, t])',
      confirmAt,
    )
    expect(confirmAt).toBeGreaterThan(pressEnd)
    expect(confirmEnd).toBeGreaterThan(confirmAt)
    const confirmBody = src.slice(confirmAt, confirmEnd)
    const dupAt = confirmBody.indexOf("decision === 'duplicate'")
    const refreshAt = confirmBody.indexOf("decision === 'refresh'")
    expect(dupAt).toBeGreaterThan(0)
    expect(refreshAt).toBeGreaterThan(dupAt)
    const dupSlice = confirmBody.slice(dupAt, refreshAt)
    expect(dupSlice).toContain("goPracticeWord('already')")
    expect(dupSlice).not.toContain('commitSave')
    expect(dupSlice).not.toContain('addToPocket')
    const storedAt = confirmBody.indexOf('const stored = commitSave()')
    const bailAt = confirmBody.indexOf('if (!stored) return', storedAt)
    const openAt = confirmBody.indexOf('goPracticeWord(stored)', bailAt)
    expect(storedAt).toBeGreaterThan(refreshAt)
    expect(bailAt).toBeGreaterThan(storedAt)
    expect(openAt).toBeGreaterThan(bailAt)
    const playAt = src.indexOf('const goPracticeWord = useCallback')
    const playEnd = src.indexOf('[nav, lang, cefr, word],', playAt)
    expect(playAt).toBeGreaterThan(commitEnd)
    expect(playEnd).toBeGreaterThan(playAt)
    const playBody = src.slice(playAt, playEnd)
    expect(playBody).toContain('pocketRetryHref')
    expect(playBody).not.toContain('setTimeout')
    expect(playBody).not.toMatch(/recordDailyWin\s*\(/)
  })

  test('a second Practice tap does not navigate or save again', async () => {
    const src = await pageSrc('Play.tsx')
    const endAt = src.indexOf('function EndCard(')
    expect(endAt).toBeGreaterThan(0)
    const endCard = src.slice(endAt)
    expect(endCard).toContain('const leavingRef = useRef(false)')
    const playAt = endCard.indexOf('const goPracticeWord = useCallback')
    const playEnd = endCard.indexOf('[nav, lang, cefr, word],', playAt)
    const playBody = endCard.slice(playAt, playEnd)
    const guardAt = playBody.indexOf('if (leavingRef.current) return')
    const setAt = playBody.indexOf('leavingRef.current = true')
    const navAt = playBody.indexOf('nav(')
    expect(guardAt).toBeGreaterThan(0)
    expect(setAt).toBeGreaterThan(guardAt)
    expect(navAt).toBeGreaterThan(setAt)
    const handlers = [
      [
        'const onSavePress = useCallback',
        '}, [lang, cefr, word, commitSave, goPracticeWord, t])',
      ],
      [
        'const onConfirmReplace = useCallback',
        '}, [lang, cefr, word, snapshotOldestId, commitSave, goPracticeWord, t])',
      ],
    ] as const
    for (const [start, end] of handlers) {
      const at = endCard.indexOf(start)
      const stop = endCard.indexOf(end, at)
      expect(at).toBeGreaterThan(0)
      expect(stop).toBeGreaterThan(at)
      const body = endCard.slice(at, stop)
      const bailAt = body.indexOf('if (leavingRef.current) return')
      expect(bailAt).toBeGreaterThan(0)
      const before = body.slice(0, bailAt)
      for (const write of [
        'commitSave',
        'addToPocket',
        'setSavePhase',
        'setOldestLabel',
        'setSnapshotOldestId',
        'goPracticeWord',
      ]) {
        expect(before).not.toContain(write)
      }
      // First tap still saves, then navigates. addToPocket lives in commitSave.
      expect(body.indexOf('commitSave', bailAt)).toBeGreaterThan(bailAt)
      expect(body.indexOf('goPracticeWord', bailAt)).toBeGreaterThan(bailAt)
    }
  })

  test('pocket play shows the router note once, then clears it', async () => {
    const src = await pageSrc('Play.tsx')
    expect(src).toContain('pocketNoteFromState(location.state)')
    expect(src).toContain("mode === 'pocket'")
    expect(src).toContain('replace: true, state: null')
    expect(src).toContain('pocketNoteRef.current?.focus()')
    expect(src).toContain('tabIndex={-1}')
    expect(src).toContain("t('play.noteAlready')")
    expect(UI_COPY.en['play.noteAlready']).toBe('Already saved')
    expect(UI_COPY.en['play.noteSaved']).toBe('Saved to pocket')
    const noteAt = src.indexOf("t('play.noteAlready')")
    const livesAt = src.indexOf('<Lives remaining={lives}', noteAt)
    expect(noteAt).toBeGreaterThan(0)
    expect(livesAt).toBeGreaterThan(noteAt)
    const roundAt = src.indexOf('function PlayRound(')
    const endAt = src.indexOf('function EndCard(', roundAt)
    const round = src.slice(roundAt, endAt)
    expect(round).toContain("t('play.noteSaved')")
    expect(round).toContain('role="status"')
    expect(round).not.toContain('Already saved')
    expect(round).not.toContain('Saved to pocket')
    const clearAt = round.indexOf('if (!incomingNote) return')
    const clearEnd = round.indexOf(
      '}, [incomingNote, location.pathname, location.search, nav])',
      clearAt,
    )
    expect(clearAt).toBeGreaterThan(0)
    expect(clearEnd).toBeGreaterThan(clearAt)
    expect(round.slice(clearAt, clearEnd)).not.toMatch(/recordDailyWin\s*\(/)
  })

  test('pocket play says the streak is unaffected', async () => {
    const src = await pageSrc('Play.tsx')
    expect(src).toContain("t('play.practiceNote')")
    expect(UI_COPY.en['play.practiceNote']).toBe('Practice · your streak isn’t affected')
    expect(UI_COPY.en['play.practiceNote']).not.toContain("isn't")
    const roundAt = src.indexOf('function PlayRound(')
    const endAt = src.indexOf('function EndCard(', roundAt)
    const round = src.slice(roundAt, endAt)
    const lineAt = round.indexOf("t('play.practiceNote')")
    expect(lineAt).toBeGreaterThan(0)
    const gateAt = round.lastIndexOf("mode === 'pocket'", lineAt)
    expect(gateAt).toBeGreaterThan(0)
    const gate = round.slice(gateAt, lineAt)
    expect(gate).toContain('text-ink-muted')
    expect(gate).not.toContain("mode === 'daily'")
    expect(gate).not.toContain("mode === 'practice'")
    expect(src.slice(endAt)).not.toContain("t('play.practiceNote')")
    const noteAt = round.indexOf("t('play.noteAlready')")
    const livesAt = round.indexOf('<Lives remaining={lives}', lineAt)
    expect(noteAt).toBeGreaterThan(0)
    expect(noteAt).toBeLessThan(lineAt)
    expect(livesAt).toBeGreaterThan(lineAt)
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
      'inline-flex items-center bg-cream-dark px-2.5 py-1 text-[13px] font-medium text-ink'
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

    const teach = await Bun.file(
      new URL('../components/play/LemmaTeach.tsx', import.meta.url),
    ).text()
    expect(endCard).toContain('<LemmaTeach')
    expect(endCard).toContain('gloss={teachGloss}')
    expect(endCard).toContain('synonyms={teachSynonyms}')

    // Gloss is teach headline (larger / ink) — not muted buried chip
    expect(teach).toContain(
      'className="mt-1.5 text-lg font-semibold leading-snug text-ink"',
    )
    expect(teach).toContain('{gloss}')
    // Old buried gloss chip must not remain
    expect(endCard).not.toContain(
      'mt-2 text-[13px] leading-relaxed text-ink-muted">{gloss}',
    )
    expect(teach).not.toContain(
      'mt-2 text-[13px] leading-relaxed text-ink-muted">{gloss}',
    )

    // Lemma revealed but not sole hero when gloss present (demoted vs text-lg font-semibold)
    expect(teach).toContain('text-pixel-display tracking-[0.06em] text-ink')
    expect(teach).toContain("t('teach.theWordWas')")
    expect(UI_COPY.en['teach.theWordWas']).toBe('The word was')
    expect(teach).toContain('{word}')

    // Synonym chips match mid-round LearnerHint ink (Avery cross-surface hierarchy);
    // #402: chip-synonym class carries the CRT dark-mode surface lift + hairline.
    expect(teach).toContain(
      'chip-synonym inline-flex items-center px-2.5 py-1 text-[13px] font-medium text-ink',
    )
    expect(teach).not.toContain('bg-cream-dark px-2.5 py-1 text-[13px] font-medium text-ink-muted')
    const css = await Bun.file(new URL('../index.css', import.meta.url)).text()
    expect(css).toContain('.chip-synonym')
    expect(css).toMatch(/@media \(prefers-color-scheme: dark\) \{[\s\S]*\.chip-synonym \{[\s\S]*color-mix\(in srgb, var\(--color-raised\) 92%, #ffffff 8%\)[\s\S]*border: 1px solid color-mix\(in srgb, var\(--color-line\) 60%, transparent\)/)
    expect(teach).toContain('synonyms.map')

    // Silent omit: trim empty gloss; no NO_HINT_COPY / faint placeholder in teach panel
    expect(teach).toContain('{gloss ? (')
    expect(endCard).not.toContain('NO_HINT_COPY')
    expect(teach).not.toContain('NO_HINT_COPY')
    expect(endCard).not.toMatch(/No hint|no hint available|Add a gloss/i)
    const panelStart = endCard.indexOf('data-endcard-teach')
    const panelEnd = endCard.indexOf("{mode !== 'practice' ? (", panelStart)
    expect(panelStart).toBeGreaterThan(0)
    expect(panelEnd).toBeGreaterThan(panelStart)
    const teachPanel = endCard.slice(panelStart, panelEnd)
    // #402: sparks frame only the teach card; outcome badge is an h2; the
    // practice no-streak line folds into the teach panel footer.
    expect(teachPanel).toContain('px-spark')
    expect(teachPanel).toContain('<h2>')
    expect(teachPanel).toContain('data-endcard-badge')
    expect(teachPanel).toContain("t('play.practiceNoStreak')")
    expect(teachPanel).not.toContain('NO_HINT_COPY')
    expect(teachPanel).toContain('{teachGloss}')
    expect(teachPanel).toContain('teachSynonyms')
    // the DE-A1 stats Card renders for Daily/Pocket only, never Practice
    expect(endCard).toContain("{mode !== 'practice' ? (")
    expect(endCard).toContain('<Card className="px-flat w-full p-2.5 text-left')

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
    expect(src).toContain("t('play.removeFromPocket')")
    expect(UI_COPY.en['play.removeFromPocket']).toBe('Remove from pocket')
    expect(src).toContain(
      '/play?mode=pocket&id=${encodeURIComponent(pocketId)}&seed=${Date.now()}',
    )
    expect(src).toContain("t('play.pocketLinkInvalid')")
    expect(UI_COPY.en['play.pocketLinkInvalid']).toBe('This pocket link isn’t valid.')
    expect(src).toContain("t('play.pocketDailyWon')")
    expect(UI_COPY.en['play.pocketDailyWon']).toContain('already won — pocket retry waits until tomorrow')
    expect(src).toContain("t('play.pocketNote')")
    expect(UI_COPY.en['play.pocketNote']).toBe('Pocket doesn’t affect your streak')
    expect(src).toContain('setActivePocketId(null)')
    const pocketBranch = src.indexOf("if (mode === 'pocket') {")
    const repairAt = src.indexOf('repairPocket()', pocketBranch)
    const listAt = src.indexOf('listPocketStored(lang, cefr)', pocketBranch)
    expect(pocketBranch).toBeGreaterThan(0)
    expect(repairAt).toBeGreaterThan(pocketBranch)
    expect(listAt).toBeGreaterThan(repairAt)
    const endAt = src.indexOf('const endGame = useCallback')
    const endDeps = src.indexOf(
      '[mode, persistDaily, recordRound, activePocketId, pocketWasDue, pocketStage, lang, cefr]',
      endAt,
    )
    expect(endAt).toBeGreaterThan(0)
    expect(endDeps).toBeGreaterThan(endAt)
    const endBody = src.slice(endAt, endDeps)
    expect(endBody).toContain("mode === 'pocket'")
    expect(endBody).toContain('removeFromPocket')
    expect(endBody).toContain('reschedulePocketEntry')
    expect(endBody).not.toMatch(/recordDailyWin\s*\(/)
  })

  test('replace confirm does not open pocket play or the pocket sheet', async () => {
    const src = await pageSrc('Play.tsx')
    const start = src.indexOf('confirming ? (')
    const end = src.indexOf(') : (', start)
    expect(start).toBeGreaterThan(0)
    expect(end).toBeGreaterThan(start)
    const confirmingSlice = src.slice(start, end)
    expect(confirmingSlice).not.toContain('View pocket')
    expect(confirmingSlice).not.toContain('PocketSheet')
    expect(confirmingSlice).not.toContain('goPracticeWord')
    expect(src).not.toContain('View pocket')
    expect(src).not.toContain('<PocketSheet')
    expect(src).toContain("mode !== 'pocket'")
    expect(src).toContain('pocketRetryHref(pocketEntryId(lang, cefr, word), Date.now())')
  })
})

describe('Pocket spaced review copy (gh-220 / ADR 0044)', () => {
  test('Home labels a due slot and keeps Pocket (n) otherwise', async () => {
    const src = await pageSrc('Home.tsx')
    expect(src).toContain("t('home.pocketDue', { count: pocketCount, due: pocketDue })")
    expect(src).toContain("t('home.pocketCount', { count: pocketCount })")
    expect(src).toContain("t('home.pocketDueAria'")
    expect(UI_COPY.en['home.pocketDue']).toBe('Pocket ({count} · {due} due)')
    expect(UI_COPY.en['home.pocketCount']).toBe('Pocket ({count})')
    expect(UI_COPY.en['home.pocketDueAria']).toBe('Pocket, {count} {wordsWord}, {due} due for review')
    expect(src).toContain('pocketDue > 0')
    expect(src).toContain('variant="outline"')
    const dueLabel = src.indexOf("t('home.pocketDue',")
    const plainLabel = src.indexOf("t('home.pocketCount',")
    expect(plainLabel).toBeGreaterThan(dueLabel)
  })

  test('sheet subtitle, Due badge, captions and Review due words match', async () => {
    const src = await Bun.file(
      new URL('../components/PocketSheet.tsx', import.meta.url),
    ).text()
    expect(src).toContain("t('pocket.dueSummary'")
    expect(src).toContain("t('pocket.noneDue'")
    expect(UI_COPY.en['pocket.dueSummary']).toContain('due today. Spelling stays hidden.')
    expect(UI_COPY.en['pocket.noneDue']).toContain('Nothing due today. Next review')
    expect(src).toContain('tone="accent"')
    expect(src).toContain("{t('pocket.due')}")
    expect(UI_COPY.en['pocket.due']).toBe('Due')
    expect(src).not.toContain('tone="warm"')
    expect(src).toContain("t('pocket.nextReview', { when: whenLabel(entry.dueAt) })")
    expect(src).toContain("t('pocket.reviewDue', { count: playable.length })")
    expect(UI_COPY.en['pocket.nextReview']).toBe('Next review {when}')
    expect(UI_COPY.en['pocket.reviewDue']).toBe('Review due words ({count})')
    expect(src).toContain('data-pocket-review')
    expect(src).toContain('playable[0]')
    expect(src).toContain('aria-labelledby={')
    expect(src).toContain('pocket-sheet-retry-name')
    expect(src).not.toContain('failed')
  })

  test('Practice offer is opt-in and a pocket loss names the next review', async () => {
    const src = await pageSrc('Play.tsx')
    expect(src).toContain("t('play.reviewDueOne')")
    expect(src).toContain("t('play.reviewDueMany', { count: dueReview.count })")
    expect(UI_COPY.en['play.reviewDueOne']).toBe('Review 1 due pocket word')
    expect(UI_COPY.en['play.reviewDueMany']).toBe('Review {count} due pocket words')
    expect(src).toContain("mode === 'practice' && dueReview")
    expect(src).toContain("mode === 'practice' ? t('play.nextWord') : t('common.practice')")
    expect(src).toContain('pickPracticeLemma')
    const offerAt = src.indexOf("t('play.reviewDueOne')")
    const nextAt = src.indexOf("mode === 'practice' ? t('play.nextWord')")
    expect(offerAt).toBeGreaterThan(0)
    expect(nextAt).toBeGreaterThan(offerAt)
    expect(src).toContain("pocketWasDue ? t('play.backForReview') : t('play.nextReview')")
    expect(UI_COPY.en['play.backForReview']).toBe('Back for review')
    expect(UI_COPY.en['play.nextReview']).toBe('Next review')
    expect(src).toContain('nextReviewWhen(pocketSchedule.dueAt, reviewDay)')
    expect(src).toContain('t(reviewWhen.key, reviewWhen.params)')
    expect(src).toContain('const reviewDay = useLocalDateKey()')
    expect(src).toContain('role="status"')
    expect(src).toContain("t('play.pocketNote')")
    expect(src).toContain("t('play.practiceNote')")
    expect(src).toContain("t('play.pocketClearedSuffix')")
    expect(UI_COPY.en['play.pocketClearedSuffix']).toContain('cleared from pocket')
    const practicePick = src.indexOf('pickPracticeLemma(')
    const dueSet = src.indexOf('setDueReview(', practicePick)
    expect(dueSet).toBeGreaterThan(practicePick)
  })

  test('#402 EndCard CTA hierarchy per mode/outcome (ADR 0043 aligned)', async () => {
    const src = await pageSrc('Play.tsx')
    const actionsAt = src.indexOf('data-endcard-actions')
    const buttonBefore = (labelAt: number) => src.slice(src.lastIndexOf('<Button', labelAt), labelAt)
    // Daily loss: Pocket save (Practice this word) is the primary button.
    const saveLabel = src.indexOf("t('play.practiceThisWord')", actionsAt)
    expect(saveLabel).toBeGreaterThan(actionsAt)
    expect(buttonBefore(saveLabel)).not.toContain('variant=')
    // Share is primary only on a Daily/Pocket win; secondary on losses and in Practice.
    const shareLabel = src.indexOf("t('common.share')", actionsAt)
    expect(buttonBefore(shareLabel)).toContain("variant={won && mode !== 'practice' ? undefined : 'secondary'}")
    // Practice mode: Next word is primary; Daily keeps generic Practice secondary.
    const nextLabel = src.indexOf("mode === 'practice' ? t('play.nextWord')", actionsAt)
    expect(buttonBefore(nextLabel)).toContain("variant={mode === 'practice' ? undefined : 'secondary'}")
    // Pocket loss: Retry stays primary (no variant), Share secondary.
    const retryLabel = src.indexOf("t('common.retry')", actionsAt)
    expect(buttonBefore(retryLabel)).not.toContain('variant=')
    // Pocket save renders before Share; generic Practice stays below Share.
    const shareAt = src.indexOf('buildShareCardPayload', actionsAt)
    const practiceAt = src.indexOf('onClick={onPractice}', actionsAt)
    expect(saveLabel).toBeLessThan(shareAt)
    expect(shareAt).toBeLessThan(practiceAt)
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
    expect(src).toContain("t('language.readyOffline')")
    expect(UI_COPY.en['language.readyOffline']).toBe('✓ Ready offline')
    // #201 placement/visibility is covered behaviourally in InstallHelp.test.tsx
    expect(src).toContain("cachePhase === 'caching'")
    expect(src).toContain("t('language.caching')")
    expect(UI_COPY.en['language.caching']).toBe('Caching…')
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
    expect(src).toContain("t('install.title')")
    expect(src).toContain("t('install.body')")
    expect(UI_COPY.en['install.title']).toBe('Optional: install Hiato')
    expect(UI_COPY.en['install.body']).toContain('No store')
    expect(UI_COPY.en['install.body']).toContain('no account')
    expect(src).toContain('showModal')
    expect(src).toContain('min-h-11')
    expect(src).toContain('openerRef')
    expect(src).toContain('restoreFocusRef')
    expect(src).not.toMatch(/sign[- ]?in|account required|app store/i)
  })
})

describe('Play tiles / Reveal / vowel caption (gh-103)', () => {
  test('LetterGrid uses equal row helper; Keyboard tap height ≥44 via hit-slop; Practice Reveal; B1–C2 no vowel caption', async () => {
    const grid = await Bun.file(
      new URL('../components/play/LetterGrid.tsx', import.meta.url),
    ).text()
    expect(grid).toContain('letterGridRowLengths')
    expect(grid).toContain('data-letter-grid')
    expect(grid).toContain('data-letter-row')

    const kb = await Bun.file(
      new URL('../components/play/Keyboard.tsx', import.meta.url),
    ).text()
    // #138 supersedes #137's wrap-to-44: nowrap rows, flex-1 faces, ≥44 tap height via hit-slop (width = row share).
    expect(kb).not.toContain('flex-wrap')
    expect(kb).not.toContain('min-w-[44px]')
    expect(kb).toContain('flex-nowrap')
    expect(kb).toContain('min-w-0')
    expect(kb).toContain('flex-1')
    expect(kb).toContain('h-12 min-h-11')
    expect(kb).toContain('data-hit-slop')
    expect(kb).toContain('data-tap-min-h="44"')
    expect(kb).toContain('LETTER_PADS[lang]')
    const pads = await Bun.file(
      new URL('../lib/keyboards.ts', import.meta.url),
    ).text()
    for (const letter of ['ß', 'Ä', 'Ö', 'Ü'] as const) {
      expect(pads).toContain(`'${letter}'`)
    }
    expect(kb).toContain('keyUsesUppercaseFace(key)')
    expect(kb).toContain("'uppercase' : 'normal-case'")
    expect(kb).toContain('{key}')
    // German row holds ß; do not probe Spanish Ü for this face rule.
    const deAt = pads.indexOf('de:')
    const esAt = pads.indexOf('es:')
    expect(deAt).toBeGreaterThan(0)
    expect(esAt).toBeGreaterThan(deAt)
    const dePad = pads.slice(deAt, esAt)
    expect(dePad).toContain("'ß'")
    expect(dePad).not.toContain("'SS'")
    const esPadEnd = pads.indexOf('\n}', esAt)
    expect(esPadEnd).toBeGreaterThan(esAt)
    expect(pads.slice(esAt, esPadEnd)).not.toContain("'ß'")

    const src = await pageSrc('Play.tsx')
    expect(src).toContain('data-reveal-word')
    expect(src).toContain("t('play.reveal')")
    expect(UI_COPY.en['play.reveal']).toBe('Reveal word')
    expect(src).toContain('function onReveal()')
    expect(src).toContain("mode !== 'practice'")
    expect(src).toContain('revealAllCells')
    // Vowel caption only when vowelHelp (A1/A2)
    expect(src).toContain("const vowelHelp = cefr === 'a1' || cefr === 'a2'")
    expect(src).toContain('vowelHelp && cells.some')
    expect(src).toContain("t('play.vowelHelp')")
    expect(UI_COPY.en['play.vowelHelp']).toBe('Soft green = vowel help (A1–A2)')
    expect(src).toContain('text-ink-muted')
    expect(src).toContain("aria-label={t('play.revealAria')}")
    expect(UI_COPY.en['play.revealAria']).toBe('Reveal word and end this practice round')
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
    const teach = await Bun.file(
      new URL('../components/play/LemmaTeach.tsx', import.meta.url),
    ).text()
    expect(teach).toContain('text-lg font-semibold leading-snug text-ink')
    expect(endCard).toContain('{teachGloss}')
    expect(teach).toContain("t('teach.theWordWas')")
    expect(endCard).not.toContain('<LearnerHint')
    // Warning #1: Reveal → "Word revealed"; lives → "Out of lives"
    expect(endCard).toContain("revealed ? t('play.wordRevealed') : t('play.outOfLives')")
    expect(UI_COPY.en['play.wordRevealed']).toBe('Word revealed')
    expect(UI_COPY.en['play.outOfLives']).toBe('Out of lives')
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

    const teach = await Bun.file(
      new URL('../components/play/LemmaTeach.tsx', import.meta.url),
    ).text()
    expect(src).toContain("from '@/lib/speech'")
    expect(teach).toContain('data-endcard-speak')
    expect(teach).toContain('speakLemma(word, lang)')
    expect(teach).toContain('speakLemmaAriaLabel(lang)')
    expect(teach).toContain('min-h-11')
    expect(teach).toContain('min-w-11')

    // Daily + practice only — not pocket
    expect(endCard).toContain(
      "const speakSurface = mode === 'daily' || mode === 'practice'",
    )
    expect(endCard).toContain('showSpeakControl = speakSurface && speechOk')
    expect(endCard).toContain('subscribeSpeechAvailability(lang, setSpeechOk)')

    // No auto-play. The only speakLemma call is inside the button's own
    // native click listener. iOS drops speak() from pointerup, so that
    // event must not speak and must not swallow the click. React onClick
    // on this button would double-fire, so the control must not set onClick.
    expect(teach).toContain('speakLemma(word, lang)')
    expect(teach.split('speakLemma(').length - 1).toBe(1)
    expect(endCard).not.toContain('speakLemma(')
    expect(teach).not.toContain("addEventListener('pointerup'")
    expect(teach).toContain("addEventListener('click', onClick)")
    expect(teach).toContain("removeEventListener('click', onClick)")
    expect(teach).toContain('ref={speakBtnRef}')
    // Lemma only — not gloss. Options must not replace (word, lang).
    expect(teach).toMatch(/speakLemma\(\s*word\s*,\s*lang\s*\)/)
    expect(teach).not.toMatch(/speakLemma\(\s*gloss/)
    expect(teach).not.toMatch(/speakLemma\(\s*teachGloss/)
    const speakEffects: string[] = []
    const effectBodies = effectCallbackBodies(teach, 'useEffect')
    expect(effectBodies.length).toBeGreaterThan(0)
    for (const body of effectCallbackBodies(teach, 'useLayoutEffect')) {
      expect(body).not.toContain('speakLemma(')
    }
    for (const body of effectBodies) {
      if (!body.includes('speakLemma(')) continue
      speakEffects.push(body)
    }
    expect(speakEffects).toHaveLength(1)
    const speakEffect = speakEffects[0]!
    const lemmaCallAt = speakEffect.indexOf('speakLemma(')
    const clickFn = speakEffect.indexOf('const onClick')
    const addClick = speakEffect.indexOf("addEventListener('click'")
    expect(lemmaCallAt).toBeGreaterThan(-1)
    expect(clickFn).toBeGreaterThan(-1)
    expect(lemmaCallAt).toBeGreaterThan(clickFn)
    expect(addClick).toBeGreaterThan(lemmaCallAt)
    expect(speakEffect).not.toContain('pointerup')
    expect(speakEffect).not.toContain('spokeOnPointerUp')
    // speak() is synchronous in the handler. Nothing yields before it.
    const beforeSpeak = speakEffect.slice(0, lemmaCallAt)
    expect(beforeSpeak).not.toContain('await ')
    expect(beforeSpeak).not.toContain('setTimeout')
    expect(beforeSpeak).not.toContain('queueMicrotask')
    expect(speakEffect.split('speakLemma(').length - 1).toBe(1)
    // Timer false is allowed to paint the failure line, not only a same-turn false.
    expect(speakEffect).not.toContain('sameTurn')
    expect(speakEffect).not.toContain('queueMicrotask')
    expect(speakEffect).toContain('if (ok) return')
    expect(speakEffect).toContain("'failed'")
    expect(teach).toContain("t('teach.speakFailed')")
    expect(UI_COPY.en['teach.speakFailed']).toBe('Could not play the word.')
    // Registered, not invoked, when the effect runs.
    expect(speakEffect).not.toContain('onClick()')

    // ≥44px icon-only target; focus ring nearer 3:1 (not accent-fg/40 ~1.8:1)
    const btnAt = teach.indexOf('data-endcard-speak')
    const btn = teach.slice(btnAt, teach.indexOf('</button>', btnAt))
    expect(btn).toContain('min-h-11')
    expect(btn).toContain('min-w-11')
    expect(btn).not.toContain('focus-visible:outline-none')
    expect(btn).toContain('focus-visible:bg-accent-soft')
    expect(btn).toContain('active:bg-cream-dark')
    expect(btn).toContain('data-speaking=')
    expect(btn).not.toContain('onClick')
    expect(btn).not.toMatch(/>\s*[A-Za-zÀ-ÿ]{2,}/)
    expect(btn).not.toMatch(/Stop|voice picker|autoplay/i)

    // Control sits next to the revealed lemma
    const wordAt = teach.indexOf('{word}')
    const speakAt = teach.indexOf('data-endcard-speak')
    expect(wordAt).toBeGreaterThan(0)
    expect(speakAt).toBeGreaterThan(wordAt)
    expect(speakAt - wordAt).toBeLessThan(400)

    // iOS routes Web Speech through the Silent switch, and the page cannot
    // read that switch. The hint sits with the speaker, not on unsupported
    // browsers where the control is hidden.
    expect(teach).toContain("t('teach.muteHelp')")
    expect(UI_COPY.en['teach.muteHelp']).toBe('If you hear nothing, the phone’s mute switch (Ring/Silent) mutes spoken words.')
    expect(teach).not.toContain(
      'If you hear nothing, the Silent switch mutes spoken words.',
    )
    expect(teach).not.toContain('the Silent switch')
    const hintAt = teach.indexOf("t('teach.muteHelp')")
    const showSpeakAt = teach.lastIndexOf('showSpeak ? (', hintAt)
    expect(showSpeakAt).toBeGreaterThan(speakAt)
    expect(hintAt - showSpeakAt).toBeLessThan(250)
  })

  test('HTW-i18n-a11y (#117): aria-label via speakLemmaAriaLabel / SPEAK_LEMMA_ARIA', async () => {
    const src = await Bun.file(
      new URL('../components/play/LemmaTeach.tsx', import.meta.url),
    ).text()
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

  test('HTW-prime-ios (#124): unlock skips EndCard speak; latch only on success', async () => {
    const src = await pageSrc('Play.tsx')
    // Capture pointerdown unlocks earlier gestures only — never the speak button.
    expect(src).toContain("addEventListener('pointerdown', onPointerDown, true)")
    expect(src).toContain("closest('[data-endcard-speak]')")
    expect(src).toContain('unlockSpeechGesture()')
    // Order lock: closest check BEFORE unlockSpeechGesture (Avery Warning 2).
    const skipAt = src.indexOf("closest('[data-endcard-speak]')")
    expect(skipAt).toBeGreaterThan(0)
    const latchAt = src.indexOf('if (unlockSpeechGesture())')
    expect(latchAt).toBeGreaterThan(skipAt)
    const skipArm = src.slice(skipAt, latchAt)
    // Speak tap must not touch speechSynthesis before speak().
    expect(skipArm).not.toContain('primeSpeechVoices()')
    expect(skipArm).not.toContain('speechSynthesis')
    expect(skipArm).not.toContain('unlockSpeechGesture()')
    // Speak-button path returns before unlock. Earlier taps still prime.
    expect(skipArm).toContain('return')
    expect(src.slice(latchAt)).toContain('primeSpeechVoices()')
    // Latch Play ref only after unlock returns true (retry on failure).
    expect(src).toContain('if (unlockSpeechGesture())')
    expect(src).toContain('speechGestureRef.current = true')
    const earlyLatch = src.indexOf('speechGestureRef.current = true')
    // Must not latch before the unlock call.
    expect(earlyLatch).toBeGreaterThan(latchAt)
    // EndCard click path remains speakLemma only — no unlock/cancel there.
    const endCard = src.slice(src.indexOf('function EndCard('))
    const teach = await Bun.file(
      new URL('../components/play/LemmaTeach.tsx', import.meta.url),
    ).text()
    expect(teach).toContain('speakLemma(word, lang)')
    expect(teach).not.toContain('unlockSpeechGesture')
    expect(teach.split('speakLemma(').length - 1).toBe(1)
    expect(endCard).not.toContain('speakLemma(')
    expect(endCard).not.toContain('unlockSpeechGesture')
  })

  test('HTW-tests (#118): hide when unsupported; utterance is lemma; win and lose share control', async () => {
    const src = await pageSrc('Play.tsx')
    const endCard = src.slice(src.indexOf('function EndCard('))
    const teach = await Bun.file(
      new URL('../components/play/LemmaTeach.tsx', import.meta.url),
    ).text()

    // Hidden when speech unsupported / no usable voice
    expect(endCard).toContain('showSpeakControl')
    expect(endCard).toContain('showSpeak={showSpeakControl}')
    expect(endCard).toContain('subscribeSpeechAvailability')

    // Speaks lemma (`word`) only — not gloss
    expect(teach).toContain('speakLemma(word, lang)')
    expect(teach).not.toMatch(/speakLemma\(\s*gloss/)
    expect(teach).not.toMatch(/speakLemma\(\s*teachGloss/)

    // Same EndCard for win and lose — speak gate is mode-based, not won-based
    expect(endCard).toContain("mode === 'daily' || mode === 'practice'")
    expect(endCard).not.toMatch(/showSpeakControl.*won/)
    expect(endCard).not.toMatch(/speakSurface.*won/)
  })
})

describe('PwaPrompt stays off play (#132)', () => {
  test('play routes do not paint or focus Update; Later and Update stay', async () => {
    const prompt = await Bun.file(
      new URL('../components/PwaPrompt.tsx', import.meta.url),
    ).text()
    expect(prompt).toContain("pathname === '/play'")
    expect(prompt).toContain("pathname.startsWith('/play/')")
    expect(prompt).toContain('if (onPlay || !needRefresh || dismissed) return null')
    expect(prompt).toContain('if (onPlay || !needRefresh || dismissed) return')
    const focusAt = prompt.indexOf('updateBtnRef.current?.focus()')
    expect(focusAt).toBeGreaterThan(0)
    const focusGuard = prompt.slice(focusAt - 180, focusAt)
    expect(focusGuard).toContain('onPlay')
    expect(focusGuard).toContain('return')
    expect(prompt).toContain('updateServiceWorker(true)')
    expect(prompt).toContain('setDismissed(true)')
    expect(prompt).toContain("t('pwa.ready')")
    expect(UI_COPY.en['pwa.ready']).toBe('A new version is ready.')
    expect(prompt).toContain("t('pwa.later')")
    expect(UI_COPY.en['pwa.later']).toBe('Later')

    const app = await Bun.file(new URL('../App.tsx', import.meta.url)).text()
    expect(app).toContain('<PwaPrompt />')
    expect(app).toContain('<Route path="/play" element={<Play />} />')
    // Prompt stays mounted (SW registration unchanged) and gates itself.
    expect(app).not.toContain('pathname')
  })
})

describe('Unfinished daily Home exit (#133)', () => {
  test('quiet Home link does not finish or abandon the daily', async () => {
    const src = await pageSrc('Play.tsx')
    const start = src.indexOf("{!finished && mode === 'daily' && (")
    const end = src.indexOf("{!finished && mode === 'practice' && (", start)
    expect(start).toBeGreaterThan(0)
    expect(end).toBeGreaterThan(start)
    const daily = src.slice(start, end)
    expect(daily).toContain("{t('common.home')}")
    expect(UI_COPY.en['common.home']).toBe('← Home')
    expect(daily).toContain('to="/"')
    expect(daily).toContain("{t('common.practice')}")
    expect(daily).toContain('min-h-11')
    expect(daily).not.toContain('endGame')
    expect(daily).not.toContain('persistDaily')
    expect(daily).not.toContain('setDailyRecord')
    expect(daily).not.toContain('recordDailyWin')
    expect(daily).not.toContain('abandon')
    const homeLink = daily.slice(daily.indexOf('<Link'), daily.indexOf("{t('common.home')}"))
    expect(homeLink).toContain('to="/"')
    expect(homeLink).not.toContain('onClick')
    expect(homeLink).not.toContain('endGame')
    // Practice and pocket exits stay
    expect(src).toContain("{t('common.dailyLink')}")
    expect(UI_COPY.en['common.dailyLink']).toBe('← Daily')
    expect(src).toContain('to="/play?mode=daily"')
    const pocket = src.indexOf("{!finished && mode === 'pocket' && (")
    expect(src.slice(pocket, pocket + 400)).toContain("{t('common.home')}")
  })
})

describe('Share copy confirmation (#135)', () => {
  test('successful copyShareText sets the Copy text button to Copied', async () => {
    const src = await pageSrc('Share.tsx')
    expect(src).toContain("useState<UiKey>('share.copyText')")
    expect(src).toContain('{t(copyLabel)}')
    const fnAt = src.indexOf('async function onCopyText')
    expect(fnAt).toBeGreaterThan(0)
    const fn = src.slice(fnAt, src.indexOf('if (!payload) {', fnAt))
    expect(fn).toContain('copyShareText(payload)')
    expect(fn).toContain("result.ok && result.method === 'clipboard'")
    expect(fn).toContain("setCopyLabel('share.copied')")
    expect(fn).toContain("setCopyLabel('share.copyText')")
    expect(fn).toContain("result.method === 'cancelled'")
    expect(fn).toContain('show(t(result.messageKey, result.messageParams))')
    expect(fn).toContain('3000')
    expect(src).toContain('shareResult(payload)')
    expect(src).not.toContain('formatShareText')
    const actions = await Bun.file(
      new URL('../lib/share-actions.ts', import.meta.url),
    ).text()
    expect(actions).toContain("messageKey: 'share.copied'")
    expect(actions).toContain("messageKey: 'share.outcomeCouldNotCopy'")
    expect(UI_COPY.en['share.copied']).toBe('Copied')
    expect(UI_COPY.en['share.outcomeCouldNotCopy']).toBe('Couldn’t copy')
  })

  test('success then failure before 3000ms leaves the label not Copied', async () => {
    const src = await pageSrc('Share.tsx')
    const fnAt = src.indexOf('async function onCopyText')
    const fn = src.slice(fnAt, src.indexOf('if (!payload) {', fnAt))
    // Success arm
    const okArm = fn.slice(
      fn.indexOf("result.ok && result.method === 'clipboard'"),
      fn.indexOf('else if'),
    )
    expect(okArm).toContain("setCopyLabel('share.copied')")
    expect(okArm).toContain('window.clearTimeout(copyReset.current)')
    expect(okArm).toContain('window.setTimeout')
    expect(okArm).toContain('3000')
    // Failure arm (ok:false / non-cancel) clears timer + label immediately
    const failArm = fn.slice(fn.indexOf('else if'), fn.indexOf("result.method === 'cancelled'"))
    expect(failArm).toContain("result.method !== 'cancelled'")
    expect(failArm).toContain('window.clearTimeout(copyReset.current)')
    expect(failArm).toContain("setCopyLabel('share.copyText')")
    expect(failArm).not.toContain("setCopyLabel('share.copied')")
    // catch also clears
    const catchArm = fn.slice(fn.indexOf('} catch {'))
    expect(catchArm).toContain('window.clearTimeout(copyReset.current)')
    expect(catchArm).toContain("setCopyLabel('share.copyText')")
    // Unmount clears any open timer (same cleanup as the alive ref).
    const effect = src.slice(src.indexOf('useEffect('), src.indexOf('const show'))
    expect(effect).toContain('alive.current = false')
    expect(effect).toContain('window.clearTimeout(copyReset.current)')
    // Simulate success→failure label transitions (no DOM harness)
    let label = 'Copy text'
    label = 'Copied' // success
    expect(label).toBe('Copied')
    label = 'Copy text' // failure before 3000ms
    expect(label).not.toBe('Copied')
    expect(label).toBe('Copy text')
  })
})

describe('Share invite-to-play CTA (#226 / #274, ADR 0036 amendment)', () => {
  test('CTA is gated on a cold open and rendered first in the action stack', async () => {
    const src = await pageSrc('Share.tsx')
    expect(src).toContain(
      "import { acceptDailyInvite, dailyInviteTarget } from '@/lib/invite'",
    )
    expect(src).toContain(
      'const invite = loc.state == null && payload ? dailyInviteTarget(payload) : null',
    )
    // #400: actions render in normal flow below the card, never in a sticky footer.
    expect(src).not.toContain('footer={')
    const actionsAt = src.indexOf('data-share-actions')
    expect(actionsAt).toBeGreaterThan(-1)
    const gateAt = src.indexOf('{invite ? (', actionsAt)
    expect(gateAt).toBeGreaterThan(actionsAt)
    // Existing Share / Save image / Copy text (+ Home) stay below the CTA.
    const shareBtnAt = src.indexOf('shareResult(payload)', gateAt)
    expect(shareBtnAt).toBeGreaterThan(gateAt)
    expect(src.indexOf('downloadShareCard(payload)', shareBtnAt)).toBeGreaterThan(shareBtnAt)
    expect(src.indexOf('onCopyText()', shareBtnAt)).toBeGreaterThan(shareBtnAt)
    expect(src.indexOf("nav('/')", shareBtnAt)).toBeGreaterThan(shareBtnAt)
  })

  test('CTA label, busy label, and disabled/aria-busy wiring', async () => {
    const src = await pageSrc('Share.tsx')
    expect(src).toContain("t('share.playDailyInvite'")
    expect(UI_COPY.en['share.playDailyInvite']).toBe('Play today’s Daily · {lang} {cefr}')
    expect(src).toContain("t('common.preparing')")
    expect(UI_COPY.en['common.preparing']).toBe('Preparing packs…')
    expect(src).toContain('disabled={busy || preparing}')
    expect(src).toContain('aria-busy={preparing}')
    expect(src).toContain('onClick={() => void onPlayDaily()}')
    // One primary action: Share drops to secondary only while the CTA shows.
    expect(src).toContain("variant={invite ? 'secondary' : undefined}")
  })

  test('tap runs acceptDailyInvite; success navigates, failure shows role=alert and stays', async () => {
    const src = await pageSrc('Share.tsx')
    const fnAt = src.indexOf('async function onPlayDaily')
    expect(fnAt).toBeGreaterThan(0)
    const fn = src.slice(fnAt, src.indexOf('if (!payload) {', fnAt))
    expect(fn).toContain('await acceptDailyInvite(invite, () => alive.current)')
    const aliveAt = fn.indexOf('if (!alive.current) return')
    const failAt = fn.indexOf('if (!ok)')
    const navAt = fn.indexOf("nav('/play?mode=daily')")
    expect(aliveAt).toBeGreaterThan(-1)
    expect(failAt).toBeGreaterThan(aliveAt)
    expect(navAt).toBeGreaterThan(failAt)
    expect(fn).toContain('if (alive.current) setPreparing(false)')
    expect(fn).toContain('setInviteError(fail)')
    expect(src).toContain("t('share.inviteFail'")
    expect(UI_COPY.en['share.inviteFail']).toContain('Could not load the {lang} {cefr} pack.')
    // Inline alert sits above the CTA inside the same action-stack gate.
    const gateAt = src.indexOf('{invite ? (')
    const alertAt = src.indexOf('role="alert"', gateAt)
    expect(alertAt).toBeGreaterThan(gateAt)
    expect(alertAt).toBeLessThan(src.indexOf('aria-busy={preparing}'))
    // Prefs are written only inside acceptDailyInvite (invite.ts), never on the page.
    expect(src).not.toContain('setPrefs')
  })

  test('in-app Share (location.state set) keeps Share primary and hides the invite CTA', () => {
    const payload = buildShareCardPayload({
      lang: 'en',
      cefr: 'a1',
      streak: 4,
      dateKey: '2026-11-13',
      word: 'BANANA',
      won: true,
      mode: 'daily',
    })
    const href = sharePathWithToken(payload)
    const q = href.indexOf('?')
    const markup = (state: typeof payload | null) =>
      renderToStaticMarkup(
        createElement(
          MemoryRouter,
          {
            initialEntries: [
              { pathname: href.slice(0, q), search: href.slice(q), state },
            ],
          },
          createElement(Share),
        ),
      )
    const buttonClass = (html: string, label: string) => {
      const end = html.indexOf(`>${label}<`)
      expect(end).toBeGreaterThan(-1)
      return html.slice(html.lastIndexOf('<button', end), end)
    }

    const inApp = markup(payload)
    expect(inApp).not.toContain('Play today')
    expect(buttonClass(inApp, 'Share')).toContain('bg-accent text-white')

    const cold = markup(null)
    expect(cold).toContain('Play today')
    expect(buttonClass(cold, 'Share')).toContain('border-2 border-accent-fg')
  })
})

describe('Pocket sheet Close (#136)', () => {
  test('visible Close calls onClose and does not remove pocket entries', async () => {
    const src = await Bun.file(
      new URL('../components/PocketSheet.tsx', import.meta.url),
    ).text()
    const closeAt = src.indexOf("{t('common.close')}\n          </Button>")
    expect(closeAt).toBeGreaterThan(0)
    const control = src.slice(closeAt - 280, closeAt)
    expect(control).toContain('onClick={onClose}')
    expect(control).toContain('min-h-11')
    expect(control).toContain('min-w-11')
    expect(control).not.toContain('removeFromPocket')
    expect(src).toContain('onCancel')
    expect(src).toContain('event.target === event.currentTarget')
  })
})

describe('Home and in-round 44px text links (#136)', () => {
  test('Change language, About, and in-round links use min-h-11', async () => {
    const home = await pageSrc('Home.tsx')
    const navAt = home.indexOf('<nav')
    const nav = home.slice(navAt, home.indexOf('</nav>', navAt))
    expect(nav).toContain("t('home.changeLanguage')")
    expect(nav).toContain("t('home.about')")
    expect(UI_COPY.en['home.changeLanguage']).toBe('Change language')
    expect(UI_COPY.en['home.about']).toBe('About')
    expect(nav.match(/min-h-11/g)?.length).toBe(2)
    expect(nav).not.toContain('focus-visible:outline-none')
    expect(nav).toContain('underline decoration-2')

    const play = await pageSrc('Play.tsx')
    const revealAt = play.indexOf('data-reveal-word')
    expect(revealAt).toBeGreaterThan(0)
    const revealClass = play.slice(revealAt, play.indexOf('</button>', revealAt))
    expect(revealClass).not.toContain('focus-visible:outline-none')
    expect(revealClass).toContain('underline decoration-2')
    for (const label of ["{t('common.home')}", "{t('common.practice')}", "{t('common.dailyLink')}", "t('play.nextWord')"] as const) {
      const at = play.indexOf(label)
      expect(at).toBeGreaterThan(0)
      const around = play.slice(Math.max(0, at - 320), at)
      expect(around).toContain('min-h-11')
      expect(around).not.toContain('focus-visible:outline-none')
    }
    // Pocket Close focus order unchanged
    const pocket = await Bun.file(
      new URL('../components/PocketSheet.tsx', import.meta.url),
    ).text()
    const closeAt = pocket.indexOf("{t('common.close')}\n          </Button>")
    expect(closeAt).toBeGreaterThan(0)
  })
})

describe('Letter pad: no-orphan rows + bottom thumb zone (#138)', () => {
  const kbSrc = () =>
    Bun.file(new URL('../components/play/Keyboard.tsx', import.meta.url)).text()

  test('letter rows are nowrap flex-1 cells; no wrap, no horizontal scroll', async () => {
    const kb = await kbSrc()
    expect(kb).not.toContain('flex-wrap')
    expect(kb).not.toContain('overflow-x-auto')
    expect(kb).not.toContain('overflow-x-scroll')
    expect(kb).toContain('overflow-hidden')
    expect(kb).toContain('flex w-full min-w-0 flex-nowrap justify-center')
    expect(kb).toContain('min-w-0 max-w-[calc(100%/var(--pad-cols))] flex-1 basis-0')
    expect(kb).not.toContain('shrink-0')
  })

  test('tap height ≥44 via hit-slop: invisible button cell, inset painted face', async () => {
    const kb = await kbSrc()
    // Button is the tap box: 48px tall (height floor ≥44; width = column share), edge-to-edge.
    expect(kb).toContain('data-hit-slop')
    expect(kb).toContain('data-tap-min-h="44"')
    expect(kb).toContain('h-12 min-h-11')
    expect(kb).toContain('px-[var(--pad-half-gap)] py-[3px]')
    // Focus ring lands on the painted face via index.css [data-hit-slop]:focus-visible .key-face
    expect(kb).not.toContain('group-focus-visible:ring')
    const css = await Bun.file(new URL('../index.css', import.meta.url)).text()
    expect(css).toContain('[data-hit-slop]:focus-visible .key-face')
    expect(css).toMatch(/:focus-visible\s*\{[^}]*outline:\s*3px solid var\(--color-focus\)/)
    // Painted face is the inner span keycap; colors live there, not on the button.
    const faceAt = kb.indexOf('<span')
    expect(faceAt).toBeGreaterThan(kb.indexOf('<button'))
    const face = kb.slice(faceAt, kb.indexOf('</span>', faceAt))
    expect(face).toContain('key-face')
    expect(face).toContain('bg-raised')
    expect(face).toContain('{key}')
    // Settled keys get their shape cues: ✓ / × corner marks, dashed miss outline
    expect(kb).toContain('key-correct')
    expect(kb).toContain('key-wrong')
    expect(kb).toContain('name="check"')
    expect(kb).toContain('name="close"')
  })

  test('gap ≤4px until rows fit; 6–8px only when width allows ≥40px faces', async () => {
    const css = await Bun.file(new URL('../index.css', import.meta.url)).text()
    expect(css).toContain('[data-letter-pad-cq] {')
    expect(css).toContain('container-type: inline-size;')
    expect(css).toContain('container-name: letter-pad;')
    expect(css).toContain('--pad-half-gap: 2px;')
    // cols × (40 + gap) + 8 inset: 10 cols → 468 / 488; 11 cols (DE) → 514 / 536.
    expect(css).toContain('@container letter-pad (min-width: 468px)')
    expect(css).toContain('@container letter-pad (min-width: 488px)')
    expect(css).toContain('@container letter-pad (min-width: 514px)')
    expect(css).toContain('@container letter-pad (min-width: 536px)')
    expect(css).not.toMatch(/--pad-half-gap: [5-9]px/)
  })

  test('PT/ES accent strip is labeled + contained; DE has none', async () => {
    const kb = await kbSrc()
    expect(kb).toContain('data-accent-strip')
    expect(kb).toContain("aria-label={t('keyboard.accentStripAria')}")
    expect(kb).toContain("{t('keyboard.accentStripLabel')}")
    expect(UI_COPY.en['keyboard.accentStripAria']).toBe('Accent keys')
    expect(UI_COPY.en['keyboard.accentStripLabel']).toBe('Accents')
    expect(kb).toContain('px-frame')
    expect(kb).toContain('bg-cream-dark/60')
    expect(kb).toContain('pad.accentStrip ?')
  })

  test('pad is pinned full-bleed in the Layout footer (bottom safe-area)', async () => {
    const layout = await Bun.file(
      new URL('../components/Layout.tsx', import.meta.url),
    ).text()
    expect(layout).toContain('footerBleed?: boolean')
    expect(layout).toContain('-mx-4')
    expect(layout).toContain('sticky bottom-0 z-10')
    expect(layout).toContain('pb-[env(safe-area-inset-bottom)]')

    const src = await pageSrc('Play.tsx')
    expect(src).toContain('footer={letterPad}')
    expect(src).toContain('footerBleed')
    expect(src).toContain('aside={letterPadLand}')
    expect(src).toContain(
      'const inRound = !loading && !error && !!wordEntry && !finished',
    )
    expect(src).toContain('const letterPad = inRound ? (')
    // Portrait footer pad plus the short-land column pad (#209). One is hidden.
    expect(src.match(/<Keyboard\b/g)?.length).toBe(2)
  })

  test('Reveal stays in the content above the pad, not adjacent to row 1', async () => {
    const src = await pageSrc('Play.tsx')
    const revealAt = src.indexOf('data-reveal-word')
    const layoutAt = src.indexOf('footer={letterPad}')
    expect(layoutAt).toBeGreaterThan(0)
    expect(revealAt).toBeGreaterThan(layoutAt)
    // Links sit under Reveal (no mt-auto); empty space below them buffers the pad.
    expect(src).not.toContain('mt-auto flex flex-wrap')
    expect(src).not.toContain('mt-auto pt-6')
    const revealBlock = src.slice(revealAt, src.indexOf("{!finished && mode === 'daily'"))
    expect(revealBlock).toContain("t('play.reveal')")
    // Daily / practice / pocket in-round stacks keep pt-6, not mt-auto.
    expect(src).toContain(
      'flex flex-wrap items-center justify-center gap-4 pt-6 text-sm',
    )
    expect(src).toContain('pt-6 text-center')
  })

  test('no OSK / device-keyboard toggle: custom pad is the only mobile input', async () => {
    const kb = await kbSrc()
    const src = await pageSrc('Play.tsx')
    for (const text of [kb, src]) {
      expect(text).not.toContain('inputMode')
      expect(text).not.toContain('<input')
      expect(text).not.toMatch(/\bOSK\b/)
      expect(text).not.toMatch(/device keyboard/i)
    }
  })
})

describe('About states what is counted (ADR 0047, #224)', () => {
  test('privacy card names cookieless Web Analytics, production-only, and the exclusions', async () => {
    const src = await pageSrc('About.tsx')
    expect(src).toContain("t('about.whatWeCount')")
    expect(src).toContain("t('about.whatWeCountBody')")
    expect(UI_COPY.en['about.whatWeCount']).toBe('What we count')
    const wwc = UI_COPY.en['about.whatWeCountBody']
    expect(wwc).toContain('cookieless Cloudflare Web Analytics')
    expect(wwc).toContain('production site only')
    expect(wwc).toContain('no cookies')
    expect(wwc).toContain('device storage for tracking')
    expect(wwc).toContain('The Staging site and offline play are not counted')
  })
})

describe('About Sound effects switch + Jersey 10 credit (ADR 0052 #271 / #269)', () => {
  test('Sound card is first, with role=switch, approved copy, and hiato.sound storage', async () => {
    const src = await pageSrc('About.tsx')
    expect(src).toContain("t('about.soundTitle')")
    expect(src).toContain("t('about.soundHelp')")
    expect(UI_COPY.en['about.soundTitle']).toBe('Sound effects')
    expect(UI_COPY.en['about.soundHelp']).toBe('Short arcade beeps for letters, misses and results. Everything also shows on screen.')
    expect(src).toContain('role="switch"')
    expect(src).toContain('aria-checked={on}')
    expect(src).toContain('aria-labelledby="sound-label"')
    expect(src).toContain('aria-describedby="sound-help"')
    expect(src).toContain('id="sound-label"')
    expect(src).toContain('id="sound-help"')
    // first card on the page, above "What we count"
    const soundAt = src.indexOf('<SoundCard />')
    const countAt = src.indexOf("t('about.whatWeCount')")
    expect(soundAt).toBeGreaterThan(0)
    expect(countAt).toBeGreaterThan(soundAt)
    // visible Off/On word; turning on plays the coin cue, off is silent
    expect(src).toContain("{on ? t('common.on') : t('common.off')}")
    expect(UI_COPY.en['common.on']).toBe('On')
    expect(UI_COPY.en['common.off']).toBe('Off')
    expect(src).toContain("if (next) playCue('coin')")
    expect(src).not.toMatch(/setSoundOn\(next\)[\s\S]{0,80}playCue\('coin'\)[\s\S]{0,40}!next/)
    // storage module wiring
    expect(src).toContain("from '@/lib/sound'")
    expect(src).toContain('getSoundOn')
    expect(src).toContain('setSoundOn')
    expect(src).toContain('subscribeSoundChange')
    const sound = await Bun.file(new URL('../lib/sound.ts', import.meta.url)).text()
    expect(sound).toContain("'hiato.sound'")
    expect(sound).toContain('speechSynthesis')
    expect(sound).toContain('document.hidden')
    expect(sound).toContain("'ambient'")
    expect(sound).not.toMatch(/audioSession\.type\s*=\s*'playback'/)
  })

  test('Jersey 10 typeface card credits the font like Inter', async () => {
    const src = await pageSrc('About.tsx')
    expect(src).toContain('Jersey 10')
    expect(src).toContain('SIL Open Font License 1.1')
    expect(src).toContain("t('about.copyrightJersey')")
    expect(UI_COPY.en['about.copyrightJersey']).toBe('Copyright 2023 The Soft Type Project Authors (')
    expect(src).toContain('github.com/scfried/soft-type-jersey')
    expect(src).toContain('/fonts/Jersey10-OFL.txt')
    expect(src).toContain('public/fonts')
    // the existing Inter card stays
    expect(src).toContain('>Inter</h2>')
    expect(src).toContain('/fonts/LICENSE.txt')
  })
})

describe('Play accent teach line (ADR 0053 / #75 / #293 / #295)', () => {
  test('teach line slot renders under the grid as role=status, AA-safe, with a stable slot and short-land margin', async () => {
    const src = await pageSrc('Play.tsx')
    const roundAt = src.indexOf('function PlayRound(')
    const endAt = src.indexOf('function EndCard(', roundAt)
    expect(roundAt).toBeGreaterThan(0)
    const round = src.slice(roundAt, endAt)
    expect(round).toContain(
      'const [teachLine, setTeachLine] = useState<AccentTeachLine | null>(null)',
    )
    const lineAt = round.indexOf(
      "{lang !== 'en' && !finished && hasUnrevealedDiacritic(cells, wordEntry.word) ? (",
    )
    expect(lineAt).toBeGreaterThan(0)
    const block = round.slice(lineAt, lineAt + 1000)
    expect(block).toContain('lang="en"')
    expect(block).toContain('role="status"')
    expect(block).toContain('text-ink-muted')
    // #229: text-ink-faint fails WCAG AA contrast — never on this line
    expect(block).not.toContain('text-ink-faint')
    expect(block).toContain('short-land:mt-1')
    // #295: stable slot (nbsp placeholder, no short-land collapse) so the line never shifts the layout
    expect(block).toContain("'\\u00a0'")
    expect(block).not.toContain('short-land:hidden')
    // #295: pixel-face grapheme in the pack language + accent colour, enter motion replayed per line
    expect(block).toContain('lang={lang}')
    expect(block).toContain('text-pixel-label')
    expect(block).toContain('text-accent-fg')
    expect(block).toContain('motion-teach-enter')
    expect(block).toContain('ACCENT_TEACH_FORGIVEN_CUE')
    // sits between the grid and the LearnerHint strip, inside the short-land wrapper
    const gridAt = round.indexOf('<LetterGrid cells={cells} lang={lang} />')
    const hintAt = round.indexOf('<LearnerHint entry={wordEntry} lang={lang} />')
    expect(gridAt).toBeGreaterThan(0)
    expect(lineAt).toBeGreaterThan(gridAt)
    expect(hintAt).toBeGreaterThan(lineAt)
    // under-grid transient notes share one type size (#295); the slot only
    // reserves space while a diacritic is still hidden, so no-diacritic words
    // keep the previous layout (landscape snapshots unchanged)
    expect(round).toContain(
      '<p className="mt-3 text-center text-[11px] text-ink-muted short-land:mt-1">',
    )
    // cleared on the next key, on hint, and on practice Reveal
    expect(round.match(/setTeachLine\(null\)/g)?.length).toBe(3)
    // accent-miss wiring: teach at every band, EN gated off, life rule per ADR 0053
    expect(round).toContain("if (accentMiss && lang !== 'en')")
    expect(round).toContain('accentMissTarget(r.cells, r.wordEntry.word, letter)')
    expect(round).toContain('accentTeachParts(target)')
    expect(round).toContain('isForgivenAccentMiss(lang, cefr)')
    // #295: a finishing losing accent miss carries the line into the EndCard (short-land hides the grid wrapper)
    expect(round).toContain('teachLine={teachLine}')
    const endSrc = src.slice(endAt)
    const endLineAt = endSrc.indexOf('{teachLine ? (')
    expect(endLineAt).toBeGreaterThan(0)
    const endBlock = endSrc.slice(endLineAt, endLineAt + 400)
    expect(endBlock).toContain('lang="en"')
    expect(endBlock).toContain('role="status"')
    expect(endBlock).toContain('lang={lang}')
    expect(endBlock).toContain('ACCENT_TEACH_FORGIVEN_CUE')
  })

  test('micro-lesson copy is pinned', () => {
    expect(accentTeachLine('Ñ')).toBe('Ñ: N with a tilde, sounds like "ny"')
    expect(accentTeachLine('ß')).toBe('ß: the German sharp s, sounds like "ss"')
    expect(accentTeachLine('Ç')).toBe('Ç: C with a cedilla, the C sounds like "s"')
    expect(accentTeachLine('Ã')).toBe('Ã: A with a tilde, a nasal vowel sound')
    // unmapped grapheme (future packs) gets the generic fallback
    expect(accentTeachLine('Å')).toBe(
      'Å: this letter carries a special mark that changes its sound',
    )
    // #295: forgiven cue and styled parts are pinned
    expect(ACCENT_TEACH_FORGIVEN_CUE).toBe(' — life kept')
    expect(accentTeachLine('É', { forgiven: true })).toBe(
      `É: E with an acute accent, sounds like "ay"${ACCENT_TEACH_FORGIVEN_CUE}`,
    )
    expect(accentTeachLine('É')).not.toContain(ACCENT_TEACH_FORGIVEN_CUE)
    expect(accentTeachParts('É')).toEqual({
      grapheme: 'É',
      text: 'E with an acute accent, sounds like "ay"',
    })
  })
})

describe('Level check guards (#227/#277)', () => {
  test('new level-check modules never import streak/analytics code and write no storage', async () => {
    for (const rel of ['../lib/level-check.ts', '../components/LevelCheckSheet.tsx']) {
      const src = await Bun.file(new URL(rel, import.meta.url)).text()
      expect(src, rel).not.toMatch(/from\s+['"][^'"]*streaks['"]/)
      expect(src, rel).not.toContain('recordDailyWin')
      expect(src, rel).not.toContain('STREAKS_KEY')
      expect(src, rel).not.toContain('hiato.streaks')
      expect(src, rel).not.toMatch(/from\s+['"][^'"]*analytics['"]/)
      expect(src, rel).not.toContain('localStorage')
      expect(src, rel).not.toContain('sessionStorage')
      expect(src, rel).not.toMatch(/\bsetItem\s*\(/)
      expect(src, rel).not.toMatch(/\bgetItem\s*\(/)
    }
  })

  test('Language.tsx: no streak/storage access; the only prefs write is Continue → setPrefs', async () => {
    const src = await pageSrc('Language.tsx')
    expect(src).not.toMatch(/from\s+['"][^'"]*streaks['"]/)
    expect(src).not.toContain('localStorage')
    expect(src).not.toContain('hiato.streaks')
    expect(src.match(/setPrefs\s*\(/g)?.length).toBe(1)
    const contAt = src.indexOf('async function continuePlay')
    const prefsAt = src.indexOf('setPrefs({ lang, cefr })')
    const navAt = src.indexOf("nav('/play?mode=daily')")
    expect(contAt).toBeGreaterThan(0)
    expect(prefsAt).toBeGreaterThan(contAt)
    expect(navAt).toBeGreaterThan(prefsAt)
  })

  test('picker offers the optional check; onApply only preselects the tile', async () => {
    const src = await pageSrc('Language.tsx')
    expect(src).toContain('data-level-check-open')
    expect(src).toContain("t('language.notSure')")
    expect(UI_COPY.en['language.notSure']).toBe('Not sure of your level?')
    expect(src).toContain('<LevelCheckSheet')
    const applyAt = src.indexOf('onApply={(c) => {')
    expect(applyAt).toBeGreaterThan(0)
    const applyBlock = src.slice(applyAt, applyAt + 220)
    const cefrAt = applyBlock.indexOf('setCefr(c)')
    const closeAt = applyBlock.indexOf('setCheckOpen(false)')
    expect(cefrAt).toBeGreaterThan(0)
    expect(closeAt).toBeGreaterThan(cefrAt)
    expect(applyBlock).not.toContain('setPrefs')
    expect(applyBlock).not.toContain('localStorage')
  })
})

describe('UI i18n catalog (ADR 0062-0064 / #379)', () => {
  test('every locale covers exactly the UiKey set (parity: no missing, no extra)', () => {
    const enKeys = Object.keys(UI_COPY.en).sort()
    expect(enKeys.length).toBeGreaterThan(100)
    for (const loc of UI_LOCALES) {
      expect(Object.keys(UI_COPY[loc]).sort(), loc).toEqual(enKeys)
    }
  })

  test('no empty or whitespace-only values in any locale', () => {
    for (const loc of UI_LOCALES) {
      for (const [key, value] of Object.entries(UI_COPY[loc])) {
        expect(value.trim().length, `${loc} ${key}`).toBeGreaterThan(0)
      }
    }
  })

  test('interpolation placeholders are identical across all locales', () => {
    const placeholders = (s: string) => (s.match(/\{[a-zA-Z]+\}/g) ?? []).sort()
    for (const key of Object.keys(UI_COPY.en) as UiKey[]) {
      const want = placeholders(UI_COPY.en[key])
      for (const loc of UI_LOCALES) {
        expect(placeholders(UI_COPY[loc][key]), `${loc} ${key}`).toEqual(want)
      }
    }
  })

  test('t() resolves every key in the requested locale — no silent fallthrough', () => {
    for (const loc of UI_LOCALES) {
      for (const key of Object.keys(UI_COPY.en) as UiKey[]) {
        expect(t(loc, key)).toBe(UI_COPY[loc][key])
      }
    }
    // interpolation fills {name} params; unknown params are ignored
    expect(t('en', 'common.back', { n: 3 })).toBe('← Back')
    expect(t('de', 'common.inDays', { n: 3 })).toBe('in 3 Tagen')
    expect(t('pt', 'home.dailyLabel', { lang: 'EN', cefr: 'A1' })).toBe('Palavra do dia EN A1')
  })

  test('UILocale reuses the six pack-language codes', () => {
    expect([...UI_LOCALES].sort()).toEqual([...PACK_LANGS].sort())
  })

  test('#401 native i18n & glossary QA: no French PT typo, Staging per GLOSSARY, short Daily badges, natural Daily prose, IT Inizio', () => {
    for (const loc of UI_LOCALES) {
      for (const [key, value] of Object.entries(UI_COPY[loc])) {
        expect(value, `${loc} ${key} must not contain French 'pratiquer'`).not.toContain('pratiquer')
      }
      const wwc = UI_COPY[loc]['about.whatWeCountBody']
      expect(wwc, `${loc} whatWeCountBody uses the glossary term Staging`).toContain('Staging')
      expect(wwc, `${loc} whatWeCountBody avoids Preview-class words`).not.toMatch(
        /preview|vorschau|aper\u00e7u|anteprim|vistas previas|pr\u00e9-visual/i,
      )
    }
    expect(UI_COPY.pt['play.replaceConfirm']).toBe('Substituir e ' + 'praticar')
    expect(UI_COPY.pt['play.practiceUnavailableBody']).toContain('então ' + 'praticar' + ' a revelaria.')
    // TopBar badges stay compact; running text uses the natural Daily phrase.
    expect(UI_COPY.fr['play.badgeDaily']).toBe('Quotidien')
    expect(UI_COPY.es['play.badgeDaily']).toBe('Diario')
    expect(UI_COPY.pt['play.badgeDaily']).toBe('Di\u00e1rio')
    expect(UI_COPY.it['play.badgeDaily']).toBe('Giornaliero')
    expect(UI_COPY.de['play.badgeDaily']).toBe('T\u00e4glich')
    for (const loc of UI_LOCALES) {
      expect(UI_COPY[loc]['play.badgeDaily'].length, `${loc} badgeDaily stays compact`).toBeLessThanOrEqual(11)
      expect(UI_COPY[loc]['play.endBadgeDaily'], `${loc} endBadgeDaily wraps the badge`).toBe(' · ' + UI_COPY[loc]['play.badgeDaily'])
      expect(UI_COPY[loc]['common.dailyLink'], `${loc} dailyLink wraps the badge`).toBe('← ' + UI_COPY[loc]['play.badgeDaily'])
    }
    expect(UI_COPY.fr['home.dailyLabel']).toBe('Mot du jour {lang} {cefr}')
    expect(UI_COPY.es['home.dailyLabel']).toBe('Palabra del d\u00eda {lang} {cefr}')
    expect(UI_COPY.it['home.dailyLabel']).toBe('Parola del giorno {lang} {cefr}')
    expect(UI_COPY.pt['home.dailyLabel']).toBe('Palavra do dia {lang} {cefr}')
    for (const key of ['play.backToDaily', 'language.continueDaily', 'share.playDailyInvite', 'play.todayDone', 'play.todayMissed'] as const) {
      expect(UI_COPY.fr[key], `fr ${key}`).toContain('mot du jour')
      expect(UI_COPY.es[key], `es ${key}`).toContain('palabra del d\u00eda')
      expect(UI_COPY.it[key], `it ${key}`).toContain('parola del giorno')
      expect(UI_COPY.pt[key], `pt ${key}`).toContain('palavra do dia')
    }
    // IT leftover English fixed; OS-quoted install copy keeps its quotes.
    expect(UI_COPY.it['common.home']).toBe('\u2190 Inizio')
    expect(UI_COPY.it['common.backHome']).toBe('Torna all\u2019inizio')
    expect(UI_COPY.it['share.home']).toBe('Inizio')
    expect(UI_COPY.it['install.body']).toContain('schermata Home')
    expect(UI_COPY.it['install.iosStep2']).toContain('«Aggiungi a Home»')
  })

  test('pages read UI copy through t() keys; the catalog holds the text', async () => {
    const home = await pageSrc('Home.tsx')
    expect(home).toContain("t('home.playToday')")
    expect(UI_COPY.en['home.playToday']).toBe('Play today')
    const about = await pageSrc('About.tsx')
    expect(about).toContain('data-ui-locale-picker')
    expect(about).toContain("t('about.uiLanguage')")
    expect(UI_COPY.en['about.uiLanguage']).toBe('Interface language')
    // pack-language seams stay out of the UI catalog (ADR 0064)
    expect(Object.keys(UI_COPY.en).some((k) => k.includes('NO_HINT'))).toBe(false)
    expect(Object.keys(UI_COPY.en).some((k) => k.includes('SPEAK_LEMMA'))).toBe(false)
  })
})
