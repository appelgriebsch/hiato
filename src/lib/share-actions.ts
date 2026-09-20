import {
  formatShareText,
  shareCardFilename,
  type ShareCardPayload,
} from './share-card'
import { renderShareCardPng } from './share-render'

export type ShareMethod =
  | 'web-share'
  | 'download'
  | 'clipboard'
  | 'cancelled'
  | 'unsupported'

export type ShareOutcome = {
  ok: boolean
  method?: ShareMethod
  message: string
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
  message: 'Share not available — try Copy or Download',
}

/** Web Share when available; never auto-download. Copy/Download stay explicit. */
export async function shareResult(
  payload: ShareCardPayload,
): Promise<ShareOutcome> {
  const text = formatShareText(payload, pageOrigin())
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
        return { ok: true, method: 'web-share', message: 'Shared' }
      }
      await nav.share({ title: 'Hiato', text })
      return { ok: true, method: 'web-share', message: 'Shared' }
    } catch (err) {
      if (isAbort(err)) {
        return { ok: true, method: 'cancelled', message: 'Cancelled' }
      }
      // Non-abort share failure: soft-fallback to clipboard text only (no download).
      const copied = await writeClipboardText(text)
      if (copied) return { ok: true, method: 'clipboard', message: 'Copied' }
      return UNSUPPORTED
    }
  }

  // navigator.share missing — do not auto-triggerDownload.
  const copied = await writeClipboardText(text)
  if (copied) return { ok: true, method: 'clipboard', message: 'Copied' }
  return UNSUPPORTED
}

export async function downloadShareCard(
  payload: ShareCardPayload,
): Promise<ShareOutcome> {
  try {
    const file = await pngFile(payload)
    await triggerDownload(file)
    return { ok: true, method: 'download', message: 'Image saved' }
  } catch {
    return { ok: false, message: 'Couldn’t save image' }
  }
}

export async function copyShareText(
  payload: ShareCardPayload,
): Promise<ShareOutcome> {
  const text = formatShareText(payload, pageOrigin())
  const copied = await writeClipboardText(text)
  if (copied) return { ok: true, method: 'clipboard', message: 'Copied' }
  return { ok: false, message: 'Couldn’t copy' }
}
