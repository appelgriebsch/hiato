import { letterCountLabel } from '../engine'
import { PIXEL_ICONS, type PixelIconName } from '../brand/pixel-icons'
import {
  SHARE_CARD_FONT_FAMILY,
  SHARE_CARD_FONT_URLS,
  SHARE_CARD_FONT_WEIGHTS,
  SHARE_CARD_PIXEL_FONT_FAMILY,
  SHARE_CARD_PIXEL_FONT_URLS,
  SHARE_CARD_PIXEL_FONT_WEIGHTS,
  isSameOriginFontUrl,
  shareCardCefrLabel,
  shareCardKicker,
  shareCardLangLabel,
  shareCardOutcome,
  type ShareCardPayload,
} from './share-card'

/**
 * Retro share PNG (ADR 0052 §5.10): always light "Cartridge", flat cream
 * background (no dot grid), pixel frames drawn with fillRect, the arcade
 * stripe, the pixel mark, a hidden-letter tile row and the check drawn from
 * rect data (neither Inter nor Jersey has U+2713). 720×780 CSS px at SCALE 2.
 */
const CREAM = '#f3ecd8'
const RAISED = '#fffaee'
const INK = '#1b1830'
const INK_MUTED = '#545068'
const LINE = '#77708c'
const ACCENT = '#1c6e42'
const ACCENT_FG = '#17633b'
const ACCENT_SOFT = '#dcefd9'
const COIN = '#b86e00'
const DANGER = '#a8261c'

export const SHARE_CARD_WIDTH = 720
export const SHARE_CARD_HEIGHT = 780
const SCALE = 2

let fontsReady: Promise<void> | null = null
let pixelFontOk = false

function font(weight: string, size: number): string {
  return `${weight} ${size}px ${SHARE_CARD_FONT_FAMILY}, Inter, ui-sans-serif, system-ui, sans-serif`
}

/** Pixel face; falls back to Inter 600 at the same positions when Jersey failed. */
function fontPixel(size: number): string {
  const weight = pixelFontOk ? '400' : '600'
  return `${weight} ${size}px ${SHARE_CARD_PIXEL_FONT_FAMILY}, ${SHARE_CARD_FONT_FAMILY}, Inter, ui-sans-serif, system-ui, sans-serif`
}

/** 2px square pixel frame (notched corners) drawn with fillRect. */
function pixelFrame(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  color: string,
  t = 2,
): void {
  ctx.fillStyle = color
  ctx.fillRect(x, y, w, t)
  ctx.fillRect(x, y + h - t, w, t)
  ctx.fillRect(x, y, t, h)
  ctx.fillRect(x + w - t, y, t, h)
}

const PIXEL_VALUE = 37.33
const PIXEL_MIN = 18.67

/** Shrink a Jersey value until it fits the score cell, then paint it in ink. */
function fillPixelFitted(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxW: number,
): void {
  let size = PIXEL_VALUE
  ctx.font = fontPixel(size)
  while (size > PIXEL_MIN && ctx.measureText(text).width > maxW) {
    size -= 1
    ctx.font = fontPixel(size)
  }
  // drawPixelIcon leaves its last fill (coin on the flame). Values are ink.
  ctx.fillStyle = INK
  ctx.fillText(text, x, y)
}

function drawPixelIcon(
  ctx: CanvasRenderingContext2D,
  name: PixelIconName,
  x: number,
  y: number,
  size: number,
  color: string,
  color2?: string,
): void {
  const s = size / 16
  for (const r of PIXEL_ICONS[name]) {
    ctx.fillStyle = r.c === '2' ? (color2 ?? color) : color
    ctx.fillRect(x + r.x * s, y + r.y * s, r.w * s, r.h * s)
  }
}

/**
 * Load self-hosted Inter + Jersey 10 via FontFace. Refuses any non-same-origin
 * URL so a future edit cannot silently pull Google Fonts (ADR 0020).
 * The Jersey face loads on its own so its failure never blocks Inter.
 */
export function ensureShareCardFonts(): Promise<void> {
  if (fontsReady) return fontsReady
  const ready = (async () => {
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
    try {
      for (let i = 0; i < SHARE_CARD_PIXEL_FONT_URLS.length; i++) {
        const url = SHARE_CARD_PIXEL_FONT_URLS[i]
        if (!isSameOriginFontUrl(url)) {
          throw new Error(`share-card font is not same-origin: ${url}`)
        }
        const face = new FontFace(
          SHARE_CARD_PIXEL_FONT_FAMILY,
          `url("${url}") format("woff2")`,
          { weight: SHARE_CARD_PIXEL_FONT_WEIGHTS[i], style: 'normal', display: 'swap' },
        )
        document.fonts.add(await face.load())
      }
      pixelFontOk = true
    } catch {
      // Offline cold start without precache: keep Inter 600 at the same
      // positions, and re-arm the loader so the next save retries Jersey.
      pixelFontOk = false
      fontsReady = null
    }
  })().catch((err) => {
    fontsReady = null
    throw err
  })
  fontsReady = ready
  return ready
}

function drawShareCard(
  ctx: CanvasRenderingContext2D,
  payload: ShareCardPayload,
  w: number,
  h: number,
): void {
  // Flat cream — no dot grid, so the PNG compresses well and stays identical everywhere.
  ctx.fillStyle = CREAM
  ctx.fillRect(0, 0, w, h)

  // 10px arcade stripe: repeating 12px blocks of accent / coin / danger.
  const stripeColors = [ACCENT, COIN, DANGER]
  for (let x = 0; x < w; x += 12) {
    ctx.fillStyle = stripeColors[(x / 12) % 3]!
    ctx.fillRect(x, 0, 12, 10)
  }

  ctx.textAlign = 'center'
  ctx.textBaseline = 'alphabetic'

  // Pixel mark + wordmark.
  drawPixelIcon(ctx, 'mark', w / 2 - 24, 34, 48, ACCENT, RAISED)
  ctx.fillStyle = ACCENT_FG
  ctx.font = fontPixel(56)
  ctx.fillText('Hiato', w / 2, 132)

  ctx.fillStyle = INK_MUTED
  ctx.font = font('400', 18)
  ctx.fillText(shareCardKicker(payload), w / 2, 168)

  // Score panel: raised, 2px line pixel frame, 2×2 grid.
  const panelX = 56
  const panelY = 204
  const panelW = w - 112
  const panelH = 240
  ctx.fillStyle = RAISED
  ctx.fillRect(panelX, panelY, panelW, panelH)
  pixelFrame(ctx, panelX, panelY, panelW, panelH, LINE)

  const cells: [string, string, boolean][] = [
    ['Language', shareCardLangLabel(payload.lang), false],
    ['Level', shareCardCefrLabel(payload.cefr), false],
    ['Streak', String(payload.streak), true],
    ['Date', payload.dateKey, false],
  ]
  const colW = panelW / 2
  const rowH = panelH / 2
  ctx.textAlign = 'left'
  for (let i = 0; i < cells.length; i++) {
    const col = i % 2
    const row = Math.floor(i / 2)
    const x = panelX + 28 + col * colW
    const y = panelY + 40 + row * rowH
    ctx.fillStyle = INK_MUTED
    ctx.font = font('600', 14)
    fillTrackedLeft(ctx, cells[i][0].toUpperCase(), x, y, 0.84)
    const valueX = cells[i][2] ? x + 30 : x
    if (cells[i][2]) {
      drawPixelIcon(ctx, 'flame', x, y + 14, 22, COIN, DANGER)
    }
    const maxW = panelX + (col + 1) * colW - 28 - valueX
    fillPixelFitted(ctx, cells[i][1], valueX, y + 46, maxW)
  }

  // Hidden-letter tiles: one empty · tile per letter — never the answer.
  const tile = 44
  const gap = 8
  const rowW = payload.wordLength * tile + Math.max(0, payload.wordLength - 1) * gap
  let tileX = (w - rowW) / 2
  const tileY = 496
  ctx.font = font('600', 20)
  ctx.textAlign = 'center'
  for (let i = 0; i < payload.wordLength; i++) {
    ctx.fillStyle = RAISED
    ctx.fillRect(tileX, tileY, tile, tile)
    pixelFrame(ctx, tileX, tileY, tile, tile, LINE)
    ctx.fillStyle = INK_MUTED
    ctx.textBaseline = 'middle'
    ctx.fillText('·', tileX + tile / 2, tileY + tile / 2 + 1)
    ctx.textBaseline = 'alphabetic'
    tileX += tile + gap
  }

  // Outcome badge: win = accent tone with a drawn ✓; non-win = neutral.
  const outcome = shareCardOutcome(payload)
  const visible = payload.won ? outcome.replace('✓', '').trim() : outcome
  const badgeText = `${visible} · ${letterCountLabel(payload.wordLength)}`
  ctx.font = fontPixel(28)
  const textW = ctx.measureText(badgeText).width
  const iconW = payload.won ? 24 : 0
  const padX = 28
  const badgeW = textW + iconW + padX * 2
  const badgeH = 52
  const badgeX = (w - badgeW) / 2
  const badgeY = 588
  if (payload.won) {
    ctx.fillStyle = ACCENT_SOFT
    ctx.fillRect(badgeX, badgeY, badgeW, badgeH)
    pixelFrame(ctx, badgeX, badgeY, badgeW, badgeH, ACCENT_FG)
    drawPixelIcon(ctx, 'check', badgeX + padX, badgeY + (badgeH - 22) / 2, 22, ACCENT_FG)
    ctx.fillStyle = ACCENT_FG
  } else {
    ctx.fillStyle = RAISED
    ctx.fillRect(badgeX, badgeY, badgeW, badgeH)
    pixelFrame(ctx, badgeX, badgeY, badgeW, badgeH, LINE)
    ctx.fillStyle = INK
  }
  ctx.textAlign = 'left'
  ctx.textBaseline = 'middle'
  ctx.fillText(badgeText, badgeX + padX + iconW, badgeY + badgeH / 2 + 1)
  ctx.textBaseline = 'alphabetic'
  ctx.textAlign = 'center'

  ctx.fillStyle = INK_MUTED
  ctx.font = font('400', 16)
  ctx.fillText('Answer hidden — come play yours', w / 2, 716)
}

function fillTrackedLeft(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  tracking: number,
): void {
  let cx = x
  for (const c of Array.from(text)) {
    ctx.fillText(c, cx, y)
    cx += ctx.measureText(c).width + tracking
  }
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
