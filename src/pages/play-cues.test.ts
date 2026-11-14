import { describe, expect, test } from 'bun:test'

describe('daily win cues (ADR 0052 §6)', () => {
  test('streak and freeze cues fire only when a Daily win raises the count', async () => {
    const src = await Bun.file(new URL('./Play.tsx', import.meta.url)).text()
    const start = src.indexOf('const persistDaily')
    const end = src.indexOf('const recordRound')
    const persist = src.slice(start, end)
    expect(persist).toContain('next.count > prev.count')
    expect(persist).toContain("playCue('streak')")
    expect(persist).toContain('460')
    expect(persist).toContain('next.freezes > prev.freezes')
    expect(persist).toContain("playCue('freeze')")
    expect(persist).toContain('590')
    const outside = src.slice(0, start) + src.slice(end)
    expect(outside).not.toContain("playCue('streak')")
    expect(outside).not.toContain("playCue('freeze')")
  })
})
