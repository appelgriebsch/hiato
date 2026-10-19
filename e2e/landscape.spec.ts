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

/** EN A1 daily is ART. Portrait snapshots are taken on this local day. */
const SNAPSHOT_ISO = '2026-10-18T12:00:00'
const LONG_EN_ISO = '2026-11-13T12:00:00'
const LONG_PT_ISO = '2026-10-20T12:00:00'

/** Optional YYYY-MM-DD. The suite stays on the snapshot day unless this is set. */
const clockIso = process.env.HIATO_E2E_DATE
  ? `${process.env.HIATO_E2E_DATE}T12:00:00`
  : SNAPSHOT_ISO

function isSnapshotClock(iso = clockIso) {
  return iso === SNAPSHOT_ISO
}

async function seed(page: Page, lang: Lang, iso = clockIso) {
  // Entrance animations use fill-mode `both`. Playwright freezes CSS animations
  // at the current frame, so a shot taken mid-fade fails the portrait snapshot.
  // The app already settles those classes under reduced motion.
  await page.emulateMedia({ reducedMotion: 'reduce' })
  // Pin the daily word. new Date() in the page and dailyWord() share this timestamp.
  await page.clock.setFixedTime(new Date(iso))
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

/** Five entries in the EN A1 slot, none of them today's daily. Save then confirms. */
async function seedFullPocket(page: Page, iso = SNAPSHOT_ISO) {
  await seed(page, 'en', iso)
  const daily = dailyWord('en', iso).toLocaleUpperCase('en')
  const words = ['MANGO', 'BREAD', 'CHAIR', 'DANCE', 'EAGLE', 'FROST', 'GRAPE']
    .filter((word) => word !== daily)
    .slice(0, 5)
  await page.addInitScript((packed: { word: string; gloss: string; addedAt: number }[]) => {
    localStorage.setItem(
      'hiato.pocket',
      JSON.stringify({
        v: 1,
        entries: packed.map((entry) => ({
          id: `en|a1|${entry.word.toLowerCase()}`,
          lang: 'en',
          cefr: 'a1',
          word: entry.word,
          gloss: entry.gloss,
          addedAt: entry.addedAt,
        })),
      }),
    )
  }, words.map((word, addedAt) => ({ word, gloss: `saved meaning ${addedAt + 1}`, addedAt: addedAt + 1 })))
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

function dailyWord(lang: Lang, iso = clockIso): string {
  const date = new Date(iso)
  const dateKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
  const pack = JSON.parse(readFileSync(new URL(`../public/packs/${lang}/a1.json`, import.meta.url), 'utf8')) as {
    lemmas: { word: string }[]
  }
  return pack.lemmas[hashString(`${dateKey}|${lang}|a1`) % pack.lemmas.length]!.word
}

async function visiblePad(page: Page) {
  return page.locator('[data-letter-pad]:visible').first()
}

async function loseRound(page: Page, lang: Lang, iso = clockIso) {
  const avoid = new Set([...dailyWord(lang, iso).toLocaleUpperCase('en')])
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
    // Letter keys: height floor 48px, width floor 24px (ADR 0041 addendum).
    if (t.key) return t.h < 47.5 || t.w < 24
    return t.h < 43.5 || t.w < 43.5
  })
  expect(small, where).toEqual([])
}

async function ready(page: Page) {
  await page.evaluate(() => document.fonts.ready)
}

/** Empty voice list until the test calls `__hiatoEmitEnVoice`. */
async function installOnDemandVoice(page: Page) {
  await page.addInitScript(() => {
    const listeners = new Set<() => void>()
    let voices: { lang: string; localService: boolean }[] = []
    const emit = () => {
      voices = [{ lang: 'en-US', localService: true }]
      for (const fn of [...listeners]) {
        try {
          fn()
        } catch {
          /* the page owns its own errors */
        }
      }
    }
    ;(window as unknown as { __hiatoEmitEnVoice?: () => void }).__hiatoEmitEnVoice = emit
    const fake = {
      speaking: false,
      pending: false,
      paused: false,
      getVoices: () => voices.slice(),
      cancel() {},
      speak() {},
      resume() {},
      pause() {},
      addEventListener(type: string, listener: () => void) {
        if (type === 'voiceschanged') listeners.add(listener)
      },
      removeEventListener(type: string, listener: () => void) {
        if (type === 'voiceschanged') listeners.delete(listener)
      },
    }
    Object.defineProperty(window, 'speechSynthesis', {
      configurable: true,
      get: () => fake,
    })
  })
}

async function emitEnVoice(page: Page) {
  await page.evaluate(() => {
    const emit = (window as unknown as { __hiatoEmitEnVoice?: () => void }).__hiatoEmitEnVoice
    if (!emit) throw new Error('voice stub missing')
    emit()
  })
}

async function layoutScrollTop(page: Page) {
  return page.evaluate(() => {
    const scroller = document.querySelector('[data-layout-scroll]')
    if (!(scroller instanceof HTMLElement)) return null
    return scroller.scrollTop
  })
}

const ENDCARD_ACTIONS = ['Save to pocket', 'Share', 'Practice', 'Back home'] as const

async function assertEndcardActionsInView(page: Page, where: string) {
  const m = await measure(page)
  for (const name of ENDCARD_ACTIONS) {
    const hit = m.targets.find((t) => t.t.includes(name))
    expect(hit, `${where} ${name}`).toBeTruthy()
    expect(inView(hit!, m.vw, m.vh), `${where} ${name}`).toBe(true)
  }
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
        // #209 requires no scroll in short landscape. 1024×600 and portrait
        // already overflow on main when the daily word is long, so that check
        // stays on the short-word snapshot day only.
        const tallOverflow = !vp.short && isSnapshotClock()
        if (vp.short || tallOverflow) {
          expect(m.scroller!.scrollH - m.scroller!.clientH, where).toBeLessThanOrEqual(1)
        }
        const home = m.targets.find((t) => t.t.includes('Home') || t.t.includes('Daily'))
        const practice = m.targets.find((t) => t.t.includes('Practice'))
        expect(home, where).toBeTruthy()
        expect(practice, where).toBeTruthy()
        expect(inView(home!, m.vw, m.vh), `${where} home`).toBe(true)
        expect(inView(practice!, m.vw, m.vh), `${where} practice`).toBe(true)
        assertTargets(m.targets, where)
        if (vp.name === '375x667' && isSnapshotClock()) {
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
        const continueBtn = m.targets.find(
          (t) => t.t.includes('Continue') || t.t.includes('Caching') || t.t.includes('Preparing'),
        )
        expect(continueBtn, `${where} continue`).toBeTruthy()
        expect(inView(continueBtn!, m.vw, m.vh), `${where} continue`).toBe(true)
        assertTargets(m.targets, where)
        if (vp.name === '375x667' && lang === 'en' && isSnapshotClock()) {
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
        if (vp.name === '375x667' && lang === 'en' && isSnapshotClock()) {
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
          await assertTeachStaysInView(page, dailyWord('en', clockIso))
          if (isSnapshotClock()) await expect(page).toHaveScreenshot('endcard-portrait.png')
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
        if (vp.name === '375x667' && lang === 'en' && isSnapshotClock()) {
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
    if (isSnapshotClock()) await expect(page).toHaveScreenshot('pocket-portrait.png')
  })

  test('portrait EN endcard keeps badge and word on a long daily', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 })
    await seed(page, 'en', LONG_EN_ISO)
    await page.goto('/play?mode=daily')
    await (await visiblePad(page)).waitFor()
    await loseRound(page, 'en', LONG_EN_ISO)
    await ready(page)
    await assertTeachStaysInView(page, dailyWord('en', LONG_EN_ISO))
    const actions = page.locator('[data-endcard-actions]')
    await expect(actions).toBeVisible()
    const box = await actions.boundingBox()
    expect(box).toBeTruthy()
    expect(box!.y).toBeGreaterThanOrEqual(-1)
    expect(box!.y + box!.height).toBeLessThanOrEqual(667 + 1)
  })

  for (const vp of VIEWPORTS) {
    if (!vp.short) continue
    for (const sample of [
      { lang: 'en' as const, iso: LONG_EN_ISO },
      { lang: 'pt' as const, iso: LONG_PT_ISO },
    ]) {
      test(`long word play ${sample.lang} ${vp.name}`, async ({ page }) => {
        await page.setViewportSize({ width: vp.width, height: vp.height })
        await seed(page, sample.lang, sample.iso)
        await page.goto('/play?mode=daily')
        await (await visiblePad(page)).waitFor()
        await ready(page)
        const m = await measure(page)
        const where = `long ${sample.lang} ${vp.name}`
        assertNoHorizontalScroll(m, where)
        expect(m.scroller!.scrollH - m.scroller!.clientH, where).toBeLessThanOrEqual(1)
        const home = m.targets.find((t) => t.t.includes('Home') || t.t.includes('Daily'))
        const practice = m.targets.find((t) => t.t.includes('Practice'))
        expect(home && inView(home, m.vw, m.vh), where).toBeTruthy()
        expect(practice && inView(practice, m.vw, m.vh), where).toBeTruthy()
        assertTargets(m.targets, where)
      })
    }
  }

  for (const iso of [SNAPSHOT_ISO, LONG_EN_ISO]) {
    for (const vp of [
      { name: '375x667', width: 375, height: 667 },
      { name: '1024x600', width: 1024, height: 600 },
    ]) {
      test(`voice re-scrolls endcard actions ${vp.name} ${iso.slice(0, 10)}`, async ({ page }) => {
        await page.setViewportSize({ width: vp.width, height: vp.height })
        await seed(page, 'en', iso)
        await installOnDemandVoice(page)
        await page.goto('/play?mode=daily')
        await (await visiblePad(page)).waitFor()
        await loseRound(page, 'en', iso)
        await ready(page)
        await assertTeachStaysInView(page, dailyWord('en', iso))
        const before = await layoutScrollTop(page)
        expect(before).not.toBeNull()
        await emitEnVoice(page)
        await expect(page.locator('[data-endcard-speak]')).toBeVisible()
        await expect(page.locator('[data-endcard-speak]')).not.toBeFocused()
        const where = `voice scroll ${vp.name} ${iso.slice(0, 10)}`
        await assertEndcardActionsInView(page, where)
        const after = await layoutScrollTop(page)
        expect(after, where).not.toBe(before)
      })

      test(`voice leaves a scrolled endcard alone ${vp.name} ${iso.slice(0, 10)}`, async ({ page }) => {
        await page.setViewportSize({ width: vp.width, height: vp.height })
        await seed(page, 'en', iso)
        await installOnDemandVoice(page)
        await page.goto('/play?mode=daily')
        await (await visiblePad(page)).waitFor()
        await loseRound(page, 'en', iso)
        await ready(page)
        const arrived = await layoutScrollTop(page)
        expect(arrived).not.toBeNull()
        const parked = await page.evaluate(() => {
          const scroller = document.querySelector('[data-layout-scroll]')
          if (!(scroller instanceof HTMLElement)) return null
          scroller.scrollTop = 0
          return scroller.scrollTop
        })
        expect(parked, 'reader moved up').not.toBe(arrived)
        await emitEnVoice(page)
        await expect(page.locator('[data-endcard-speak]')).toBeVisible()
        await expect(page.locator('[data-endcard-speak]')).not.toBeFocused()
        expect(await layoutScrollTop(page)).toBe(parked)
      })
    }
  }

  for (const vp of [
    { name: '375x667', width: 375, height: 667 },
    { name: '1024x600', width: 1024, height: 600 },
  ]) {
    test(`full pocket confirm scroll ${vp.name}`, async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height })
      await seedFullPocket(page)
      await page.goto('/play?mode=daily')
      await (await visiblePad(page)).waitFor()
      await loseRound(page, 'en')
      await ready(page)
      const before = await layoutScrollTop(page)
      const beforeTop = (await page.locator('[data-endcard-actions]').boundingBox())?.y
      expect(before).not.toBeNull()
      expect(beforeTop).not.toBeUndefined()
      await page.getByRole('button', { name: 'Save to pocket' }).click()
      const panel = page.getByRole('dialog', { name: 'Replace oldest word?' })
      await expect(panel).toBeVisible()
      const box = await panel.boundingBox()
      expect(box, vp.name).toBeTruthy()
      expect(box!.y, vp.name).toBeGreaterThanOrEqual(-1)
      expect(box!.y + box!.height, vp.name).toBeLessThanOrEqual(vp.height + 1)
      const after = await layoutScrollTop(page)
      const afterTop = (await page.locator('[data-endcard-actions]').boundingBox())?.y
      // Arrival already pins the actions to the bottom edge, so the taller
      // confirm card nudges a few pixels at both heights. Deleting that
      // scroll leaves the card past the edge. Sending it to the top moves
      // the scroller by the whole arrival offset instead of this nudge.
      expect(Math.abs(after! - before!), vp.name).toBeLessThanOrEqual(32)
      expect(Math.abs((afterTop ?? 0) - (beforeTop ?? 0)), vp.name).toBeLessThanOrEqual(32)
    })
  }

  test('synthetic notch insets keep PT keys at least 24px wide', async ({ page }) => {
    // 667×375 plus 47/47/21 is not a real device. It is the narrowest
    // combination from the Option A safe-area note (ADR 0041 addendum).
    await page.setViewportSize({ width: 667, height: 375 })
    await seed(page, 'pt')
    await page.goto('/play?mode=daily')
    await (await visiblePad(page)).waitFor()
    const client = await page.context().newCDPSession(page)
    await client.send('Emulation.setSafeAreaInsetsOverride', {
      insets: { top: 0, left: 47, bottom: 21, right: 47 },
    })
    await page.waitForTimeout(50)
    const m = await measure(page)
    const where = 'notch 667x375 pt'
    assertNoHorizontalScroll(m, where)
    expect(m.scroller!.scrollH - m.scroller!.clientH, where).toBeLessThanOrEqual(1)
    const keys = m.targets.filter((t) => t.key)
    expect(keys.length, where).toBeGreaterThan(0)
    assertTargets(m.targets, where)
  })
})

/** Badge, gloss, and lemma stay on screen. The solved letter row may sit above. */
async function assertTeachStaysInView(page: Page, word: string) {
  const viewport = page.viewportSize()
  expect(viewport).toBeTruthy()
  const vh = viewport!.height
  const vw = viewport!.width
  const parts = [
    page.locator('[data-endcard-badge]'),
    page.locator('[data-endcard-teach] p').first(),
    page.locator('[data-endcard-teach]').getByText(word, { exact: true }),
  ]
  for (const part of parts) {
    const box = await part.boundingBox()
    expect(box, word).toBeTruthy()
    expect(box!.y, word).toBeGreaterThanOrEqual(-1)
    expect(box!.y + box!.height, word).toBeLessThanOrEqual(vh + 1)
    expect(box!.x, word).toBeGreaterThanOrEqual(-1)
    expect(box!.x + box!.width, word).toBeLessThanOrEqual(vw + 1)
  }
}
