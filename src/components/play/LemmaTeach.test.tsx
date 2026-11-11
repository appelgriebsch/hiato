import { describe, expect, test } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'
import { LemmaTeach } from '@/components/play/LemmaTeach'

function renderTeach(example?: string): string {
  return renderToStaticMarkup(
    <LemmaTeach
      lang="de"
      word="HAUS"
      gloss="Ein Gebäude zum Wohnen."
      synonyms={['Wohnung']}
      example={example}
      showSpeak={false}
    />,
  )
}

describe('LemmaTeach example sentence (ADR 0049, #246)', () => {
  test('renders exactly one sentence in the pack language when example is set', () => {
    const html = renderTeach('Wir wohnen in einem kleinen Haus.')
    expect(html).toContain('data-endcard-example')
    expect(html).toContain('lang="de"')
    expect(html).toContain('Wir wohnen in einem kleinen Haus.')
    expect(html.split('data-endcard-example').length - 1).toBe(1)
  })

  test('omits the sentence when no example is set', () => {
    expect(renderTeach(undefined)).not.toContain('data-endcard-example')
    expect(renderTeach('   ')).not.toContain('data-endcard-example')
  })
})

describe('EndCard structural gate (ADR 0049, #246)', () => {
  test('Play.tsx mounts EndCard only when finished and never feeds example in-round', async () => {
    const src = await Bun.file(new URL('../../pages/Play.tsx', import.meta.url)).text()
    const hint = await Bun.file(new URL('./LearnerHint.tsx', import.meta.url)).text()

    // The example flows into EndCard from the finished word entry only.
    expect(src).toContain('{finished ? (')
    const finishedAt = src.indexOf('{finished ? (')
    const endCardAt = src.indexOf('<EndCard')
    expect(endCardAt).toBeGreaterThan(finishedAt)
    expect(src).toContain('example={wordEntry.example}')
    // EndCard receives and forwards the example to the teach block.
    const endCard = src.slice(src.indexOf('function EndCard('))
    expect(endCard).toContain('example?: string')
    expect(endCard).toContain('example={teachExample}')
    // Already-played daily replay carries the stored example too.
    expect(src).toContain('example: rec.example')
    expect(src).toContain('example: entry.example')
    // In-round UI never receives example.
    expect(hint).not.toContain('example')
    const inRound = src.slice(0, finishedAt)
    expect(inRound).not.toContain('wordEntry.example')
  })
})
