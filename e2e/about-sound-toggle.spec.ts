import { expect, test } from '@playwright/test'

/**
 * #400 item 1: the About "Sound effects" switch renders its localized On/Off
 * label *beside* a compact fixed-width track (w-12 h-7, 18px thumb) inside a
 * non-wrapping flex group — no locale may stretch or clip the switch or push
 * it into the help text at 320–375px.
 */

const LOCALES = ['en', 'de', 'es', 'fr', 'it', 'pt'] as const

const VIEWPORTS = [
  { name: '320x640', width: 320, height: 640 },
  { name: '375x667', width: 375, height: 667 },
] as const

test.describe('About sound effects toggle across locales (#400)', () => {
  for (const vp of VIEWPORTS) {
    for (const locale of LOCALES) {
      test(`switch + label fit without overflow at ${vp.name} in ${locale}`, async ({ page }) => {
        await page.setViewportSize({ width: vp.width, height: vp.height })
        await page.addInitScript((l) => {
          localStorage.setItem('hiato.ui-locale', JSON.stringify({ v: 1, locale: l }))
        }, locale)
        await page.goto('/about')
        const sw = page.locator('[role="switch"]')
        await expect(sw).toBeVisible()
        await page.evaluate(() => document.fonts.ready)
        const where = `about ${locale} ${vp.name}`
        const m = await page.evaluate(() => {
          const switchEl = document.querySelector('[role="switch"]') as HTMLElement
          const row = switchEl.parentElement as HTMLElement
          const label = row.querySelector('span[aria-hidden="true"]') as HTMLElement
          const track = switchEl.firstElementChild as HTMLElement
          const help = document.querySelector('#sound-help') as HTMLElement
          const card = switchEl.closest('div[class*="mb-4"]') as HTMLElement
          const r = (el: Element) => {
            const b = el.getBoundingClientRect()
            return { x: b.x, y: b.y, right: b.right, bottom: b.bottom, width: b.width, height: b.height }
          }
          const overlaps = (a: ReturnType<typeof r>, b: ReturnType<typeof r>) =>
            a.x < b.right && a.right > b.x && a.y < b.bottom && a.bottom > b.y
          return {
            docScrollW: document.scrollingElement?.scrollWidth ?? 0,
            vw: window.innerWidth,
            switch: r(switchEl),
            track: r(track),
            thumb: r(track.firstElementChild as Element),
            label: r(label),
            labelText: label.textContent ?? '',
            help: r(help),
            card: r(card),
            rowScrollW: row.scrollWidth,
            rowClientW: row.clientWidth,
            cardScrollW: card.scrollWidth,
            cardClientW: card.clientWidth,
            labelHelpOverlap: overlaps(r(label), r(help)),
            switchOutsideCard: (() => {
              const c = r(card)
              const s = r(switchEl)
              return s.right > c.right + 1 || s.x < c.x - 1
            })(),
          }
        })
        expect(m.docScrollW, `${where} no horizontal scroll`).toBeLessThanOrEqual(m.vw + 1)
        expect(m.cardScrollW, `${where} card content not clipped`).toBeLessThanOrEqual(m.cardClientW + 1)
        expect(m.rowScrollW, `${where} toggle group does not wrap or overflow`).toBeLessThanOrEqual(
          m.rowClientW + 1,
        )
        // Compact fixed track with an 18px thumb; min-h-11 hit target kept.
        expect(m.track.width, `${where} track is w-12`).toBe(48)
        expect(m.switch.height, `${where} switch keeps min-h-11 hit target`).toBeGreaterThanOrEqual(44)
        expect(m.thumb.width, `${where} thumb is 18px`).toBe(18)
        expect(m.thumb.height, `${where} thumb is 18px`).toBe(18)
        // Localized state label beside the switch, never colliding with the help text.
        expect(m.labelText.length, `${where} label renders`).toBeGreaterThan(0)
        expect(m.labelHelpOverlap, `${where} label must not collide with help text`).toBe(false)
        expect(m.switchOutsideCard, `${where} switch stays inside the card`).toBe(false)

        // Toggling flips aria-checked and swaps the visible label.
        const before = m.labelText
        await sw.click()
        await expect(sw).toHaveAttribute('aria-checked', 'true')
        const after = await page.evaluate(() => {
          const row = (document.querySelector('[role="switch"]') as HTMLElement).parentElement!
          return (row.querySelector('span[aria-hidden="true"]') as HTMLElement).textContent ?? ''
        })
        expect(after, `${where} label swaps on toggle`).not.toBe(before)
        expect(
          await page.evaluate(() => localStorage.getItem('hiato.sound')),
          `${where} persists the toggle`,
        ).not.toBeNull()
      })
    }
  }
})
