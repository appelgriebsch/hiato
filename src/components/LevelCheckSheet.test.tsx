import { describe, expect, test } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'
import { CEFR_LINES } from '@/packs/labels'
import {
  LevelCheckQuestions,
  LevelCheckResult,
  LevelCheckSheet,
} from './LevelCheckSheet'

describe('LevelCheckSheet (#227/#276)', () => {
  test('closed sheet mounts no portal — SSR/static render stays portal-free', () => {
    const html = renderToStaticMarkup(
      <LevelCheckSheet
        lang="en"
        today="2026-11-13"
        open={false}
        onClose={() => {}}
        onApply={() => {}}
      />,
    )
    expect(html).toBe('')
  })

  test('open sheet markup lives behind the portal — covered by source assertions', async () => {
    // renderToStaticMarkup cannot render portals (no document in bun), so the
    // open-sheet markup is asserted on the source instead.
    const src = await Bun.file(new URL('./LevelCheckSheet.tsx', import.meta.url)).text()
    expect(src).toContain('data-level-check-sheet')
    expect(src).toContain('aria-labelledby="level-check-sheet-heading"')
    expect(src).toContain('Check your level')
    expect(src).toContain('data-level-check-close')
    expect(src).toContain('Loading words…')
    expect(src).toContain('data-level-check-error')
    expect(src).toContain('Could not load the word packs')
  })

  test('questions: word only (no gloss), aria-live progress, 44px Know / Don’t know', () => {
    const html = renderToStaticMarkup(
      <LevelCheckQuestions
        item={{ cefr: 'b1', word: 'HAUS' }}
        step={2}
        total={6}
        onAnswer={() => {}}
      />,
    )
    expect(html).toContain('data-level-check-questions')
    expect(html).toContain('Question 3 of 6')
    expect(html).toContain('aria-live="polite"')
    expect(html).toContain('data-level-check-word')
    expect(html).toContain('>HAUS<')
    expect(html).not.toContain('gloss')
    expect(html).toContain('data-level-check-know')
    expect(html).toContain('data-level-check-dont-know')
    expect(html.match(/min-h-11/g)?.length).toBe(2)
    expect(html).toContain('>Know<')
    expect(html).toContain('>Don’t know<')
  })

  test('result: suggested level + level line, primary Use, secondary Keep my pick', () => {
    const html = renderToStaticMarkup(
      <LevelCheckResult level="b1" onApply={() => {}} onKeep={() => {}} />,
    )
    expect(html).toContain('data-level-check-result')
    expect(html).toContain('Suggested level')
    // #324 L2: the result heading is the focus target (tabIndex -1, programmatic focus only)
    expect(html).toMatch(/<h3[^>]*tabindex="-1"[^>]*>/)
    expect(html).toContain('>B1<')
    expect(html).toContain(CEFR_LINES.b1)
    expect(html).toContain('data-level-check-apply')
    expect(html).toContain('>Use B1<')
    expect(html).toContain('data-level-check-keep')
    expect(html).toContain('Keep my pick')
  })

  test('dialog wiring: showModal, Esc cancel, backdrop click, focus restore', async () => {
    const src = await Bun.file(new URL('./LevelCheckSheet.tsx', import.meta.url)).text()
    expect(src).toContain('createPortal')
    expect(src).toContain('showModal')
    expect(src).toContain('role="dialog"')
    expect(src).toContain('aria-modal="true"')
    expect(src).toContain('onCancel')
    expect(src).toContain('event.preventDefault()')
    expect(src).toContain('event.target === event.currentTarget')
    expect(src).toContain('opener.focus()')
    expect(src).toContain('{open &&')
    // Loads the six level packs lazily, seeded per local day
    expect(src).toContain('PACK_CEFR_LEVELS.map((cefr) => loadPack(lang, cefr))')
    expect(src).toContain('checkItems(map, today, lang)')
    expect(src).toContain('suggestLevel(known)')
    // #324 L2: result announced once via a polite live region mounted before the
    // result content (role=status implies aria-live=polite), and focus moves to
    // the result heading after the last answer
    const annAt = src.indexOf('data-level-check-announcement')
    expect(annAt).toBeGreaterThan(0)
    expect(src.slice(annAt - 120, annAt)).toContain('role="status"')
    expect(src).toContain('tabIndex={-1}')
    expect(src).toContain('resultHeadingRef.current?.focus()')
  })
})
