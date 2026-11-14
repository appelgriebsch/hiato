import { describe, expect, test } from 'bun:test'
import path from 'node:path'
import {
  SHARE_CARD_FONT_URLS,
  SHARE_CARD_KEYS,
  SHARE_CARD_PIXEL_FONT_FAMILY,
  SHARE_CARD_PIXEL_FONT_URLS,
  SHARE_WORD_LENGTH_MAX,
  buildShareCardPayload,
  formatShareText,
  isSameOriginFontUrl,
  pickShareCardPayload,
  shareCardFilename,
  shareCardFontUrls,
  type ShareCardPayload,
} from './share-card'
import { buildSharePageUrl } from './share-url'

const REPO = path.join(import.meta.dir, '../..')

const SAMPLE_LEMMA = 'BANANA'

function sampleRound() {
  return {
    lang: 'en' as const,
    cefr: 'a1' as const,
    streak: 4,
    dateKey: '2026-09-20',
    word: SAMPLE_LEMMA,
    won: true,
    mode: 'daily' as const,
  }
}

describe('buildShareCardPayload', () => {
  test('keeps lang, CEFR, streak, date, length, outcome — never the lemma', () => {
    const payload = buildShareCardPayload(sampleRound())
    expect(payload).toEqual({
      lang: 'en',
      cefr: 'a1',
      streak: 4,
      dateKey: '2026-09-20',
      wordLength: 6,
      won: true,
      mode: 'daily',
    })
    expect(Object.keys(payload).sort()).toEqual([...SHARE_CARD_KEYS].sort())
    expect(payload).not.toHaveProperty('word')
    expect(payload).not.toHaveProperty('lemma')
    expect(payload).not.toHaveProperty('answer')
    expect(payload).not.toHaveProperty('gloss')
    expect(JSON.stringify(payload).toLowerCase()).not.toContain(
      SAMPLE_LEMMA.toLowerCase(),
    )
  })

  test('wordLength uses grapheme clusters, not UTF-16 length', () => {
    const payload = buildShareCardPayload({
      ...sampleRound(),
      word: 'café',
    })
    expect(payload.wordLength).toBe(4)
    expect(JSON.stringify(payload).toLowerCase()).not.toContain('café')
    expect(JSON.stringify(payload).toLowerCase()).not.toContain('cafe')
  })

  test('practice mode is preserved and still omits the lemma', () => {
    const payload = buildShareCardPayload({
      ...sampleRound(),
      word: 'AÇÃO',
      mode: 'practice',
      won: false,
    })
    expect(payload.mode).toBe('practice')
    expect(payload.won).toBe(false)
    expect(payload.wordLength).toBe(4)
    expect(JSON.stringify(payload)).not.toContain('AÇÃO')
    expect(JSON.stringify(payload)).not.toContain('ACAO')
  })

  test('rejects dateKey that would fail pick regex (encode/decode align)', () => {
    expect(() =>
      buildShareCardPayload({ ...sampleRound(), dateKey: '20-09-2026' }),
    ).toThrow(/invalid dateKey/)
    expect(() =>
      buildShareCardPayload({ ...sampleRound(), dateKey: 'not-a-date' }),
    ).toThrow(/invalid dateKey/)
  })

  test('rejects empty word / oversized wordLength', () => {
    expect(() =>
      buildShareCardPayload({ ...sampleRound(), word: '' }),
    ).toThrow(/invalid wordLength/)
    expect(() =>
      buildShareCardPayload({
        ...sampleRound(),
        word: 'x'.repeat(SHARE_WORD_LENGTH_MAX + 1),
      }),
    ).toThrow(/invalid wordLength/)
  })
})

describe('pickShareCardPayload', () => {
  test('strips spoiler fields if navigation state is polluted', () => {
    const raw = {
      ...buildShareCardPayload(sampleRound()),
      word: SAMPLE_LEMMA,
      lemma: SAMPLE_LEMMA,
      gloss: 'a yellow fruit',
    }
    const payload = pickShareCardPayload(raw)
    expect(payload).not.toBeNull()
    expect(payload).not.toHaveProperty('word')
    expect(payload).not.toHaveProperty('lemma')
    expect(payload).not.toHaveProperty('gloss')
    expect(JSON.stringify(payload).toLowerCase()).not.toContain('banana')
    expect(JSON.stringify(payload).toLowerCase()).not.toContain('fruit')
  })

  test('rejects incomplete state', () => {
    expect(pickShareCardPayload(null)).toBeNull()
    expect(pickShareCardPayload({ lang: 'en' })).toBeNull()
    expect(
      pickShareCardPayload({
        lang: 'en',
        cefr: 'a1',
        streak: 1,
        dateKey: '2026-09-20',
        wordLength: 0,
        won: true,
      }),
    ).toBeNull()
    expect(
      pickShareCardPayload({
        lang: 'en',
        cefr: 'a1',
        streak: 1,
        dateKey: '2026-09-20',
        wordLength: SHARE_WORD_LENGTH_MAX + 1,
        won: true,
      }),
    ).toBeNull()
    expect(
      pickShareCardPayload({
        lang: 'en',
        cefr: 'a1',
        streak: 1,
        dateKey: '20/09/2026',
        wordLength: 5,
        won: true,
      }),
    ).toBeNull()
  })

  test('accepts unlocked CEFR c2 and rejects garbage c3', () => {
    const base = {
      lang: 'en',
      streak: 1,
      dateKey: '2026-09-20',
      wordLength: 5,
      won: true,
      mode: 'daily',
    }
    expect(pickShareCardPayload({ ...base, cefr: 'c2' })).toMatchObject({
      cefr: 'c2',
    })
    expect(pickShareCardPayload({ ...base, cefr: 'c3' })).toBeNull()
  })
})

describe('formatShareText / filename', () => {
  test('clipboard text has stats, stable /share?p= URL, and no lemma', () => {
    const payload = buildShareCardPayload(sampleRound())
    const url = buildSharePageUrl(payload, 'https://example.test')
    const text = formatShareText(payload, url)
    expect(text).toContain('Hiato')
    expect(text).toContain('EN')
    expect(text).toContain('A1')
    expect(text).toContain('Solved')
    expect(text).toContain('6 letters')
    expect(text).toContain('Streak 4')
    expect(text).toContain('2026-09-20')
    expect(text).toContain('/share?p=')
    expect(text).toContain(url)
    expect(text.toLowerCase()).not.toContain('banana')
    expect(shareCardFilename(payload)).toBe('hiato-2026-09-20-en-a1.png')
    expect(shareCardFilename(payload).toLowerCase()).not.toContain('banana')
  })

  test('practice filename does not include the lemma', () => {
    const payload = buildShareCardPayload({
      ...sampleRound(),
      mode: 'practice',
    })
    expect(shareCardFilename(payload)).toBe(
      'hiato-2026-09-20-en-a1-practice.png',
    )
  })
})

describe('share-card fonts (ADR 0020)', () => {
  test('bundled font URLs are same-origin /fonts/*.woff2, incl. the Jersey face', () => {
    const urls = shareCardFontUrls()
    expect(urls.length).toBe(4)
    expect(urls).toEqual([...SHARE_CARD_FONT_URLS, ...SHARE_CARD_PIXEL_FONT_URLS])
    expect(SHARE_CARD_PIXEL_FONT_FAMILY).toBe('HiatoShareJersey')
    expect(SHARE_CARD_PIXEL_FONT_URLS).toEqual(['/fonts/jersey-10-latin-400-normal.woff2'])
    for (const url of urls) {
      expect(isSameOriginFontUrl(url)).toBe(true)
      expect(url.startsWith('/fonts/')).toBe(true)
      expect(url.endsWith('.woff2')).toBe(true)
      expect(url.toLowerCase()).not.toContain('fonts.googleapis')
      expect(url.toLowerCase()).not.toContain('fonts.gstatic')
    }
  })

  test('rejects Google Fonts and other remote CDNs', () => {
    expect(
      isSameOriginFontUrl('https://fonts.googleapis.com/css2?family=Inter'),
    ).toBe(false)
    expect(
      isSameOriginFontUrl(
        'https://fonts.gstatic.com/s/inter/v13/UcCO3FwrK3iLTeHuS_fvQtMwCp50KnMw2boKoduKmMEVuLyfAZ9hjp-Ek-_EeA.woff2',
      ),
    ).toBe(false)
    expect(
      isSameOriginFontUrl(
        'https://cdn.jsdelivr.net/npm/@fontsource/inter/files/inter-latin-400-normal.woff2',
      ),
    ).toBe(false)
    expect(isSameOriginFontUrl('//fonts.googleapis.com/css?family=Inter')).toBe(
      false,
    )
    expect(isSameOriginFontUrl('https://evil.example/fonts/x.woff2')).toBe(
      false,
    )
    expect(isSameOriginFontUrl('')).toBe(false)
  })

  test('woff2 files and OFL licenses ship in public/fonts', async () => {
    for (const url of shareCardFontUrls()) {
      const file = path.join(REPO, 'public', url.replace(/^\//, ''))
      expect(Bun.file(file).size).toBeGreaterThan(1000)
    }
    const license = await Bun.file(
      path.join(REPO, 'public/fonts/LICENSE.txt'),
    ).text()
    expect(license).toContain('SIL OPEN FONT LICENSE')
    expect(license).toContain('Inter Project Authors')
    const jerseyLicense = await Bun.file(
      path.join(REPO, 'public/fonts/Jersey10-OFL.txt'),
    ).text()
    expect(jerseyLicense).toContain('SIL OPEN FONT LICENSE')
    expect(jerseyLicense).toContain('Soft Type Project Authors')
    const notice = await Bun.file(path.join(REPO, 'NOTICE')).text()
    expect(notice).toContain('SIL Open Font License')
    expect(notice).toContain('Inter')
    expect(notice).toContain('Jersey 10')
    expect(notice).toContain('Jersey10-OFL.txt')
  })

  test('ShareCard does not wrap stats in role=img; new graphics are aria-hidden', async () => {
    const src = await Bun.file(
      path.join(REPO, 'src/components/ShareCard.tsx'),
    ).text()
    expect(src).not.toContain('role="img"')
    expect(src).not.toContain("role='img'")
    expect(src).toContain('alt=""')
    // the ✓ is drawn as check.svg; the outcome string stays as sr-only text
    expect(src).toContain('name="check"')
    expect(src).toContain('sr-only')
    // hidden-letter tile row is decorative and never shows the answer
    expect(src).toContain('aria-hidden="true"')
    expect(src).not.toMatch(/payload\.word(?!Length)/)
  })

  test('share-card path sources never mention font CDNs', async () => {
    const files = [
      'src/lib/share-card.ts',
      'src/lib/share-render.ts',
      'src/lib/share-actions.ts',
      'src/components/ShareCard.tsx',
      'src/pages/Share.tsx',
      'src/index.css',
    ]
    const remote = /https?:\/\/fonts\.(googleapis|gstatic)\.com|\/\/fonts\.(googleapis|gstatic)\.com/i
    for (const rel of files) {
      const text = await Bun.file(path.join(REPO, rel)).text()
      expect(remote.test(text)).toBe(false)
    }
  })
})

describe('share PNG palette (ADR 0052 §5.10 — always light Cartridge)', () => {
  test('share-render freezes the light Cartridge hex values', async () => {
    const src = await Bun.file(path.join(REPO, 'src/lib/share-render.ts')).text()
    expect(src).toContain("const CREAM = '#f3ecd8'")
    expect(src).toContain("const RAISED = '#fffaee'")
    expect(src).toContain("const INK = '#1b1830'")
    expect(src).toContain("const INK_MUTED = '#545068'")
    expect(src).toContain("const LINE = '#77708c'")
    expect(src).toContain("const ACCENT = '#1c6e42'")
    expect(src).toContain("const ACCENT_FG = '#17633b'")
    expect(src).toContain("const ACCENT_SOFT = '#dcefd9'")
    expect(src).toContain("const COIN = '#b86e00'")
    expect(src).toContain("const DANGER = '#a8261c'")
    // flat cream background, no dot grid / scanlines / theme detection
    expect(src).toContain('ctx.fillStyle = CREAM')
    expect(src).not.toContain('prefers-color-scheme')
    expect(src).not.toContain('matchMedia')
    expect(src).not.toContain('roundRect')
    // pixel frames are fillRect-based; stripe + mark + check come from rect data
    expect(src).toContain('pixelFrame(')
    expect(src).toContain("drawPixelIcon(ctx, 'mark'")
    expect(src).toContain("drawPixelIcon(ctx, 'check'")
    expect(src).toContain("drawPixelIcon(ctx, 'flame'")
    // the Jersey face is a second same-origin FontFace family
    expect(src).toContain('SHARE_CARD_PIXEL_FONT_FAMILY')
    const cardLib = await Bun.file(path.join(REPO, 'src/lib/share-card.ts')).text()
    expect(cardLib).toContain("SHARE_CARD_PIXEL_FONT_FAMILY = 'HiatoShareJersey'")
    expect(cardLib).toContain("'/fonts/jersey-10-latin-400-normal.woff2'")
    const hidden = src.indexOf("fillText('Answer hidden — come play yours'")
    expect(src.slice(src.lastIndexOf('ctx.fillStyle', hidden), hidden)).toContain('INK_MUTED')
    const label = src.indexOf('.toUpperCase()')
    expect(src.slice(src.lastIndexOf('ctx.fillStyle', label), label)).toContain('INK_MUTED')
  })

  test('share-render falls back to Inter 600 when Jersey fails, and retries on the next save (#270)', async () => {
    const src = await Bun.file(path.join(REPO, 'src/lib/share-render.ts')).text()
    // Jersey-fails path: pixel values render in Inter 600 at the same positions
    expect(src).toContain("pixelFontOk ? '400' : '600'")
    // a failed pixel-face load re-arms the loader so the next save retries Jersey
    expect(src).toMatch(/pixelFontOk = false\s*\n\s*fontsReady = null/)
  })

  test('share page says the saved image stays cream', async () => {
    const src = await Bun.file(path.join(REPO, 'src/pages/Share.tsx')).text()
    expect(src).toContain('The saved image stays cream.')
  })
})

describe('payload allowlist', () => {
  test('ShareCardPayload type keys stay no-spoiler', () => {
    const payload: ShareCardPayload = buildShareCardPayload(sampleRound())
    for (const key of Object.keys(payload)) {
      expect(['word', 'lemma', 'answer', 'gloss', 'synonyms']).not.toContain(
        key,
      )
    }
  })
})
