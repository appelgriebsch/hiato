import { describe, expect, test } from 'bun:test'
import path from 'node:path'
import { TOTAL_LIVES } from '../engine/game'
import { LIVES_METAPHOR, LIVES_METAPHOR_LABELS } from './livesMetaphor'

const REPO = path.join(import.meta.dir, '../..')

describe('lives metaphor (ADR 0025)', () => {
  test('default metaphor is seeds — glyph only, rules unchanged', () => {
    expect(LIVES_METAPHOR).toBe('seeds')
    expect(LIVES_METAPHOR_LABELS.seeds).toBe('Seeds')
    expect(TOTAL_LIVES).toBe(6)
  })

  test('Lives accessible name says lives remaining', async () => {
    const src = await Bun.file(
      path.join(REPO, 'src/components/play/Lives.tsx'),
    ).text()
    expect(src).toContain('lives remaining')
    expect(src).not.toContain('♥')
  })
})

describe('Uma polish assets', () => {
  test('brand SVGs ship in public/brand', async () => {
    const files = [
      'public/brand/hiato-mark.svg',
      'public/brand/hiato-wordmark.svg',
      'public/brand/hiato-mark-icon.svg',
      'public/brand/hiato-mark-maskable.svg',
      'public/brand/hiato-mark-apple.svg',
    ]
    for (const rel of files) {
      expect(Bun.file(path.join(REPO, rel)).size).toBeGreaterThan(100)
    }
  })

  test('PWA icons + favicons ship', async () => {
    const files = [
      'public/icons/icon-192.png',
      'public/icons/icon-512.png',
      'public/icons/icon-192-maskable.png',
      'public/icons/icon-512-maskable.png',
      'public/icons/apple-touch-icon.png',
      'public/favicon.ico',
      'public/favicon.svg',
      'public/favicon-32.png',
      'public/hiato.svg',
    ]
    for (const rel of files) {
      expect(Bun.file(path.join(REPO, rel)).size).toBeGreaterThan(100)
    }
  })

  test('index.css keeps OFL Inter faces, motion tokens, and reduced motion', async () => {
    const css = await Bun.file(path.join(REPO, 'src/index.css')).text()
    expect(css).toContain('@font-face')
    expect(css).toContain('font-family: "Inter"')
    expect(css).toContain('/fonts/inter-latin-400-normal.woff2')
    expect(css).toContain('/fonts/inter-latin-500-normal.woff2')
    expect(css).toContain('/fonts/inter-latin-600-normal.woff2')
    expect(css).toContain('--dur-fast: 150ms')
    expect(css).toContain('--dur-mid: 220ms')
    expect(css).toContain('--dur-slow: 300ms')
    expect(css).toContain('.motion-letter-reveal')
    expect(css).toContain('.motion-key-shake')
    expect(css).toContain('.motion-life-deplete')
    expect(css).toContain('.motion-heart-deplete')
    expect(css).toContain('.motion-onboarding-enter')
    expect(css).toContain('.motion-result-enter')
    expect(css).toContain('.motion-share-card')
    expect(css).toContain('@media (prefers-reduced-motion: reduce)')
    expect(css).not.toMatch(
      /https?:\/\/fonts\.(googleapis|gstatic)\.com|\/\/fonts\.(googleapis|gstatic)\.com/i,
    )
  })

  test('packs SW stays NetworkFirst (ADR 0006)', async () => {
    const cfg = await Bun.file(path.join(REPO, 'vite.config.ts')).text()
    expect(cfg).toContain("handler: 'NetworkFirst'")
    expect(cfg).toContain("cacheName: 'hiato-packs'")
    expect(cfg).toContain("purpose: 'any'")
    expect(cfg).toContain("purpose: 'maskable'")
    expect(cfg).toContain('icons/icon-192-maskable.png')
    expect(cfg).toContain('brand/*')
  })
})
