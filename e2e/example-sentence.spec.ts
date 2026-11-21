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

/**
 * #317 / ADR 0056: the 12 C1/C2 packs ship examples too, with the same
 * EndCard-only timing rule. The C1 daily for the pinned day gets a fixture
 * example injected via window.fetch (C1 packs ship none until the keyed
 * #317 data run lands; when they do, the shipped example is used instead).
 */
const C1_FIXTURE_EXAMPLE = 'This is a sophisticated argument.'

function c1DailyLemma(): Lemma {
  const pack = JSON.parse(
    readFileSync(new URL('../public/packs/en/c1.json', import.meta.url), 'utf8'),
  ) as { lemmas: Lemma[] }
  return pack.lemmas[hashString(`${DATE_KEY}|en|c1`) % pack.lemmas.length]!
}

test('C1 EndCard shows the example only after the round finishes (#317)', async ({ page }) => {
  const lemma = c1DailyLemma()
  const example = lemma.example ?? C1_FIXTURE_EXAMPLE
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.clock.setFixedTime(new Date(ISO))
  await page.addInitScript((code) => {
    localStorage.setItem('hiato.prefs', JSON.stringify({ lang: code, cefr: 'c1' }))
  }, 'en')
  await page.addInitScript(
    ({ word, example }: { word: string; example: string }) => {
      const orig = window.fetch.bind(window)
      window.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
        const res = await orig(input, init)
        const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
        if (url.includes('/packs/en/c1.json') && res.ok) {
          const pack = (await res.json()) as { lemmas: Record<string, unknown>[] }
          for (const l of pack.lemmas) {
            if (l.word === word) l.example = example
          }
          return new Response(JSON.stringify(pack), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          })
        }
        return res
      }) as typeof window.fetch
    },
    { word: lemma.word, example },
  )
  await page.goto('/play?mode=daily')
  await page.locator('[data-letter-pad]:visible').first().waitFor()
  // In-round: no EndCard, sentence text nowhere on the page.
  await expect(page.locator('[data-endcard-example]')).toHaveCount(0)
  await expect(page.locator('[data-endcard-teach]')).toHaveCount(0)
  expect(await page.locator('body').innerText()).not.toContain(example)

  await loseRound(page, lemma.word)
  const el = page.locator('[data-endcard-example]')
  await expect(el).toHaveCount(1)
  await expect(el).toBeVisible()
  await expect(el).toHaveText(example)
  await expect(el).toHaveAttribute('lang', 'en')
})
