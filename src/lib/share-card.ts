import { letterCountLabel, graphemes } from '../engine'
import { CEFR_CODES, CEFR_LABELS, LANG_CODES, LANG_LABELS } from '../packs/labels'
import { isPackCefr, isPackLang, type PackCefr, type PackLang } from '../packs/schema'

export type ShareMode = 'daily' | 'practice'

/** Fields that may appear on a share card / in share text. Never a lemma. */
export const SHARE_CARD_KEYS = [
  'lang',
  'cefr',
  'streak',
  'dateKey',
  'wordLength',
  'won',
  'mode',
] as const

export type ShareCardPayload = {
  lang: PackLang
  cefr: PackCefr
  streak: number
  dateKey: string
  wordLength: number
  won: boolean
  mode: ShareMode
}

/** Same-origin Inter woff2 used to paint the PNG (ADR 0020). */
export const SHARE_CARD_FONT_FAMILY = 'HiatoShareInter'

export const SHARE_CARD_FONT_URLS = [
  '/fonts/inter-latin-400-normal.woff2',
  '/fonts/inter-latin-500-normal.woff2',
  '/fonts/inter-latin-600-normal.woff2',
] as const

export const SHARE_CARD_FONT_WEIGHTS = ['400', '500', '600'] as const

const FONT_PATH = /^\/fonts\/[A-Za-z0-9._-]+\.woff2$/

const REMOTE_FONT_HOST = /fonts\.googleapis\.com|fonts\.gstatic\.com/i

/**
 * True when `url` is a same-origin `/fonts/*.woff2` file.
 * Rejects Google Fonts, protocol-relative CDNs, and other hosts.
 */
export function isSameOriginFontUrl(url: string): boolean {
  if (typeof url !== 'string') return false
  const trimmed = url.trim()
  if (trimmed.length === 0) return false
  if (REMOTE_FONT_HOST.test(trimmed)) return false
  if (trimmed.startsWith('//')) return false
  if (FONT_PATH.test(trimmed)) return true
  try {
    const base =
      typeof location !== 'undefined' && location.href
        ? location.href
        : 'http://hiato.local/'
    const parsed = new URL(trimmed, base)
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false
    if (REMOTE_FONT_HOST.test(parsed.hostname)) return false
    if (!FONT_PATH.test(parsed.pathname)) return false
    if (typeof location !== 'undefined' && location.origin) {
      return parsed.origin === location.origin
    }
    return false
  } catch {
    return false
  }
}

export function shareCardFontUrls(): readonly string[] {
  return SHARE_CARD_FONT_URLS
}

/** Round result → card payload. `word` is read only for grapheme length. */
export function buildShareCardPayload(input: {
  lang: PackLang
  cefr: PackCefr
  streak: number
  dateKey: string
  word: string
  won: boolean
  mode: ShareMode
}): ShareCardPayload {
  const streak = Number.isFinite(input.streak)
    ? Math.max(0, Math.floor(input.streak))
    : 0
  return {
    lang: input.lang,
    cefr: input.cefr,
    streak,
    dateKey: input.dateKey,
    wordLength: graphemes(input.word).length,
    won: input.won,
    mode: input.mode === 'practice' ? 'practice' : 'daily',
  }
}

/** Strip unknown keys (including any leaked lemma) from navigation state. */
export function pickShareCardPayload(raw: unknown): ShareCardPayload | null {
  if (!raw || typeof raw !== 'object') return null
  const o = raw as Record<string, unknown>
  if (!isPackLang(o.lang) || !isPackCefr(o.cefr)) return null
  if (typeof o.dateKey !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(o.dateKey)) {
    return null
  }
  if (typeof o.streak !== 'number' || !Number.isFinite(o.streak) || o.streak < 0) {
    return null
  }
  if (
    typeof o.wordLength !== 'number' ||
    !Number.isInteger(o.wordLength) ||
    o.wordLength < 1
  ) {
    return null
  }
  if (typeof o.won !== 'boolean') return null
  const mode: ShareMode = o.mode === 'practice' ? 'practice' : 'daily'
  return {
    lang: o.lang,
    cefr: o.cefr,
    streak: Math.floor(o.streak),
    dateKey: o.dateKey,
    wordLength: o.wordLength,
    won: o.won,
    mode,
  }
}

export function shareCardKicker(payload: ShareCardPayload): string {
  return payload.mode === 'practice' ? 'Practice round' : 'Daily word gap'
}

export function shareCardOutcome(payload: ShareCardPayload): string {
  return payload.won ? '✓ Solved' : '· Attempted'
}

export function shareCardFilename(payload: ShareCardPayload): string {
  const base = `hiato-${payload.dateKey}-${payload.lang}-${payload.cefr}`
  return payload.mode === 'practice' ? `${base}-practice.png` : `${base}.png`
}

/**
 * Clipboard / Web Share body. Pass the absolute `/share?p=…` URL
 * (from `buildSharePageUrl`) as `shareUrl` so the deep link travels with the text.
 */
export function formatShareText(
  payload: ShareCardPayload,
  shareUrl?: string,
): string {
  const mode = payload.mode === 'practice' ? 'Practice' : 'Daily'
  const lines = [
    `Hiato · ${mode} · ${LANG_CODES[payload.lang]} ${CEFR_CODES[payload.cefr]}`,
    `${payload.won ? 'Solved' : 'Attempted'} · ${letterCountLabel(payload.wordLength)}`,
    `Streak ${payload.streak} · ${payload.dateKey}`,
    'Answer hidden — come play yours',
  ]
  if (shareUrl) lines.push(shareUrl)
  return lines.join('\n')
}

export function shareCardLangLabel(lang: PackLang): string {
  return LANG_LABELS[lang]
}

export function shareCardCefrLabel(cefr: PackCefr): string {
  return CEFR_LABELS[cefr]
}
