import { readFileSync } from 'node:fs'
import { expect, test, type Page } from '@playwright/test'

const VIEWPORTS = [
  { name: '667x375', width: 667, height: 375, short: true },
  { name: '740x360', width: 740, height: 360, short: true },
  { name: '844x390', width: 844, height: 390, short: true },
  { name: '915x412', width: 915, height: 412, short: true },
  { name: '1024x600', width: 1024, height: 600, short: false },
  { name: '375x667', width: 375, height: 667, short: false },
] as const

type Lang = 'en' | 'pt'

async function seed(page: Page, lang: Lang) {
  // Entrance animations use fill-mode `both`. Playwright freezes CSS animations
  // at the current frame, so a shot taken mid-fade fails the portrait snapshot.
  // The app already settles those classes under reduced motion.
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.addInitScript((code) => {
    localStorage.setItem('hiato.prefs', JSON.stringify({ lang: code, cefr: 'a1' }))
    localStorage.setItem(
      'hiato.pocket',
      JSON.stringify({
        v: 1,
        entries: [
          {
            id: 'en|a1|internet',
            lang: 'en',
            cefr: 'a1',
            word: 'INTERNET',
            gloss: 'a big place to find and share things on a computer',
            addedAt: 1,
          },
        ],
      }),
    )
  }, lang)
}

/** Same FNV-1a as src/engine/daily.ts — keep the e2e off the app alias graph. */
function hashString(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

function dailyWord(lang: Lang): string {
  const date = new Date()
  const dateKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
  const pack = JSON.parse(readFileSync(new URL(`../public/packs/${lang}/a1.json`, import.meta.url), 'utf8')) as {
    lemmas: { word: string }[]
  }
  return pack.lemmas[hashString(`${dateKey}|${lang}|a1`) % pack.lemmas.length]!.word
}

async function visiblePad(page: Page) {
  return page.locator('[data-letter-pad]:visible').first()
}

async function loseRound(page: Page, lang: Lang) {
  const avoid = new Set([...dailyWord(lang).toLocaleUpperCase('en')])
  const letters = 'QWERTYUIOPASDFGHJKLZXCVBNM'.split('').filter((letter) => !avoid.has(letter))
  let misses = 0
  for (const letter of letters) {
    if (misses >= 6) break
    const btn = page
      .locator('[data-letter-pad]:visible button')
      .filter({ hasText: new RegExp(`^${letter}$`) })
    const count = await btn.count()
    for (let i = 0; i < count; i++) {
      const one = btn.nth(i)
      if (await one.isDisabled()) continue
      await one.click()
      misses += 1
      await page.waitForTimeout(40)
      break
    }
  }
  await expect(page.getByText('Out of lives')).toBeVisible()
}

type Box = { t: string; key: boolean; w: number; h: number; top: number; bottom: number; left: number; right: number }

async function measure(page: Page) {
  return page.evaluate(() => {
    const scroller = document.querySelector('[data-layout-scroll]')
    const footer = document.querySelector('[data-layout-footer]')
    const fr = footer?.getBoundingClientRect()
    const footerBox =
      fr && fr.width > 0 && fr.height > 0
        ? { top: fr.top, bottom: fr.bottom, left: fr.left, right: fr.right }
        : null
    const targets = [...document.querySelectorAll<HTMLElement>('a,button')].flatMap((el) => {
      const r = el.getBoundingClientRect()
      if (r.width < 1 || r.height < 1) return []
      const label = (el.getAttribute('aria-label') || el.textContent || '').trim().replace(/\s+/g, ' ')
      return [
        {
          t: label.slice(0, 48),
          key: !!el.closest('[data-letter-pad]'),
          w: r.width,
          h: r.height,
          top: r.top,
          bottom: r.bottom,
          left: r.left,
          right: r.right,
        },
      ]
    })
    const levels = [...document.querySelectorAll<HTMLElement>('[aria-labelledby="cefr-heading"] [role="radio"]')].map(
      (el) => el.getBoundingClientRect(),
    )
    const pack = document.querySelector('[data-provenance-caption] a')?.getBoundingClientRect() ?? null
    return {
      vw: window.innerWidth,
      vh: window.innerHeight,
      docScrollW: document.scrollingElement?.scrollWidth ?? 0,
      scroller:
        scroller instanceof HTMLElement
          ? { clientH: scroller.clientHeight, scrollH: scroller.scrollHeight }
          : null,
      footer: footerBox,
      targets,
      levels: levels.map((r) => ({ top: r.top, bottom: r.bottom, left: r.left, right: r.right, h: r.height })),
      pack: pack ? { top: pack.top, bottom: pack.bottom, left: pack.left, right: pack.right, h: pack.height, w: pack.width } : null,
    }
  })
}

function inView(box: { top: number; bottom: number; left: number; right: number }, vw: number, vh: number) {
  return box.top >= -1 && box.left >= -1 && box.bottom <= vh + 1 && box.right <= vw + 1
}

function overlaps(
  a: { top: number; bottom: number; left: number; right: number },
  b: { top: number; bottom: number; left: number; right: number },
) {
  const x = Math.min(a.right, b.right) - Math.max(a.left, b.left)
  const y = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top)
  return x > 1 && y > 1
}

function assertNoHorizontalScroll(m: { docScrollW: number; vw: number }, where: string) {
  expect(m.docScrollW, where).toBeLessThanOrEqual(m.vw + 1)
}

function assertTargets(targets: Box[], where: string) {
  const small = targets.filter((t) => {
    if (t.key) return t.h < 44
    return t.h < 43.5 || t.w < 43.5
  })
  expect(small, where).toEqual([])
}

async function ready(page: Page) {
  await page.evaluate(() => document.fonts.ready)
}

test.describe('short landscape viewports (#209)', () => {
  for (const vp of VIEWPORTS) {
    for (const lang of ['en', 'pt'] as const) {
      test(`play ${lang} ${vp.name}`, async ({ page }) => {
        await page.setViewportSize({ width: vp.width, height: vp.height })
        await seed(page, lang)
        await page.goto('/play?mode=daily')
        await (await visiblePad(page)).waitFor()
        await ready(page)
        const m = await measure(page)
        const where = `play ${lang} ${vp.name}`
        assertNoHorizontalScroll(m, where)
        expect(m.scroller, where).not.toBeNull()
        if (vp.short || vp.name === '375x667' || vp.name === '1024x600') {
          expect(m.scroller!.scrollH - m.scroller!.clientH, where).toBeLessThanOrEqual(1)
        }
        const home = m.targets.find((t) => t.t.includes('Home') || t.t.includes('Daily'))
        const practice = m.targets.find((t) => t.t.includes('Practice'))
        expect(home, where).toBeTruthy()
        expect(practice, where).toBeTruthy()
        expect(inView(home!, m.vw, m.vh), `${where} home`).toBe(true)
        expect(inView(practice!, m.vw, m.vh), `${where} practice`).toBe(true)
        assertTargets(m.targets, where)
        if (vp.name === '375x667') {
          await expect(page).toHaveScreenshot(`play-${lang}-portrait.png`)
        }
      })

      test(`picker ${lang} ${vp.name}`, async ({ page }) => {
        await page.setViewportSize({ width: vp.width, height: vp.height })
        await seed(page, lang)
        await page.goto('/language')
        await page.getByRole('heading', { name: 'Choose language & level' }).waitFor()
        await ready(page)
        const m = await measure(page)
        const where = `picker ${lang} ${vp.name}`
        assertNoHorizontalScroll(m, where)
        expect(m.levels, where).toHaveLength(6)
        for (const level of m.levels) {
          expect(inView(level, m.vw, m.vh), where).toBe(true)
          expect(level.h, where).toBeGreaterThanOrEqual(44)
          if (m.footer) expect(overlaps(level, m.footer), where).toBe(false)
        }
        expect(m.pack, where).not.toBeNull()
        expect(inView(m.pack!, m.vw, m.vh), `${where} pack`).toBe(true)
        if (m.footer) expect(overlaps(m.pack!, m.footer), `${where} pack`).toBe(false)
        assertTargets(m.targets, where)
        if (vp.name === '375x667' && lang === 'en') {
          await expect(page).toHaveScreenshot('language-portrait.png')
        }
      })

      test(`home ${lang} ${vp.name}`, async ({ page }) => {
        await page.setViewportSize({ width: vp.width, height: vp.height })
        await seed(page, lang)
        await page.goto('/')
        await page.getByRole('link', { name: 'About' }).first().waitFor()
        await ready(page)
        const m = await measure(page)
        const where = `home ${lang} ${vp.name}`
        assertNoHorizontalScroll(m, where)
        const about = m.targets.find((t) => t.t === 'About')
        const change = m.targets.find((t) => t.t.includes('Change language') || t.t === 'Language')
        expect(about && inView(about, m.vw, m.vh), where).toBeTruthy()
        expect(change && inView(change, m.vw, m.vh), where).toBeTruthy()
        assertTargets(m.targets, where)
        if (vp.name === '375x667' && lang === 'en') {
          await expect(page).toHaveScreenshot('home-portrait.png')
        }
      })

      test(`endcard ${lang} ${vp.name}`, async ({ page }) => {
        await page.setViewportSize({ width: vp.width, height: vp.height })
        await seed(page, lang)
        await page.goto('/play?mode=daily')
        await (await visiblePad(page)).waitFor()
        await loseRound(page, lang)
        await ready(page)
        const actions = page.locator('[data-endcard-actions]')
        await expect(actions).toBeVisible()
        const m = await measure(page)
        const where = `endcard ${lang} ${vp.name}`
        assertNoHorizontalScroll(m, where)
        const wanted = ['Save to pocket', 'Share', 'Practice', 'Back home']
        for (const name of wanted) {
          const hit = m.targets.find((t) => t.t.includes(name))
          expect(hit, `${where} ${name}`).toBeTruthy()
          expect(inView(hit!, m.vw, m.vh), `${where} ${name}`).toBe(true)
        }
        assertTargets(m.targets, where)
        if (vp.name === '375x667' && lang === 'en') {
          await expect(page).toHaveScreenshot('endcard-portrait.png')
        }
      })

      test(`about ${lang} ${vp.name}`, async ({ page }) => {
        await page.setViewportSize({ width: vp.width, height: vp.height })
        await seed(page, lang)
        await page.goto('/about')
        await page.getByRole('button', { name: '← Back' }).waitFor()
        await ready(page)
        const m = await measure(page)
        const where = `about ${lang} ${vp.name}`
        assertNoHorizontalScroll(m, where)
        const back = m.targets.find((t) => t.t.includes('Back'))
        expect(back, where).toBeTruthy()
        expect(back!.h, where).toBeGreaterThanOrEqual(44)
        expect(back!.w, where).toBeGreaterThanOrEqual(44)
        const links = page.locator('a')
        const n = await links.count()
        for (let i = 0; i < n; i++) {
          const box = await links.nth(i).boundingBox()
          if (!box || box.height < 1) continue
          expect(box.height, where).toBeGreaterThanOrEqual(43.5)
        }
        if (vp.name === '375x667' && lang === 'en') {
          await expect(page).toHaveScreenshot('about-portrait.png', { fullPage: true })
        }
      })
    }
  }

  test('portrait pocket sheet', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 })
    await seed(page, 'en')
    await page.goto('/')
    await page.getByRole('button', { name: /Pocket/ }).click()
    await expect(page.getByRole('dialog')).toBeVisible()
    await ready(page)
    await expect(page).toHaveScreenshot('pocket-portrait.png')
  })
})
