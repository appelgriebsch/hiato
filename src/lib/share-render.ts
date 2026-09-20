import { letterCountLabel } from '../engine'
import {
  SHARE_CARD_FONT_FAMILY,
  SHARE_CARD_FONT_URLS,
  SHARE_CARD_FONT_WEIGHTS,
  isSameOriginFontUrl,
  shareCardCefrLabel,
  shareCardKicker,
  shareCardLangLabel,
  shareCardOutcome,
  type ShareCardPayload,
} from './share-card'

/** Cream / ink tokens matching G0 ShareCard. */
const INK = '#1c1b19'
const INK_MUTED = '#6b6860'
const INK_FAINT = '#9a968c'
const ACCENT = '#3d6b55'
const ACCENT_SOFT = '#eef5f0'
const WHITE = '#ffffff'
const LINE = '#e4e1da'

export const SHARE_CARD_WIDTH = 720
export const SHARE_CARD_HEIGHT = 780
const SCALE = 2

let fontsReady: Promise<void> | null = null

function font(weight: string, size: number): string {
  return `${weight} ${size}px ${SHARE_CARD_FONT_FAMILY}, Inter, ui-sans-serif, system-ui, sans-serif`
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  const rr = Math.min(r, w / 2, h / 2)
  ctx.beginPath()
  ctx.moveTo(x + rr, y)
  ctx.arcTo(x + w, y, x + w, y + h, rr)
  ctx.arcTo(x + w, y + h, x, y + h, rr)
  ctx.arcTo(x, y + h, x, y, rr)
  ctx.arcTo(x, y, x + w, y, rr)
  ctx.closePath()
}

function fillTracked(
  ctx: CanvasRenderingContext2D,
  text: string,
  cx: number,
  y: number,
  tracking: number,
): void {
  const chars = Array.from(text)
  const widths = chars.map((c) => ctx.measureText(c).width)
  const total =
    widths.reduce((a, b) => a + b, 0) + tracking * Math.max(0, chars.length - 1)
  let x = cx - total / 2
  for (let i = 0; i < chars.length; i++) {
    ctx.fillText(chars[i], x, y)
    x += widths[i] + tracking
  }
}

/**
 * Load self-hosted Inter via FontFace. Refuses any non-same-origin URL
 * so a future edit cannot silently pull Google Fonts (ADR 0020).
 */
export function ensureShareCardFonts(): Promise<void> {
  if (fontsReady) return fontsReady
  fontsReady = (async () => {
    if (typeof FontFace === 'undefined' || typeof document === 'undefined') {
      return
    }
    const loads: Promise<FontFace>[] = []
    for (let i = 0; i < SHARE_CARD_FONT_URLS.length; i++) {
      const url = SHARE_CARD_FONT_URLS[i]
      if (!isSameOriginFontUrl(url)) {
        throw new Error(`share-card font is not same-origin: ${url}`)
      }
      const face = new FontFace(
        SHARE_CARD_FONT_FAMILY,
        `url("${url}") format("woff2")`,
        { weight: SHARE_CARD_FONT_WEIGHTS[i], style: 'normal', display: 'swap' },
      )
      loads.push(face.load().then((loaded) => {
        document.fonts.add(loaded)
        return loaded
      }))
    }
    await Promise.all(loads)
  })().catch((err) => {
    fontsReady = null
    throw err
  })
  return fontsReady
}

function drawShareCard(
  ctx: CanvasRenderingContext2D,
  payload: ShareCardPayload,
  w: number,
  h: number,
): void {
  const g = ctx.createLinearGradient(0, 0, 0, h)
  g.addColorStop(0, WHITE)
  g.addColorStop(1, ACCENT_SOFT)
  ctx.fillStyle = g
  ctx.fillRect(0, 0, w, h)

  ctx.textAlign = 'center'
  ctx.textBaseline = 'alphabetic'
  ctx.fillStyle = ACCENT
  ctx.font = font('600', 15)
  fillTracked(ctx, 'HIATO', w / 2, 72, 4.2)

  ctx.fillStyle = INK_MUTED
  ctx.font = font('400', 18)
  ctx.fillText(shareCardKicker(payload), w / 2, 106)

  const panelX = 56
  const panelY = 148
  const panelW = w - 112
  const panelH = 280
  roundRect(ctx, panelX, panelY, panelW, panelH, 20)
  ctx.fillStyle = 'rgba(255,255,255,0.86)'
  ctx.fill()
  ctx.strokeStyle = LINE
  ctx.lineWidth = 1
  ctx.stroke()

  const cells: [string, string][] = [
    ['Language', shareCardLangLabel(payload.lang)],
    ['Level', shareCardCefrLabel(payload.cefr)],
    ['Streak', String(payload.streak)],
    ['Date', payload.dateKey],
  ]
  const colW = panelW / 2
  const rowH = panelH / 2
  ctx.textAlign = 'left'
  for (let i = 0; i < cells.length; i++) {
    const col = i % 2
    const row = Math.floor(i / 2)
    const x = panelX + 28 + col * colW
    const y = panelY + 36 + row * rowH
    ctx.fillStyle = INK_FAINT
    ctx.font = font('500', 12)
    ctx.fillText(cells[i][0].toUpperCase(), x, y)
    ctx.fillStyle = INK
    ctx.font = font('500', 20)
    ctx.fillText(cells[i][1], x, y + 32)
  }

  const pillLabel = `${shareCardOutcome(payload)}  ·  ${letterCountLabel(payload.wordLength)}`
  ctx.font = font('500', 16)
  ctx.textAlign = 'center'
  const pillW = Math.min(panelW, ctx.measureText(pillLabel).width + 48)
  const pillH = 44
  const pillX = (w - pillW) / 2
  const pillY = 468
  ctx.shadowColor = 'rgba(28, 27, 25, 0.08)'
  ctx.shadowBlur = 10
  ctx.shadowOffsetY = 2
  roundRect(ctx, pillX, pillY, pillW, pillH, pillH / 2)
  ctx.fillStyle = WHITE
  ctx.fill()
  ctx.shadowColor = 'transparent'
  ctx.shadowBlur = 0
  ctx.shadowOffsetY = 0
  ctx.fillStyle = INK
  ctx.textBaseline = 'middle'
  ctx.fillText(pillLabel, w / 2, pillY + pillH / 2)

  ctx.textBaseline = 'alphabetic'
  ctx.fillStyle = INK_FAINT
  ctx.font = font('400', 14)
  ctx.fillText('Answer hidden — come play yours', w / 2, 556)
}

export async function renderShareCardPng(
  payload: ShareCardPayload,
): Promise<Blob> {
  if (typeof document === 'undefined') {
    throw new Error('share-card render needs a document')
  }
  try {
    await ensureShareCardFonts()
  } catch {
    // Offline shell still paints with whatever Inter/@font-face already loaded.
  }

  const canvas = document.createElement('canvas')
  canvas.width = SHARE_CARD_WIDTH * SCALE
  canvas.height = SHARE_CARD_HEIGHT * SCALE
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('share-card canvas unavailable')
  ctx.scale(SCALE, SCALE)
  drawShareCard(ctx, payload, SHARE_CARD_WIDTH, SHARE_CARD_HEIGHT)

  return await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob)
      else reject(new Error('share-card PNG encode failed'))
    }, 'image/png')
  })
}
