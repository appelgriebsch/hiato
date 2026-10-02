/**
 * Client-only stable share URL tokens (ADR 0036 / epic #78).
 * Token = base64url(JSON of SHARE_CARD_KEYS). Forgeable; no HMAC / D1.
 * Never encode lemma, gloss, or answer.
 */
import {
  SHARE_CARD_KEYS,
  pickShareCardPayload,
  type ShareCardPayload,
} from './share-card'

const FORBIDDEN_TOKEN_KEYS = [
  'lemma',
  'gloss',
  'word',
  'answer',
  'synonyms',
] as const

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = ''
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]!)
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function base64UrlToBytes(token: string): Uint8Array | null {
  try {
    const normalized = token.replace(/-/g, '+').replace(/_/g, '/')
    const pad =
      normalized.length % 4 === 0
        ? ''
        : '='.repeat(4 - (normalized.length % 4))
    const binary = atob(normalized + pad)
    const out = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) {
      out[i] = binary.charCodeAt(i)
    }
    return out
  } catch {
    return null
  }
}

/** Allowlist-only object for JSON (strips any leaked spoiler fields). */
export function shareUrlPayloadJson(
  payload: ShareCardPayload,
): Record<string, unknown> {
  const clean = pickShareCardPayload(payload)
  if (!clean) {
    throw new Error('invalid ShareCardPayload for URL token')
  }
  const obj: Record<string, unknown> = {}
  for (const key of SHARE_CARD_KEYS) {
    obj[key] = clean[key]
  }
  return obj
}

/** Encode SHARE_CARD_KEYS → base64url token for `?p=`. */
export function encodeShareUrlToken(payload: ShareCardPayload): string {
  const json = JSON.stringify(shareUrlPayloadJson(payload))
  return bytesToBase64Url(new TextEncoder().encode(json))
}

/**
 * Decode `p=` token → ShareCardPayload, or null if missing/corrupt.
 * Forbidden fields (lemma, gloss, word, answer) are stripped via pickShareCardPayload.
 */
export function decodeShareUrlToken(
  token: string | null | undefined,
): ShareCardPayload | null {
  if (typeof token !== 'string' || token.length === 0) return null
  const bytes = base64UrlToBytes(token)
  if (!bytes || bytes.length === 0) return null
  try {
    const raw: unknown = JSON.parse(new TextDecoder().decode(bytes))
    if (!raw || typeof raw !== 'object') return null
    const record = raw as Record<string, unknown>
    for (const key of FORBIDDEN_TOKEN_KEYS) {
      delete record[key]
    }
    return pickShareCardPayload(record)
  } catch {
    return null
  }
}

/** Absolute `/share?p=…` URL for clipboard / Web Share text. */
export function buildSharePageUrl(
  payload: ShareCardPayload,
  origin: string,
): string {
  const base = origin.replace(/\/$/, '')
  return `${base}/share?p=${encodeShareUrlToken(payload)}`
}

/** True when a navigateFallbackDenylist regex would block `/share` navigations. */
export function denylistBlocksSharePath(pattern: RegExp): boolean {
  return pattern.test('/share') || pattern.test('/share?p=x')
}
