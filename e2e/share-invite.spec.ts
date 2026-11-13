import { expect, test } from '@playwright/test'

/**
 * Invite-to-play e2e (#274 / #275, ADR 0036 amendment 2026-11-13, #226).
 * Token encoding mirrors src/lib/share-url.ts (base64url of the SHARE_CARD_KEYS
 * JSON) without importing the app graph.
 */
function shareToken(payload: Record<string, unknown>): string {
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url')
}

function sharePath(payload: Record<string, unknown>): string {
  return `/share?p=${encodeURIComponent(shareToken(payload))}`
}

const DAILY_PAYLOAD = {
  lang: 'en',
  cefr: 'a1',
  streak: 4,
  dateKey: '2026-11-13',
  wordLength: 6,
  won: true,
  mode: 'daily',
} as const

const PRACTICE_PAYLOAD = {
  lang: 'pt',
  cefr: 'a2',
  streak: 2,
  dateKey: '2026-11-13',
  wordLength: 5,
  won: false,
  mode: 'practice',
} as const

const PLAY_CTA = /Play today’s Daily · EN A1/

test.describe('invite-to-play on share links (#226 / #274 / #275)', () => {
  test('cold daily share link: CTA visible, tap sets prefs and navigates to /play?mode=daily', async ({ page }) => {
    await page.goto(sharePath(DAILY_PAYLOAD))
    const cta = page.getByRole('button', { name: PLAY_CTA })
    await expect(cta).toBeVisible()
    // Consent is the tap, never the open: no prefs written before it.
    await expect
      .poll(() => page.evaluate(() => localStorage.getItem('hiato.prefs')))
      .toBeNull()
    await cta.click()
    await expect(page).toHaveURL(/\/play\?mode=daily$/)
    await expect
      .poll(() => page.evaluate(() => localStorage.getItem('hiato.prefs')))
      .toBe(JSON.stringify({ lang: 'en', cefr: 'a1' }))
    // The daily actually starts in the invited lang×CEFR.
    await expect(page.locator('[data-letter-pad]:visible').first()).toBeVisible()
  })

  test('practice share link offers no play CTA', async ({ page }) => {
    await page.goto(sharePath(PRACTICE_PAYLOAD))
    await expect(page.getByRole('button', { name: 'Share', exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: /Play today/ })).toHaveCount(0)
  })

  test('corrupt p= soft-fails to the empty Share UX, no CTA', async ({ page }) => {
    await page.goto('/share?p=!!!not-a-token!!!')
    await expect(page.getByRole('status')).toHaveText(/can’t be opened/)
    await expect(page.getByRole('button', { name: /Play today/ })).toHaveCount(0)
  })
})
