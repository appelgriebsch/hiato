import { describe, expect, test } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'
import { StreakChip } from './StreakChip'

describe('StreakChip freeze copy (ADR 0046)', () => {
  test('hides when the streak is 0', () => {
    expect(renderToStaticMarkup(<StreakChip count={0} freezes={1} />)).toBe('')
  })

  test('omits the freeze count at 0 and names 1 freeze or 2 freezes', () => {
    const none = renderToStaticMarkup(<StreakChip count={12} />)
    expect(none).toContain('aria-label="Streak 12"')
    expect(none).not.toContain('❄️')

    const one = renderToStaticMarkup(<StreakChip count={12} freezes={1} />)
    expect(one).toContain('aria-label="Streak 12, 1 freeze"')
    expect(one).toContain('❄️')
    expect(one).toContain('>1<')

    const two = renderToStaticMarkup(<StreakChip count={12} freezes={2} />)
    expect(two).toContain('aria-label="Streak 12, 2 freezes"')
    expect(two).toContain('>2<')
  })
})
