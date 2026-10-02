import { describe, expect, test } from 'bun:test'
import { existsSync } from 'node:fs'
import path from 'node:path'
import {
  SHARE_CARD_KEYS,
  buildShareCardPayload,
  formatShareText,
  shareCardFilename,
  shareCardKicker,
  type ShareCardPayload,
} from './share-card'
import {
  SHARE_URL_TOKEN_MAX_CHARS,
  buildSharePageUrl,
  decodeShareUrlToken,
  denylistBlocksSharePath,
  encodeShareUrlToken,
  resolveSharePayload,
  sharePathWithToken,
  shareUrlPayloadJson,
} from './share-url'

const REPO = path.join(import.meta.dir, '../..')
const SAMPLE_LEMMA = 'BANANA'
const ORIGIN = 'https://hiato.example'

function sampleDaily(): ShareCardPayload {
  return buildShareCardPayload({
    lang: 'en',
    cefr: 'a1',
    streak: 4,
    dateKey: '2026-09-20',
    word: SAMPLE_LEMMA,
    won: true,
    mode: 'daily',
  })
}

function samplePractice(): ShareCardPayload {
  return buildShareCardPayload({
    lang: 'pt',
    cefr: 'a2',
    streak: 2,
    dateKey: '2026-09-20',
    word: 'AÇÃO',
    won: false,
    mode: 'practice',
  })
}

describe('SUR-encode (#106) — encode/decode SHARE_CARD_KEYS', () => {
  test('round-trips allowlisted fields with fidelity', () => {
    const payload = sampleDaily()
    const token = encodeShareUrlToken(payload)
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/)
    expect(token).not.toContain('+')
    expect(token).not.toContain('/')
    expect(token).not.toContain('=')
    const decoded = decodeShareUrlToken(token)
    expect(decoded).toEqual(payload)
    expect(Object.keys(decoded!).sort()).toEqual([...SHARE_CARD_KEYS].sort())
  })

  test('JSON blob contains only SHARE_CARD_KEYS', () => {
    const keys = Object.keys(shareUrlPayloadJson(sampleDaily())).sort()
    expect(keys).toEqual([...SHARE_CARD_KEYS].sort())
  })

  test('strips lemma, gloss, word, answer, synonyms from polluted encode input', () => {
    const polluted = {
      ...sampleDaily(),
      word: SAMPLE_LEMMA,
      lemma: SAMPLE_LEMMA,
      gloss: 'a yellow fruit',
      answer: SAMPLE_LEMMA,
      synonyms: ['plantain'],
    } as ShareCardPayload & Record<string, unknown>
    const token = encodeShareUrlToken(polluted)
    const decoded = decodeShareUrlToken(token)
    expect(decoded).not.toBeNull()
    expect(decoded).not.toHaveProperty('word')
    expect(decoded).not.toHaveProperty('lemma')
    expect(decoded).not.toHaveProperty('gloss')
    expect(decoded).not.toHaveProperty('answer')
    expect(decoded).not.toHaveProperty('synonyms')
    const lower = JSON.stringify(decoded).toLowerCase()
    expect(lower).not.toContain('banana')
    expect(lower).not.toContain('fruit')
    expect(lower).not.toContain('plantain')
    expect(token.toLowerCase()).not.toContain('banana')
  })

  test('decode strips forbidden fields present inside the token JSON', () => {
    const spoilerJson = JSON.stringify({
      ...sampleDaily(),
      lemma: SAMPLE_LEMMA,
      gloss: 'fruit',
      word: SAMPLE_LEMMA,
      answer: SAMPLE_LEMMA,
      synonyms: ['plantain'],
    })
    const token = btoa(spoilerJson)
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '')
    const decoded = decodeShareUrlToken(token)
    expect(decoded).not.toBeNull()
    expect(decoded).toEqual(sampleDaily())
    expect(JSON.stringify(decoded).toLowerCase()).not.toContain('banana')
    expect(JSON.stringify(decoded).toLowerCase()).not.toContain('fruit')
  })

  test('rejects missing, empty, and corrupt tokens', () => {
    expect(decodeShareUrlToken(null)).toBeNull()
    expect(decodeShareUrlToken(undefined)).toBeNull()
    expect(decodeShareUrlToken('')).toBeNull()
    expect(decodeShareUrlToken('!!!not-base64!!!')).toBeNull()
    expect(decodeShareUrlToken(btoa('not-json').replace(/=+$/, ''))).toBeNull()
    expect(
      decodeShareUrlToken(
        btoa(JSON.stringify({ lang: 'en' })).replace(/=+$/, ''),
      ),
    ).toBeNull()
  })

  test('rejects oversized p= tokens before atob+JSON.parse', () => {
    const oversized = 'A'.repeat(SHARE_URL_TOKEN_MAX_CHARS + 1)
    expect(oversized.length).toBeGreaterThan(SHARE_URL_TOKEN_MAX_CHARS)
    expect(decodeShareUrlToken(oversized)).toBeNull()
  })
})

describe('SUR-text-wire (#108) — absolute /share?p= in share text', () => {
  test('buildSharePageUrl is absolute /share?p= (percent-encoded) and round-trips', () => {
    const payload = sampleDaily()
    const url = buildSharePageUrl(payload, ORIGIN)
    expect(url.startsWith(`${ORIGIN}/share?p=`)).toBe(true)
    const rawQuery = url.slice(url.indexOf('?p=') + 3)
    expect(rawQuery).toBe(encodeURIComponent(decodeURIComponent(rawQuery)))
    expect(sharePathWithToken(payload)).toBe(
      `/share?p=${encodeURIComponent(encodeShareUrlToken(payload))}`,
    )
    const token = new URL(url).searchParams.get('p')
    expect(decodeShareUrlToken(token)).toEqual(payload)
  })

  test('formatShareText appends stable share URL (not bare origin)', () => {
    const payload = sampleDaily()
    const url = buildSharePageUrl(payload, ORIGIN)
    const text = formatShareText(payload, url)
    expect(text).toContain(url)
    expect(text).toContain('/share?p=')
    expect(text.toLowerCase()).not.toContain('banana')
    // Bare origin alone is not the share line when URL is provided.
    const lines = text.split('\n')
    expect(lines.at(-1)).toBe(url)
  })

  test('PNG filename path still omits lemma', () => {
    expect(shareCardFilename(sampleDaily())).toBe('hiato-2026-09-20-en-a1.png')
    expect(shareCardFilename(samplePractice())).toBe(
      'hiato-2026-09-20-pt-a2-practice.png',
    )
    expect(shareCardFilename(sampleDaily()).toLowerCase()).not.toContain(
      'banana',
    )
  })
})

describe('SUR-spoiler-matrix (#109) — daily vs practice (ADR 0018)', () => {
  // ADR 0018: endless practice never selects today's daily lemma.
  // Share URLs must never carry lemma/answer/gloss for either mode.

  test('daily URL may include dateKey + stats; never lemma/answer/gloss', () => {
    const payload = sampleDaily()
    const url = buildSharePageUrl(payload, ORIGIN)
    const token = new URL(url).searchParams.get('p')!
    const decoded = decodeShareUrlToken(token)!
    expect(decoded.mode).toBe('daily')
    expect(decoded.dateKey).toBe('2026-09-20')
    expect(decoded.won).toBe(true)
    expect(decoded.streak).toBe(4)
    expect(decoded.wordLength).toBe(6)
    const blob = `${url}\n${JSON.stringify(decoded)}\n${formatShareText(payload, url)}`
    expect(blob.toLowerCase()).not.toContain('banana')
    expect(blob.toLowerCase()).not.toContain('lemma')
    expect(blob.toLowerCase()).not.toContain('gloss')
    // Payload / URL must not carry the answer field; copy may say "Answer hidden".
    expect(JSON.stringify(decoded)).not.toContain('"answer"')
    expect(url.toLowerCase()).not.toContain('banana')
  })

  test('practice uses same allowlist, distinct copy, never lemma', () => {
    const payload = samplePractice()
    const url = buildSharePageUrl(payload, ORIGIN)
    const text = formatShareText(payload, url)
    const decoded = decodeShareUrlToken(new URL(url).searchParams.get('p'))!
    expect(decoded.mode).toBe('practice')
    expect(Object.keys(decoded).sort()).toEqual([...SHARE_CARD_KEYS].sort())
    expect(text).toContain('Practice')
    expect(text).not.toMatch(/Hiato · Daily ·/)
    expect(shareCardKicker(payload)).toBe('Practice round')
    expect(shareCardKicker(sampleDaily())).toBe('Daily word gap')
    expect(text.toLowerCase()).not.toContain('ação')
    expect(text.toLowerCase()).not.toContain('acao')
    expect(url.toLowerCase()).not.toContain('ação')
  })

  test('never leaks tomorrow’s answer (lemma absent even with tomorrow dateKey)', () => {
    const tomorrowLemma = 'ZEBRA'
    const payload = buildShareCardPayload({
      lang: 'en',
      cefr: 'a1',
      streak: 0,
      dateKey: '2026-09-21',
      word: tomorrowLemma,
      won: false,
      mode: 'daily',
    })
    const url = buildSharePageUrl(payload, ORIGIN)
    const text = formatShareText(payload, url)
    expect(url.toLowerCase()).not.toContain('zebra')
    expect(text.toLowerCase()).not.toContain('zebra')
    expect(JSON.stringify(decodeShareUrlToken(new URL(url).searchParams.get('p')))
      .toLowerCase())
      .not.toContain('zebra')
    // dateKey may appear (Wordle-like); answer must not.
    expect(text).toContain('2026-09-21')
  })

  test('practice text is not a daily lookalike', () => {
    const dailyText = formatShareText(
      sampleDaily(),
      buildSharePageUrl(sampleDaily(), ORIGIN),
    )
    const practiceText = formatShareText(
      samplePractice(),
      buildSharePageUrl(samplePractice(), ORIGIN),
    )
    expect(dailyText).toContain('Daily')
    expect(practiceText).toContain('Practice')
    expect(practiceText).not.toContain('Daily')
  })
})


describe('SUR-hydrate (#107) — resolveSharePayload precedence', () => {
  test('valid p= ignores polluted location.state', () => {
    const tokenPayload = sampleDaily()
    const token = encodeShareUrlToken(tokenPayload)
    const pollutedState = {
      ...samplePractice(),
      lemma: SAMPLE_LEMMA,
      gloss: 'spoiler',
    }
    const params = new URLSearchParams({ p: token })
    expect(resolveSharePayload(params, pollutedState)).toEqual(tokenPayload)
  })

  test('empty or corrupt p= soft-fails to null (no state fallthrough)', () => {
    const state = sampleDaily()
    expect(resolveSharePayload(new URLSearchParams({ p: '' }), state)).toBeNull()
    expect(
      resolveSharePayload(new URLSearchParams({ p: '!!!bad!!!' }), state),
    ).toBeNull()
    expect(
      resolveSharePayload(
        new URLSearchParams({ p: 'A'.repeat(SHARE_URL_TOKEN_MAX_CHARS + 1) }),
        state,
      ),
    ).toBeNull()
  })

  test('absent p= uses location.state', () => {
    const state = samplePractice()
    expect(resolveSharePayload(new URLSearchParams(), state)).toEqual(state)
    expect(resolveSharePayload(new URLSearchParams(), null)).toBeNull()
  })
})

describe('SUR-sw-pages (#110) — navigateFallback / _redirects smoke', () => {
  test('VitePWA denylist does not block /share', async () => {
    const vite = await Bun.file(path.join(REPO, 'vite.config.ts')).text()
    expect(vite).toContain("navigateFallback: 'index.html'")
    expect(vite).toContain('navigateFallbackDenylist')
    // Extract denylist regex sources from the config file text and assert.
    expect(vite).toContain('/^\\/api\\//')
    expect(vite).toContain('/^\\/packs\\//')
    expect(vite).not.toMatch(/navigateFallbackDenylist:[\s\S]*?\/share/)
    const patterns = [
      /^\/api\//,
      /^\/packs\//,
      /^\/og-banner\.png/,
      /\/[^/?]+\.[^/]+$/,
    ]
    for (const re of patterns) {
      expect(denylistBlocksSharePath(re)).toBe(false)
    }
  })

  test('_redirects SPA fallback covers /share query URLs', async () => {
    const redirects = await Bun.file(path.join(REPO, 'public/_redirects')).text()
    expect(redirects).toMatch(/\/\*+\s+\/index\.html\s+200/)
  })

  test('_routes.json limits Functions so /share hits SPA _redirects', async () => {
    const routes = JSON.parse(
      await Bun.file(path.join(REPO, 'public/_routes.json')).text(),
    ) as { version: number; include: string[]; exclude: string[] }
    expect(routes.version).toBe(1)
    expect(routes.include).toEqual(['/api/*', '/packs/*'])
    expect(routes.include).not.toContain('/*')
    expect(routes.exclude).toEqual([])
  })

  test('no top-level 404.html (Pages would disable SPA fallback)', async () => {
    expect(existsSync(path.join(REPO, 'public/404.html'))).toBe(false)
    // Build output must not reintroduce it either (Vite copies public/).
    expect(existsSync(path.join(REPO, 'dist/404.html'))).toBe(false)
  })

  test('docs note the share URL smoke checklist', async () => {
    const doc = await Bun.file(
      path.join(REPO, 'docs/cloudflare-pages.md'),
    ).text()
    expect(doc).toContain('/share?p=')
    expect(doc).toContain('navigateFallback')
    expect(doc).toContain('Do not denylist `/share`')
    expect(doc).toContain('_routes.json')
    expect(doc).toContain('/api/*')
    expect(doc).toContain('/packs/*')
    expect(doc).toContain('**Do not** ship `public/404.html`')
    expect(doc).toContain('Function-only')
  })
})
