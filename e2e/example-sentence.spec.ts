import { readFileSync } from 'node:fs'
import { expect, test, type Page } from '@playwright/test'

/**
 * #225 / ADR 0049 e2e: the EndCard example sentence appears only after the
 * round finishes — never in-round — and the already-played replay shows it too.
 *
 * The clock is pinned to 2026-10-10, whose EN A1 daily is ACTION (fixture
 * example "This action is easy to do."), so the positive assertions are
 * deterministic while packs are still pilot-only.
 */
const ISO = '2026-10-10T12:00:00'
const DATE_KEY = '2026-10-10'

type Lemma = { word: string; example?: string }

function hashString(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

function dailyLemma(): Lemma {
  const pack = JSON.parse(
    readFileSync(new URL('../public/packs/en/a1.json', import.meta.url), 'utf8'),
  ) as { lemmas: Lemma[] }
  return pack.lemmas[hashString(`${DATE_KEY}|en|a1`) % pack.lemmas.length]!
}

async function seed(page: Page) {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.clock.setFixedTime(new Date(ISO))
  await page.addInitScript((code) => {
    localStorage.setItem('hiato.prefs', JSON.stringify({ lang: code, cefr: 'a1' }))
  }, 'en')
}

async function loseRound(page: Page, word: string) {
  const avoid = new Set([...word.toLocaleUpperCase('en')])
  const letters = 'QWERTYUIOPASDFGHJKLZXCVBNM'.split('').filter((l) => !avoid.has(l))
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

test('in-progress round never shows the example sentence (#248)', async ({ page }) => {
  const lemma = dailyLemma()
  expect(lemma.example, 'pinned daily word must have a fixture example').toBeTruthy()
  await seed(page)
  await page.goto('/play?mode=daily')
  await page.locator('[data-letter-pad]:visible').first().waitFor()
  // No EndCard mount, and the sentence text is nowhere in the round UI.
  await expect(page.locator('[data-endcard-example]')).toHaveCount(0)
  await expect(page.locator('[data-endcard-teach]')).toHaveCount(0)
  expect(await page.locator('body').innerText()).not.toContain(lemma.example!)
})

test('finished round shows exactly one example sentence; replay shows it too (#248)', async ({
  page,
}) => {
  const lemma = dailyLemma()
  await seed(page)
  await page.goto('/play?mode=daily')
  await page.locator('[data-letter-pad]:visible').first().waitFor()
  await loseRound(page, lemma.word)

  const example = page.locator('[data-endcard-example]')
  await expect(example).toHaveCount(1)
  await expect(example).toBeVisible()
  await expect(example).toHaveText(lemma.example!)
  await expect(example).toHaveAttribute('lang', 'en')

  // Already-played replay: the DoneDaily EndCard carries the stored example.
  await page.goto('/play?mode=daily')
  await expect(page.locator('[data-endcard-teach]')).toBeVisible()
  const replay = page.locator('[data-endcard-example]')
  await expect(replay).toHaveCount(1)
  await expect(replay).toHaveText(lemma.example!)
})
