import { expect, test, type Page } from '@playwright/test'
import { sharePath } from './share-path'

/**
 * #289: every CEFR level is two lines (code, then name) and the name may wrap.
 * No level text may overflow its cell or the score panel at 320 and 375 px.
 */
const LEVELS = {
  a1: ['A1', 'Beginner'],
  a2: ['A2', 'Elementary'],
  b1: ['B1', 'Intermediate'],
  b2: ['B2', 'Upper-intermediate'],
  c1: ['C1', 'Advanced'],
  c2: ['C2', 'Proficiency'],
} as const

const VIEWPORTS = [
  { width: 320, height: 640 },
  { width: 375, height: 812 },
] as const

type LevelFit = {
  text: string
  scrollWidth: number
  clientWidth: number
  right: number
  panelRight: number
  cellRight: number
}

/** Text nodes in the Level cell, in document order. */
async function levelTextFits(page: Page): Promise<LevelFit[]> {
  return page.evaluate(() => {
    const panel = document.querySelector<HTMLElement>('#hiato-share-card .grid')
    if (!panel) throw new Error('score panel missing')
    const cell = [...panel.querySelectorAll<HTMLElement>(':scope > div')].find((el) =>
      (el.textContent ?? '').includes('Level'),
    )
    if (!cell) throw new Error('level cell missing')
    const panelStyle = getComputedStyle(panel)
    const panelRight =
      panel.getBoundingClientRect().right - Number.parseFloat(panelStyle.borderRightWidth)
    const cellRight = cell.getBoundingClientRect().right
    const walker = document.createTreeWalker(cell, NodeFilter.SHOW_TEXT)
    const fits: LevelFit[] = []
    let node = walker.nextNode()
    while (node) {
      const text = (node.textContent ?? '').trim()
      const parent = node.parentElement
      if (text.length > 0 && parent) {
        const range = document.createRange()
        range.selectNodeContents(node)
        fits.push({
          text,
          scrollWidth: parent.scrollWidth,
          clientWidth: parent.clientWidth,
          right: range.getBoundingClientRect().right,
          panelRight,
          cellRight,
        })
      }
      node = walker.nextNode()
    }
    return fits
  })
}

for (const scheme of ['light', 'dark'] as const) {
  for (const vp of VIEWPORTS) {
    test(`level text fits at ${vp.width}x${vp.height} ${scheme} (#289)`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: scheme })
      await page.setViewportSize({ width: vp.width, height: vp.height })
      for (const [cefr, [code, name]] of Object.entries(LEVELS)) {
        const where = `${cefr} ${scheme} ${vp.width}x${vp.height}`
        await page.goto(
          sharePath({
            lang: 'en',
            cefr,
            streak: 4,
            dateKey: '2026-11-13',
            wordLength: 6,
            won: true,
            mode: 'daily',
          }),
        )
        await expect(page.locator('#hiato-share-card'), where).toBeVisible()
        await page.evaluate(() => document.fonts.ready)
        expect(
          await page.evaluate(() => matchMedia('(prefers-color-scheme: dark)').matches),
          where,
        ).toBe(scheme === 'dark')
        const fits = await levelTextFits(page)
        expect(
          fits.map((fit) => fit.text),
          where,
        ).toEqual(['Level', code, name])
        for (const fit of fits) {
          const label = `${where} ${fit.text}`
          expect(fit.scrollWidth, label).toBeLessThanOrEqual(fit.clientWidth)
          expect(fit.right, label).toBeLessThanOrEqual(fit.panelRight + 1)
          expect(fit.right, label).toBeLessThanOrEqual(fit.cellRight + 1)
        }
      }
    })
  }
}
