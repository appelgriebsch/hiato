import { readFileSync } from 'node:fs'
import { expect, test, type Page } from '@playwright/test'

/**
 * ADR 0053 / #75 AT-3: accent-miss teaching e2e.
 * The clock is pinned per test so the seeded daily word is deterministic:
 * - 2026-11-27 es/a1 = CAFÉ  → press E (base of hidden É): forgiven, life kept
 * - 2026-11-14 es/b1 = CRÉDITO → press E: counted, life lost
 * - 2026-11-27 en/a1 = BYE   → press Q: plain miss, no teach line (EN unchanged)
 */

type Lang = 'en' | 'es'
type Cefr = 'a1' | 'b1'

/** Same FNV-1a as src/engine/daily.ts — keep the e2e off the app alias graph. */
function hashString(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

function dailyWord(lang: Lang, cefr: Cefr, iso: string): string {
  const date = new Date(iso)
  const dateKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
  const pack = JSON.parse(
    readFileSync(new URL(`../public/packs/${lang}/${cefr}.json`, import.meta.url), 'utf8'),
  ) as { lemmas: { word: string }[] }
  return pack.lemmas[hashString(`${dateKey}|${lang}|${cefr}`) % pack.lemmas.length]!.word
}

async function seed(page: Page, lang: Lang, cefr: Cefr, iso: string) {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.clock.setFixedTime(new Date(iso))
  await page.addInitScript(
    (prefs) => {
      localStorage.setItem('hiato.prefs', JSON.stringify(prefs))
    },
    { lang, cefr },
  )
  await page.goto('/play?mode=daily')
  await expect(page.locator('[data-letter-pad]:visible').first()).toBeVisible()
}

async function pressKey(page: Page, letter: string) {
  const key = page
    .locator('[data-letter-pad]:visible button')
    .filter({ hasText: new RegExp(`^${letter}$`) })
    .first()
  await expect(key).toBeEnabled()
  await key.click()
}

const teachLine = (page: Page) => page.locator('p[role="status"]')
const lives = (page: Page) =>
  page.locator('[role="status"][aria-label$="lives remaining"]')

test('ES A1: accent miss explains the accent and keeps the life', async ({ page }) => {
  const iso = '2026-11-27T12:00:00'
  await seed(page, 'es', 'a1', iso)
  expect(dailyWord('es', 'a1', iso)).toBe('CAFÉ')

  await pressKey(page, 'E') // base of the hidden É

  await expect(teachLine(page)).toHaveText('É: E with an acute accent, sounds like "ay"')
  await expect(lives(page)).toHaveAttribute('aria-label', '6 lives remaining')
})

test('ES B1: accent miss explains the accent and costs a life', async ({ page }) => {
  const iso = '2026-11-14T12:00:00'
  await seed(page, 'es', 'b1', iso)
  expect(dailyWord('es', 'b1', iso)).toBe('CRÉDITO')

  await pressKey(page, 'E')

  await expect(teachLine(page)).toHaveText('É: E with an acute accent, sounds like "ay"')
  await expect(lives(page)).toHaveAttribute('aria-label', '5 lives remaining')
})

test('EN A1: plain miss shows no teach line and costs a life (English packs unchanged)', async ({ page }) => {
  const iso = '2026-11-27T12:00:00'
  await seed(page, 'en', 'a1', iso)
  expect(dailyWord('en', 'a1', iso)).toBe('BYE')

  await pressKey(page, 'Q') // not in BYE

  await expect(teachLine(page)).toHaveCount(0)
  await expect(lives(page)).toHaveAttribute('aria-label', '5 lives remaining')
})
