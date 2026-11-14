import { describe, expect, test } from 'bun:test'
import contrastRows from '../docs/design/retro/contrast.json'

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

/** Light "Cartridge" (ADR 0052 §2 / docs/design/retro/assets/retro-theme.css). */
const LIGHT: Record<string, string> = {
  cream: '#f3ecd8',
  raised: '#fffaee',
  'cream-dark': '#e6dcc0',
  ink: '#1b1830',
  'ink-muted': '#545068',
  'ink-faint': '#545068',
  line: '#77708c',
  accent: '#1c6e42',
  'accent-fg': '#17633b',
  'accent-soft': '#dcefd9',
  'accent-mid': '#14593a',
  danger: '#a8261c',
  'danger-soft': '#fbe1db',
  helped: '#bfe3b0',
  wrong: '#cfc8d8',
  edge: '#1b1830',
  shadow: '#1b1830',
  focus: '#c4410c',
  coin: '#b86e00',
  spark: '#e0a100',
}

/** Dark "CRT night" (ADR 0052 §2). */
const DARK: Record<string, string> = {
  cream: '#0f0d1c',
  raised: '#1b1830',
  'cream-dark': '#262142',
  ink: '#f3ecd8',
  'ink-muted': '#b9b2d2',
  'ink-faint': '#b9b2d2',
  line: '#7a71a0',
  accent: '#1f7f4a',
  'accent-fg': '#7fe39a',
  'accent-soft': '#17331f',
  'accent-mid': '#1a6e40',
  danger: '#ff8f80',
  'danger-soft': '#3b1a24',
  helped: '#1f4a2c',
  wrong: '#3a3456',
  edge: '#8a81b3',
  shadow: '#000000',
  focus: '#ffb703',
  coin: '#ffb703',
  spark: '#ffd166',
}

describe('Retro arcade tokens (ADR 0052)', () => {
  test('contrast helper matches black on white', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 5)
    expect(contrastRatio('#ffffff', '#000000')).toBeCloseTo(21, 5)
  })

  test('ink-faint is aliased to ink-muted in both palettes (#229)', () => {
    expect(LIGHT['ink-faint']).toBe(LIGHT['ink-muted'])
    expect(DARK['ink-faint']).toBe(DARK['ink-muted'])
  })

  test('@theme pins the light Cartridge values plus the six new tokens', async () => {
    const css = await Bun.file(new URL('./index.css', import.meta.url)).text()
    const themeAt = css.indexOf('@theme')
    expect(themeAt).toBeGreaterThan(-1)
    const themeBlock = braceBlock(css, themeAt)
    expect(themeBlock).not.toContain('@media')
    expect(colorDecls(themeBlock)).toEqual(LIGHT)
    expect(themeBlock).toContain('--font-pixel: "Jersey 10", "Inter", system-ui, sans-serif')
    expect(themeBlock).toContain('--fpx: 18.667px')
    expect(themeBlock).toContain('--dur-blink: 480ms')
    expect(themeBlock).toContain('--dur-fast: 150ms')
    expect(themeBlock).toContain('--dur-mid: 220ms')
    expect(themeBlock).toContain('--dur-slow: 300ms')
    // scan is the decorative overlay token; rgba values are not hex-pinned above
    expect(themeBlock).toContain('--color-scan: rgba(0, 0, 0, 0)')
  })

  test('dark :root remaps every theme color and does not nest @theme', async () => {
    const css = await Bun.file(new URL('./index.css', import.meta.url)).text()
    const darkAt = css.indexOf('@media (prefers-color-scheme: dark)')
    expect(darkAt).toBeGreaterThan(-1)
    const darkBlock = braceBlock(css, darkAt)
    expect(darkBlock).not.toContain('@theme')
    expect(darkBlock).toContain(':root')
    expect(colorDecls(darkBlock)).toEqual(DARK)
    expect(darkBlock).toContain('--color-scan: rgba(255, 255, 255, 0.03)')
    expect(css).not.toContain('dark:bg-ink')
    expect(css).toContain('color-scheme: light dark')
    expect(css).toContain('background-color: var(--color-cream)')
    expect(css).toContain('color: var(--color-ink)')
  })

  test('Jersey 10 is one self-hosted subset, not a CDN face', async () => {
    const css = await Bun.file(new URL('./index.css', import.meta.url)).text()
    expect(css).toContain('font-family: "Jersey 10"')
    expect(css).toContain('/fonts/jersey-10-latin-400-normal.woff2')
    expect(css).not.toContain('jersey-10-latin-ext')
    expect(css).not.toMatch(/https?:\/\/fonts\.(googleapis|gstatic)\.com|\/\/fonts\.(googleapis|gstatic)\.com/i)
  })

  test('pixel type sizes are multiples of --fpx and never below 1 fpx', async () => {
    const css = await Bun.file(new URL('./index.css', import.meta.url)).text()
    expect(css).toMatch(/\.text-pixel-stat\s*\{[^}]*font-size:\s*calc\(var\(--fpx\)\s*\*\s*2\.5\)/)
    expect(css).toMatch(/\.text-pixel-display\s*\{[^}]*font-size:\s*calc\(var\(--fpx\)\s*\*\s*2\)/)
    expect(css).toMatch(/\.text-pixel-title\s*\{[^}]*font-size:\s*calc\(var\(--fpx\)\s*\*\s*1\.5\)/)
    expect(css).toMatch(/\.text-pixel-label\s*\{[^}]*font-size:\s*var\(--fpx\)/)
    expect(css).toContain('font-synthesis: none')
  })

  test('focus ring is a 3px focus ring outside a 3px cream gap; contrast-more strips decor', async () => {
    const css = await Bun.file(new URL('./index.css', import.meta.url)).text()
    expect(css).toMatch(/:focus-visible\s*\{[^}]*outline:\s*3px solid var\(--color-focus\)[^}]*box-shadow:\s*0 0 0 3px var\(--color-cream\)/)
    expect(css).toContain('@media (prefers-contrast: more)')
    expect(css).toContain('@media (prefers-reduced-motion: reduce)')
  })

  test('every contrast.json pair passes on the pinned palettes', () => {
    expect(contrastRows.length).toBeGreaterThan(40)
    for (const row of contrastRows) {
      const palette = row.mode === 'light' ? LIGHT : DARK
      const fg = row.fg.startsWith('#') ? row.fg : palette[row.fg]!
      const bg = row.bg.startsWith('#') ? row.bg : palette[row.bg]!
      expect(fg, `${row.mode} ${row.fg}`).toBe(row.fgHex.toLowerCase())
      expect(bg, `${row.mode} ${row.bg}`).toBe(row.bgHex.toLowerCase())
      const ratio = contrastRatio(fg, bg)
      expect(ratio, `${row.mode} ${row.kind} ${row.fg}/${row.bg} (${row.use})`).toBeCloseTo(
        row.ratio,
        1,
      )
      expect(ratio, `${row.mode} ${row.kind} ${row.fg}/${row.bg} (${row.use})`).toBeGreaterThanOrEqual(
        row.min,
      )
      expect(row.pass_).toBe(true)
    }
  })

  test('text pairs reach 4.5:1 and UI boundaries 3:1 on both pinned palettes', () => {
    for (const palette of [LIGHT, DARK]) {
      expect(contrastRatio('#ffffff', palette.accent!)).toBeGreaterThanOrEqual(4.5)
      expect(contrastRatio('#ffffff', palette['accent-mid']!)).toBeGreaterThanOrEqual(4.5)
      expect(contrastRatio(palette.line!, palette.raised!)).toBeGreaterThanOrEqual(3)
      expect(contrastRatio(palette.line!, palette.cream!)).toBeGreaterThanOrEqual(3)
      expect(contrastRatio(palette.edge!, palette.cream!)).toBeGreaterThanOrEqual(3)
      expect(contrastRatio(palette.edge!, palette.raised!)).toBeGreaterThanOrEqual(3)
      expect(contrastRatio(palette.focus!, palette.cream!)).toBeGreaterThanOrEqual(3)
      expect(contrastRatio(palette.focus!, palette.raised!)).toBeGreaterThanOrEqual(3)
      expect(contrastRatio(palette.accent!, palette.raised!)).toBeGreaterThanOrEqual(3)
      expect(contrastRatio(palette.cream!, palette.accent!)).toBeGreaterThanOrEqual(3)
    }
  })
})
