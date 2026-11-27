import { expect, test, type Locator, type Page } from '@playwright/test'
import { sharePath } from './share-path'

/**
 * #400: /share no longer pins its actions in a sticky Layout footer — they
 * render in normal flow below the card (`[data-share-actions]`). These checks
 * prove there is no `[data-layout-footer]` on /share, the card and the action
 * stack never intersect (checked at scroll 0), every card part's centre is
 * hit unobstructed by elementFromPoint, and every action stays reachable by
 * scroll on short screens.
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

/** Parts of the share card that must each be hit unobstructed at their centre. */
const CARD_PARTS = [
  '#hiato-share-card .text-pixel-display',
  '#hiato-share-card .grid',
  '#hiato-share-card .tile-hidden',
  '#hiato-share-card .px-6.pt-5.pb-6 span',
] as const

const ACTIONS = [
  { name: /Play today’s Daily · EN A1/, label: 'Play today’s Daily CTA' },
  { name: 'Share', exact: true, label: 'Share' },
  { name: 'Save image', label: 'Save image' },
  { name: 'Copy text', label: 'Copy text' },
  { name: 'Home', label: 'Home' },
] as const

type Rect = { x: number; y: number; width: number; height: number }

function overlaps(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y
}

/** Scrolled into view, its centre hit lands on the card itself — never on the actions or a footer. */
async function expectCardPartUnobstructed(page: Page, locator: Locator, where: string) {
  await locator.scrollIntoViewIfNeeded()
  await expect(locator, where).toBeVisible()
  const hit = await page.evaluate((el) => {
    const rect = el.getBoundingClientRect()
    const cx = rect.x + rect.width / 2
    const cy = rect.y + rect.height / 2
    const at =
      cx >= 0 && cy >= 0 && cx <= innerWidth && cy <= innerHeight ? document.elementFromPoint(cx, cy) : null
    const card = document.querySelector('#hiato-share-card')
    const actions = document.querySelector('[data-share-actions]')
    const footer = document.querySelector('[data-layout-footer]')
    return {
      inCard: at != null && card != null && card.contains(at),
      inActions: at != null && actions != null && actions.contains(at),
      inFooter: at != null && footer != null && footer.contains(at),
    }
  }, await locator.elementHandle())
  expect(hit.inFooter, `${where} elementFromPoint must not hit a layout footer`).toBe(false)
  expect(hit.inActions, `${where} elementFromPoint must not hit the action stack`).toBe(false)
  expect(hit.inCard, `${where} elementFromPoint must hit the card`).toBe(true)
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

test.describe('share card and actions in normal flow, no sticky footer (#400)', () => {
  for (const vp of VIEWPORTS) {
    test(`no footer and zero card/actions intersection at scroll 0 at ${vp.name}`, async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height })
      await page.goto(sharePath(DAILY_PAYLOAD))
      const card = page.locator('#hiato-share-card')
      const actions = page.locator('[data-share-actions]')
      await expect(card).toBeVisible()
      await expect(actions).toBeVisible()
      await expect(page.locator('[data-layout-footer]')).toHaveCount(0)
      const where = `share ${vp.name}`
      const m = await page.evaluate(() => {
        const box = (sel: string) => {
          const b = document.querySelector(sel)!.getBoundingClientRect()
          return { x: b.x, y: b.y, width: b.width, height: b.height }
        }
        return { scrollY: window.scrollY, card: box('#hiato-share-card'), actions: box('[data-share-actions]') }
      })
      expect(m.scrollY, `${where} loaded at scroll 0`).toBe(0)
      expect(overlaps(m.card, m.actions), `${where} card box must not intersect the action stack`).toBe(false)
      expect(
        m.card.y + m.card.height,
        `${where} card sits above the action stack in normal flow`,
      ).toBeLessThanOrEqual(m.actions.y + 1)
    })
  }

  for (const vp of VIEWPORTS) {
    test(`every card part is hit unobstructed at ${vp.name}`, async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height })
      await page.goto(sharePath(DAILY_PAYLOAD))
      const card = page.locator('#hiato-share-card')
      await expect(card).toBeVisible()
      const where = `share ${vp.name}`
      for (const part of CARD_PARTS) {
        await expectCardPartUnobstructed(page, page.locator(part).first(), `${where} ${part}`)
      }
      await expectCardPartUnobstructed(page, page.getByText(CAPTION), `${where} caption`)
    })
  }

  test('all actions reachable by scroll at 844x390', async ({ page }) => {
    await page.setViewportSize({ width: 844, height: 390 })
    await page.goto(sharePath(DAILY_PAYLOAD))
    const where = 'share 844x390'
    for (const action of ACTIONS) {
      const button = page.getByRole('button', {
        name: action.name,
        exact: 'exact' in action ? action.exact : undefined,
      })
      await button.scrollIntoViewIfNeeded()
      await expect(button, `${where} ${action.label}`).toBeVisible()
      await expectOnScreen(button, `${where} ${action.label}`)
    }
  })
})

/**
 * #307: after dac6f955 the fixed h-dvh shell left no page scroll, so the
 * sticky footer covered the lower picker content. The shell now grows
 * (min-h-dvh) and the document scrolls. These checks prove that at 320x640
 * the pack info line and the Pack info link can be scrolled into view with
 * nothing covering them.
 */

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

test.describe('language picker at 320x640 / 375x667 (#307/#401)', () => {
  for (const vp of [
    { name: '320x640', width: 320, height: 640 },
    { name: '375x667', width: 375, height: 667 },
  ] as const) {
    test(`pack info line, Pack info link and B2/C1/C2 scroll clear of the Continue footer at ${vp.name}`, async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height })
      await page.goto('/language')
      await page.getByRole('heading', { name: 'Choose language & level' }).waitFor()
      const where = `picker ${vp.name}`
      await expectReachableAndUncovered(page, page.locator('[data-provenance-caption] span').first(), `${where} pack info line`)
      await expectReachableAndUncovered(page, page.getByRole('link', { name: 'Pack info' }), `${where} Pack info link`)
      for (const level of ['b2', 'c1', 'c2'] as const) {
        await expectReachableAndUncovered(
          page,
          page.locator(`[aria-labelledby="cefr-heading"] [role="radio"][data-radio="${level}"]`),
          `${where} level ${level.toUpperCase()}`,
        )
      }
    })
  }

  test('Português shows in full on a single line at 320px (no mid-word wrap)', async ({ page }) => {
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
      const labelRect = label.getBoundingClientRect()
      return {
        text: label.textContent,
        labelScrollW: label.scrollWidth,
        labelClientW: label.clientWidth,
        btnScrollW: btn.scrollWidth,
        btnClientW: btn.clientWidth,
        textRight: textRect.right,
        textHeight: textRect.height,
        labelHeight: labelRect.height,
        btnRight: btnRect.right,
      }
    })
    expect(fit.text).toBe('Português')
    expect(fit.labelScrollW, 'label not clipped').toBeLessThanOrEqual(fit.labelClientW + 1)
    expect(fit.btnScrollW, 'button content not clipped').toBeLessThanOrEqual(fit.btnClientW + 1)
    expect(fit.textRight, 'full label inside the button').toBeLessThanOrEqual(fit.btnRight + 1)
    // One line only (text-sm line-height is 20px; two lines would be 40px).
    expect(fit.labelHeight, 'label renders on a single line').toBeLessThanOrEqual(24)
    expect(fit.textHeight, 'text renders on a single line, no mid-word wrap').toBeLessThanOrEqual(24)
  })
})
