import { expect, test, type Locator, type Page } from '@playwright/test'
import { sharePath } from './share-path'

/**
 * #286/#307: on short screens the /share card must keep its natural height
 * instead of shrinking. The shell grows past the viewport (min-h-dvh), the
 * layout column is not a scrollport (that clips pixel frames on the right),
 * so the document scrolls. Footer actions stay reachable; they are not pinned
 * over the card.
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

const PLAY_CTA = /Play today’s Daily · EN A1/
const CAPTION = 'Answer hidden — come play yours'

const SHORT_VIEWPORTS = [
  { name: '844x390', width: 844, height: 390 },
  { name: '375x667', width: 375, height: 667 },
] as const

/** Tall viewport, same 375 width as 375x667: the natural card height reference. */
const REFERENCE_VIEWPORT = { width: 375, height: 812 }

async function measure(page: Page) {
  return page.evaluate(() => {
    const card = document.querySelector<HTMLElement>('#hiato-share-card')
    const scroller = document.querySelector<HTMLElement>('[data-layout-scroll]')
    return {
      card: card
        ? {
            h: card.getBoundingClientRect().height,
            clientH: card.clientHeight,
            scrollH: card.scrollHeight,
          }
        : null,
      scroller: scroller
        ? { clientH: scroller.clientHeight, scrollH: scroller.scrollHeight }
        : null,
    }
  })
}

/** On screen: a non-empty box fully inside the viewport. */
async function expectOnScreen(locator: Locator, where: string) {
  const box = await locator.boundingBox()
  const vp = locator.page().viewportSize()
  expect(box, where).not.toBeNull()
  expect(vp, where).not.toBeNull()
  expect(
    box!.x >= -1 &&
      box!.y >= -1 &&
      box!.x + box!.width <= vp!.width + 1 &&
      box!.y + box!.height <= vp!.height + 1,
    where,
  ).toBe(true)
}

test.describe('share card on short screens (#286)', () => {
  test('card keeps its natural height and scrolls at 844x390 and 375x667', async ({ page }) => {
    await page.setViewportSize({ width: REFERENCE_VIEWPORT.width, height: REFERENCE_VIEWPORT.height })
    await page.goto(sharePath(DAILY_PAYLOAD))
    const card = page.locator('#hiato-share-card')
    await expect(card).toBeVisible()
    const referenceH = await card.evaluate((el) => el.getBoundingClientRect().height)

    for (const vp of SHORT_VIEWPORTS) {
      await page.setViewportSize({ width: vp.width, height: vp.height })
      await page.goto(sharePath(DAILY_PAYLOAD))
      await expect(card).toBeVisible()
      const where = `share ${vp.name}`
      const m = await measure(page)
      expect(m.card, where).not.toBeNull()
      // Nothing clipped: the card renders at its natural height, not shrunk.
      expect(m.card!.h, where).toBeGreaterThanOrEqual(m.card!.scrollH - 1)
      expect(m.card!.clientH, where).toBeGreaterThanOrEqual(m.card!.scrollH - 1)
      // Content plus the sticky footer is taller than the viewport: the
      // document scrolls, not the column (#307).
      expect(m.scroller, where).not.toBeNull()
      const doc = await page.evaluate(() => ({
        scrollH: document.scrollingElement?.scrollHeight ?? 0,
        innerH: window.innerHeight,
      }))
      expect(doc.scrollH, `${where} document scrolls`).toBeGreaterThan(doc.innerH + 1)
      // Same card width as the 375x812 reference: identical natural height.
      if (vp.width === REFERENCE_VIEWPORT.width) {
        expect(m.card!.h, where).toBeGreaterThanOrEqual(referenceH - 1)
      }
      const caption = page.getByText(CAPTION)
      await caption.scrollIntoViewIfNeeded()
      await expect(caption, where).toBeVisible()
      await expectOnScreen(caption, `${where} caption`)
      for (const action of [
        { name: PLAY_CTA, label: 'CTA' },
        { name: 'Share', label: 'Share', exact: true },
        { name: 'Save image', label: 'Save image' },
        { name: 'Copy text', label: 'Copy text' },
        { name: 'Home', label: 'Home' },
      ] as const) {
        const button = page.getByRole('button', {
          name: action.name,
          exact: 'exact' in action ? action.exact : undefined,
        })
        await button.scrollIntoViewIfNeeded()
        await expectOnScreen(button, `${where} ${action.label}`)
      }
    }
  })
})
