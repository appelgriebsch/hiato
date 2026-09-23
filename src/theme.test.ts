import { describe, expect, test } from 'bun:test'

/** WCAG 2.2 relative luminance contrast for #rrggbb pairs. */
function contrastRatio(foreground: string, background: string): number {
  const luminance = (hex: string) => {
    const value = Number.parseInt(hex.slice(1), 16)
    const channel = (byte: number) => {
      const srgb = byte / 255
      return srgb <= 0.04045 ? srgb / 12.92 : ((srgb + 0.055) / 1.055) ** 2.4
    }
    const r = channel((value >> 16) & 255)
    const g = channel((value >> 8) & 255)
    const b = channel(value & 255)
    return 0.2126 * r + 0.7152 * g + 0.0722 * b
  }
  const lighter = Math.max(luminance(foreground), luminance(background))
  const darker = Math.min(luminance(foreground), luminance(background))
  return (lighter + 0.05) / (darker + 0.05)
}

function braceBlock(source: string, at: number): string {
  const open = source.indexOf('{', at)
  if (open < 0) throw new Error('missing block')
  let depth = 0
  for (let i = open; i < source.length; i++) {
    if (source[i] === '{') depth++
    else if (source[i] === '}') {
      depth--
      if (depth === 0) return source.slice(open + 1, i)
    }
  }
  throw new Error('unbalanced block')
}

function colorDecls(block: string): Record<string, string> {
  const colors: Record<string, string> = {}
  for (const match of block.matchAll(/(--color-[\w-]+)\s*:\s*(#[0-9a-fA-F]{6})\s*;/g)) {
    colors[match[1]!.slice('--color-'.length)] = match[2]!.toLowerCase()
  }
  return colors
}

const LIGHT: Record<string, string> = {
  cream: '#f7f6f3',
  raised: '#ffffff',
  'cream-dark': '#ebe9e4',
  ink: '#1c1b19',
  'ink-muted': '#6b6860',
  'ink-faint': '#9a968c',
  line: '#e4e1da',
  accent: '#3d6b55',
  'accent-fg': '#3d6b55',
  'accent-soft': '#eef5f0',
  'accent-mid': '#4c7f64',
  danger: '#b54a3f',
  'danger-soft': '#f8ecea',
  helped: '#d4e5db',
  wrong: '#c4c0b6',
}

const DARK: Record<string, string> = {
  cream: '#1c1b19',
  raised: '#2a2824',
  'cream-dark': '#24221e',
  ink: '#f3f1ec',
  'ink-muted': '#b8b4aa',
  'ink-faint': '#a8a49a',
  line: '#6a655c',
  accent: '#3d6b55',
  'accent-fg': '#8fbfa3',
  'accent-soft': '#24352c',
  'accent-mid': '#4e7d64',
  helped: '#2f4538',
  danger: '#e09288',
  'danger-soft': '#3a2a28',
  wrong: '#5a564e',
}

/** Body copy. ink-faint is caption, not body — see the caption test. */
const BODY_TEXT: Array<[string, string]> = [
  ['ink', 'cream'],
  ['ink', 'raised'],
  ['ink', 'cream-dark'],
  ['ink-muted', 'cream'],
  ['ink-muted', 'raised'],
  ['ink-muted', 'cream-dark'],
  ['accent-fg', 'cream'],
  ['accent-fg', 'raised'],
  ['accent-fg', 'cream-dark'],
  ['danger', 'cream'],
  ['danger', 'raised'],
  ['danger', 'danger-soft'],
]

/** Non-text fills that clear 3:1 on both palettes (primary hover). */
const UI_CHROME: Array<[string, string]> = [
  ['accent-mid', 'cream'],
  ['accent-mid', 'raised'],
]

/** Borders and seed ink. accent stays the sage fill; accent-fg is the stroke. */
const UI_EDGES: Array<[string, string]> = [
  ['accent-fg', 'cream'],
  ['accent-fg', 'raised'],
  ['accent-fg', 'accent-soft'],
  ['accent-fg', 'helped'],
]

describe('OS appearance tokens', () => {
  test('contrast helper matches black on white', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 5)
    expect(contrastRatio('#ffffff', '#000000')).toBeCloseTo(21, 5)
  })

  test('dark :root remaps every theme color and does not nest @theme', async () => {
    const css = await Bun.file(new URL('./index.css', import.meta.url)).text()
    const themeAt = css.indexOf('@theme')
    expect(themeAt).toBeGreaterThan(-1)
    const themeBlock = braceBlock(css, themeAt)
    expect(themeBlock).not.toContain('@media')
    expect(colorDecls(themeBlock)).toEqual(LIGHT)

    const darkAt = css.indexOf('@media (prefers-color-scheme: dark)')
    const reduceAt = css.indexOf('prefers-reduced-motion')
    const lightHoverAt = css.indexOf('.motion-share-card:hover')
    expect(lightHoverAt).toBeGreaterThan(-1)
    expect(lightHoverAt).toBeLessThan(darkAt)
    expect(darkAt).toBeLessThan(reduceAt)

    const darkBlock = braceBlock(css, darkAt)
    expect(darkBlock).not.toContain('@theme')
    expect(darkBlock).not.toContain('--color-white')
    expect(darkBlock).toContain(':root')
    expect(colorDecls(darkBlock)).toEqual(DARK)
    expect(darkBlock).toContain('rgba(0, 0, 0, 0.5)')
    expect(css).not.toContain('dark:bg-ink')
    expect(css).toContain('color-scheme: light dark')
    expect(css).toContain('background: var(--color-cream)')
    expect(css).toContain('color: var(--color-ink)')
    expect(css).toMatch(/\.text-kicker\s*\{[^}]*color:\s*var\(--color-accent-fg\)/)
  })

  test('body text is 4.5:1 and UI chrome is 3:1 on both palettes', () => {
    for (const palette of [LIGHT, DARK]) {
      for (const [foreground, background] of BODY_TEXT) {
        expect(contrastRatio(palette[foreground]!, palette[background]!)).toBeGreaterThanOrEqual(
          4.5,
        )
      }
      expect(contrastRatio('#ffffff', palette.accent!)).toBeGreaterThanOrEqual(4.5)
      expect(contrastRatio('#ffffff', palette['accent-mid']!)).toBeGreaterThanOrEqual(4.5)
      for (const [foreground, background] of UI_CHROME) {
        expect(contrastRatio(palette[foreground]!, palette[background]!)).toBeGreaterThanOrEqual(3)
      }
      for (const [foreground, background] of UI_EDGES) {
        expect(contrastRatio(palette[foreground]!, palette[background]!)).toBeGreaterThanOrEqual(3)
      }
    }
  })

  test('ink-faint is caption text, not a body pair with a lowered bar', () => {
    expect(BODY_TEXT.some(([foreground]) => foreground === 'ink-faint')).toBe(false)
    const lightCaption = contrastRatio(LIGHT['ink-faint'], LIGHT.cream)
    const darkCaption = contrastRatio(DARK['ink-faint'], DARK.cream)
    const darkOnRaised = contrastRatio(DARK['ink-faint'], DARK.raised)
    expect(lightCaption).toBeLessThan(4.5)
    expect(lightCaption).toBeGreaterThan(2.5)
    expect(darkCaption).toBeGreaterThanOrEqual(4.5)
    expect(darkOnRaised).toBeGreaterThanOrEqual(4.5)
  })
})
