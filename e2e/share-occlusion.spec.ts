import { expect, test, type Locator, type Page } from '@playwright/test'
import { sharePath } from './share-path'

/**
 * #307: after dac6f955 the fixed h-dvh shell left no page scroll, so the
 * sticky footer covered the lower /share card. The shell now grows
 * (min-h-dvh) and the document scrolls. These checks prove that at the
 * acceptance sizes every part of the card (including the "Answer hidden"
 * caption) can be scrolled into view with nothing covering it: the element's
 * box must not intersect the footer and elementFromPoint at its centre must
 * hit the card, not the footer.
 */

const DAILY_PAYLOAD = {
  lang: 'en',
  cefr: 'a1',
  streak: 4,
  dateKey: '2026-11-13',
  wordLength: 6,
  won: true,
  mode: 'daily',
} as const

const CAPTION = 'Answer hidden — come play yours'

const VIEWPORTS = [
  { name: '320x640', width: 320, height: 640 },
  { name: '375x667', width: 375, height: 667 },
  { name: '375x812', width: 375, height: 812 },
  { name: '390x844', width: 390, height: 844 },
] as const

/** Parts of the share card that must each be scrollable clear of the footer. */
const CARD_PARTS = [
  '#hiato-share-card .text-pixel-display',
  '#hiato-share-card .grid',
  '#hiato-share-card .tile-hidden',
  '#hiato-share-card .px-6.pt-5.pb-6 span',
] as const

type Rect = { x: number; y: number; width: number; height: number }

function overlaps(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y
}

async function occlusion(page: Page, locator: Locator) {
  return page.evaluate((el) => {
    const footer = document.querySelector('[data-layout-footer]')
    const rect = el.getBoundingClientRect()
    const footerRect = footer?.getBoundingClientRect() ?? null
    const cx = rect.x + rect.width / 2
    const cy = rect.y + rect.height / 2
    const hit = cx >= 0 && cy >= 0 && cx <= innerWidth && cy <= innerHeight ? document.elementFromPoint(cx, cy) : null
    return {
      el: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
      footer: footerRect
        ? { x: footerRect.x, y: footerRect.y, width: footerRect.width, height: footerRect.height }
        : null,
      hitInTarget: hit != null && el.contains(hit),
      hitInFooter: hit != null && footer != null && footer.contains(hit),
      scrollPaddingBottom: getComputedStyle(document.documentElement).scrollPaddingBottom,
    }
  }, await locator.elementHandle())
}

/** Scrolled into view, box clear of the footer, centre hit lands on the element itself. */
async function expectReachableAndUncovered(page: Page, locator: Locator, where: string) {
  await locator.scrollIntoViewIfNeeded()
  await expect(locator, where).toBeVisible()
  const m = await occlusion(page, locator)
  expect(m.footer, `${where} sticky footer exists`).not.toBeNull()
  expect(overlaps(m.el, m.footer!), `${where} box must not intersect the footer`).toBe(false)
  expect(m.hitInFooter, `${where} elementFromPoint must not hit the footer`).toBe(false)
  expect(m.hitInTarget, `${where} elementFromPoint must hit the element`).toBe(true)
}

test.describe('share card is never covered by the sticky footer (#307)', () => {
  for (const vp of VIEWPORTS) {
    test(`every card part scrolls clear of the footer at ${vp.name}`, async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height })
      await page.goto(sharePath(DAILY_PAYLOAD))
      const card = page.locator('#hiato-share-card')
      await expect(card).toBeVisible()
      const where = `share ${vp.name}`

      // The document scrolls (regression: after dac6f955 it did not).
      const doc = await page.evaluate(() => ({
        scrollH: document.scrollingElement?.scrollHeight ?? 0,
        innerH: window.innerHeight,
      }))
      expect(doc.scrollH, `${where} document scrolls`).toBeGreaterThan(doc.innerH + 1)

      for (const part of CARD_PARTS) {
        await expectReachableAndUncovered(page, page.locator(part).first(), `${where} ${part}`)
      }
      await expectReachableAndUncovered(page, page.getByText(CAPTION), `${where} caption`)

      // At maximum scroll the whole card sits above the footer.
      await page.evaluate(() => {
        const doc = document.scrollingElement
        if (doc) window.scrollTo(0, doc.scrollHeight)
      })
      const bottom = await page.evaluate(() => {
        const card = document.querySelector('#hiato-share-card')
        const footer = document.querySelector('[data-layout-footer]')
        if (!card || !footer) throw new Error('card or footer missing')
        const c = card.getBoundingClientRect()
        const f = footer.getBoundingClientRect()
        const caption = [...card.querySelectorAll('p')].find((p) =>
          (p.textContent ?? '').includes('Answer hidden'),
        )
        const cap = caption?.getBoundingClientRect() ?? null
        const cx = cap ? cap.x + cap.width / 2 : c.x + c.width / 2
        const cy = cap ? cap.y + cap.height / 2 : c.y + c.height / 2
        const hit = document.elementFromPoint(cx, cy)
        return {
          cardBottom: c.bottom,
          footerTop: f.top,
          captionInCard: cap != null && hit != null && card.contains(hit),
        }
      })
      expect(bottom.cardBottom, `${where} card bottom above footer at max scroll`).toBeLessThanOrEqual(
        bottom.footerTop + 1,
      )
      expect(bottom.captionInCard, `${where} caption centre hits the card at max scroll`).toBe(true)
    })
  }
})

test.describe('language picker at 320x640 (#307)', () => {
  test('pack info line and Pack info link scroll clear of the Continue footer', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 640 })
    await page.goto('/language')
    await page.getByRole('heading', { name: 'Choose language & level' }).waitFor()
    const where = 'picker 320x640'
    await expectReachableAndUncovered(page, page.locator('[data-provenance-caption] span').first(), `${where} pack info line`)
    await expectReachableAndUncovered(page, page.getByRole('link', { name: 'Pack info' }), `${where} Pack info link`)
  })

  test('Português shows in full at 320px (no truncation)', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 640 })
    await page.goto('/language')
    await page.getByRole('heading', { name: 'Choose language & level' }).waitFor()
    const pt = page.locator('button[data-radio="pt"]')
    await expect(pt).toBeVisible()
    const fit = await page.evaluate(() => {
      const btn = document.querySelector('button[data-radio="pt"]')
      if (!btn) throw new Error('pt radio missing')
      const label = [...btn.querySelectorAll('div')].find((d) => (d.textContent ?? '').includes('Português'))
      if (!label) throw new Error('pt label missing')
      const range = document.createRange()
      range.selectNodeContents(label)
      const textRect = range.getBoundingClientRect()
      const btnRect = btn.getBoundingClientRect()
      return {
        text: label.textContent,
        labelScrollW: label.scrollWidth,
        labelClientW: label.clientWidth,
        btnScrollW: btn.scrollWidth,
        btnClientW: btn.clientWidth,
        textRight: textRect.right,
        btnRight: btnRect.right,
      }
    })
    expect(fit.text).toBe('Português')
    expect(fit.labelScrollW, 'label not clipped').toBeLessThanOrEqual(fit.labelClientW + 1)
    expect(fit.btnScrollW, 'button content not clipped').toBeLessThanOrEqual(fit.btnClientW + 1)
    expect(fit.textRight, 'full label inside the button').toBeLessThanOrEqual(fit.btnRight + 1)
  })
})
