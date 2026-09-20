import { describe, expect, test } from 'bun:test'
import path from 'node:path'
import {
  SHARE_CARD_FONT_URLS,
  SHARE_CARD_KEYS,
  buildShareCardPayload,
  formatShareText,
  isSameOriginFontUrl,
  pickShareCardPayload,
  shareCardFilename,
  shareCardFontUrls,
  type ShareCardPayload,
} from './share-card'

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
  })
})

describe('formatShareText / filename', () => {
  test('clipboard text has stats and no lemma', () => {
    const payload = buildShareCardPayload(sampleRound())
    const text = formatShareText(payload, 'https://example.test')
    expect(text).toContain('Hiato')
    expect(text).toContain('EN')
    expect(text).toContain('A1')
    expect(text).toContain('Solved')
    expect(text).toContain('6 letters')
    expect(text).toContain('Streak 4')
    expect(text).toContain('2026-09-20')
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
  test('bundled font URLs are same-origin /fonts/*.woff2', () => {
    const urls = shareCardFontUrls()
    expect(urls.length).toBe(3)
    expect(urls).toEqual([...SHARE_CARD_FONT_URLS])
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

  test('woff2 files and OFL license ship in public/fonts', async () => {
    for (const url of SHARE_CARD_FONT_URLS) {
      const file = path.join(REPO, 'public', url.replace(/^\//, ''))
      expect(Bun.file(file).size).toBeGreaterThan(1000)
    }
    const license = await Bun.file(
      path.join(REPO, 'public/fonts/LICENSE.txt'),
    ).text()
    expect(license).toContain('SIL OPEN FONT LICENSE')
    expect(license).toContain('Inter Project Authors')
    const notice = await Bun.file(path.join(REPO, 'NOTICE')).text()
    expect(notice).toContain('SIL Open Font License')
    expect(notice).toContain('Inter')
  })

  test('ShareCard does not wrap stats in role=img', async () => {
    const src = await Bun.file(
      path.join(REPO, 'src/components/ShareCard.tsx'),
    ).text()
    expect(src).not.toContain('role="img"')
    expect(src).not.toContain("role='img'")
    expect(src).toContain('alt=""')
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
