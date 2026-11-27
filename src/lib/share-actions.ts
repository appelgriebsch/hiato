import type { TParams, UiKey } from '@/i18n'
import {
  formatShareText,
  shareCardFilename,
  type ShareCardPayload,
} from './share-card'
import { renderShareCardPng } from './share-render'
import { buildSharePageUrl } from './share-url'

export type ShareMethod =
  | 'web-share'
  | 'download'
  | 'clipboard'
  | 'cancelled'
  | 'unsupported'

/**
 * Outcome copy is a catalog key (ADR 0062): the Share page renders it through
 * t() in the current UI locale. Share payload text itself stays unlocalized
 * (ADR 0064).
 */
export type ShareOutcome = {
  ok: boolean
  method?: ShareMethod
  messageKey: UiKey
  messageParams?: TParams
}

function isAbort(err: unknown): boolean {
  return (
    (err instanceof DOMException && err.name === 'AbortError') ||
    (err instanceof Error && err.name === 'AbortError')
  )
}

function pageOrigin(): string | undefined {
  if (typeof location === 'undefined') return undefined
  return location.origin
}

/** Absolute `/share?p=…` for clipboard / Web Share text (ADR 0036). */
function shareTextUrl(payload: ShareCardPayload): string | undefined {
  const origin = pageOrigin()
  if (!origin) return undefined
  try {
    return buildSharePageUrl(payload, origin)
  } catch {
    // Encode validates via pick; soft-fail like decode rather than blow share.
    return undefined
  }
}

function canShareFiles(nav: Navigator, file: File, text: string): boolean {
  if (typeof nav.canShare !== 'function') return true
  try {
    return nav.canShare({ title: 'Hiato', text, files: [file] })
  } catch {
    return false
  }
}

async function triggerDownload(file: File): Promise<void> {
  const url = URL.createObjectURL(file)
  try {
    const a = document.createElement('a')
    a.href = url
    a.download = file.name
    a.rel = 'noopener'
    // iOS Safari ignores `download` and opens the image; that's the save path.
    a.target = '_blank'
    document.body.appendChild(a)
    a.click()
    a.remove()
  } finally {
    window.setTimeout(() => URL.revokeObjectURL(url), 2500)
  }
}

async function writeClipboardText(text: string): Promise<boolean> {
  try {
    if (!navigator.clipboard?.writeText) return false
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}

async function pngFile(payload: ShareCardPayload): Promise<File> {
  const blob = await renderShareCardPng(payload)
  return new File([blob], shareCardFilename(payload), { type: 'image/png' })
}

const UNSUPPORTED: ShareOutcome = {
  ok: false,
  method: 'unsupported',
  messageKey: 'share.outcomeUnsupported',
}

/** Web Share when available; never auto-download. Copy/Download stay explicit. */
export async function shareResult(
  payload: ShareCardPayload,
): Promise<ShareOutcome> {
  const text = formatShareText(payload, shareTextUrl(payload))
  const nav = typeof navigator !== 'undefined' ? navigator : undefined

  if (nav && typeof nav.share === 'function') {
    let file: File | null = null
    try {
      file = await pngFile(payload)
    } catch {
      file = null
    }

    try {
      if (file && canShareFiles(nav, file, text)) {
        await nav.share({ title: 'Hiato', text, files: [file] })
        return { ok: true, method: 'web-share', messageKey: 'share.outcomeShared' }
      }
      await nav.share({ title: 'Hiato', text })
      return { ok: true, method: 'web-share', messageKey: 'share.outcomeShared' }
    } catch (err) {
      if (isAbort(err)) {
        return { ok: true, method: 'cancelled', messageKey: 'share.outcomeCancelled' }
      }
      // Non-abort share failure: soft-fallback to clipboard text only (no download).
      const copied = await writeClipboardText(text)
      if (copied) return { ok: true, method: 'clipboard', messageKey: 'share.copied' }
      return UNSUPPORTED
    }
  }

  // navigator.share missing — do not auto-triggerDownload.
  const copied = await writeClipboardText(text)
  if (copied) return { ok: true, method: 'clipboard', messageKey: 'share.copied' }
  return UNSUPPORTED
}

export async function downloadShareCard(
  payload: ShareCardPayload,
): Promise<ShareOutcome> {
  try {
    const file = await pngFile(payload)
    await triggerDownload(file)
    return { ok: true, method: 'download', messageKey: 'share.outcomeImageSaved' }
  } catch {
    return { ok: false, messageKey: 'share.outcomeCouldNotSaveImage' }
  }
}

export async function copyShareText(
  payload: ShareCardPayload,
): Promise<ShareOutcome> {
  const text = formatShareText(payload, shareTextUrl(payload))
  const copied = await writeClipboardText(text)
  if (copied) return { ok: true, method: 'clipboard', messageKey: 'share.copied' }
  return { ok: false, messageKey: 'share.outcomeCouldNotCopy' }
}
