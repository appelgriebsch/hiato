import { readFileSync } from 'node:fs'
import { expect, test, type Page } from '@playwright/test'

/**
 * #314 / ADR 0055 e2e: pos / ipa / family appear only after the round finishes —
 * never in-round — and the already-played replay shows them too.
 *
 * The shipped packs carry no extras yet (M0 is fixture-data only; M1/M2 land the
 * real data), so window.fetch is patched before the app boots and the pinned
 * daily lemma (2026-10-10 EN A1 = ACTION) gets fixture extras in the pack JSON.
 * Patching fetch in the page works whether or not the service worker sits in
 * front of the pack request.
 */
const ISO = '2026-10-10T12:00:00'
const DATE_KEY = '2026-10-10'

const EXTRAS = { pos: 'noun', ipa: '/ˈækʃən/', family: ['actions', 'actor', 'active'] }

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
  // Inject fixture extras into the pinned daily lemma of the EN A1 pack.
  await page.addInitScript(
    ({ word, extras }: { word: string; extras: typeof EXTRAS }) => {
      const orig = window.fetch.bind(window)
      window.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
        const res = await orig(input, init)
        const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
        if (url.includes('/packs/en/a1.json') && res.ok) {
          const pack = (await res.json()) as { lemmas: Record<string, unknown>[] }
          for (const lemma of pack.lemmas) {
            if (lemma.word === word) Object.assign(lemma, extras)
          }
          return new Response(JSON.stringify(pack), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          })
        }
        return res
      }) as typeof window.fetch
    },
    { word: dailyLemma().word, extras: EXTRAS },
  )
}

async function padButton(page: Page, letter: string) {
  return page
    .locator('[data-letter-pad]:visible button')
    .filter({ hasText: new RegExp(`^${letter}$`) })
}

async function loseRound(page: Page, word: string) {
  const avoid = new Set([...word.toLocaleUpperCase('en')])
  const letters = 'QWERTYUIOPASDFGHJKLZXCVBNM'.split('').filter((l) => !avoid.has(l))
  let misses = 0
  for (const letter of letters) {
    if (misses >= 6) break
    const btn = await padButton(page, letter)
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

async function winRound(page: Page, word: string) {
  for (const letter of new Set([...word.toLocaleUpperCase('en')])) {
    const btn = await padButton(page, letter)
    const count = await btn.count()
    for (let i = 0; i < count; i++) {
      const one = btn.nth(i)
      if (await one.isDisabled()) continue
      await one.click()
      await page.waitForTimeout(40)
      break
    }
  }
  await expect(page.getByText('You got it')).toBeVisible()
}

test('in-progress round never shows pos/ipa/family (#314)', async ({ page }) => {
  const lemma = dailyLemma()
  await seed(page)
  await page.goto('/play?mode=daily')
  await page.locator('[data-letter-pad]:visible').first().waitFor()
  // No EndCard mount; the extras are nowhere in the round UI.
  await expect(page.locator('[data-endcard-teach]')).toHaveCount(0)
  await expect(page.locator('[data-endcard-meta]')).toHaveCount(0)
  await expect(page.locator('[data-endcard-pos]')).toHaveCount(0)
  await expect(page.locator('[data-endcard-ipa]')).toHaveCount(0)
  await expect(page.locator('[data-endcard-family]')).toHaveCount(0)
  const body = await page.locator('body').innerText()
  expect(body).not.toContain('ækʃən')
  expect(body).not.toContain('Word family')
  expect(body).not.toContain('actions')
  expect(lemma.word).toBe('ACTION')
})

test('after a loss the EndCard shows the meta row + family; replay shows them too (#314)', async ({
  page,
}) => {
  const lemma = dailyLemma()
  await seed(page)
  await page.goto('/play?mode=daily')
  await page.locator('[data-letter-pad]:visible').first().waitFor()
  await loseRound(page, lemma.word)

  const meta = page.locator('[data-endcard-meta]')
  await expect(meta).toHaveCount(1)
  await expect(page.locator('[data-endcard-pos]')).toHaveText('noun')
  const ipa = page.locator('[data-endcard-ipa]')
  await expect(ipa).toContainText('ækʃən')
  await expect(ipa).toHaveAttribute('lang', 'en')
  const family = page.locator('[data-endcard-family]')
  await expect(family).toHaveCount(1)
  for (const chip of EXTRAS.family) {
    await expect(family).toContainText(chip)
  }
  // Synonyms keep their labeled group.
  await expect(page.locator('[data-endcard-synonyms]')).toBeVisible()

  // Already-played replay: the DoneDaily EndCard carries the stored extras.
  await page.goto('/play?mode=daily')
  await expect(page.locator('[data-endcard-teach]')).toBeVisible()
  await expect(page.locator('[data-endcard-pos]')).toHaveText('noun')
  await expect(page.locator('[data-endcard-ipa]')).toContainText('ækʃən')
  await expect(page.locator('[data-endcard-family]')).toContainText('actions')
})

test('after a win at 390x844 the extras show and the actions stay in view (#314)', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 })
  const lemma = dailyLemma()
  await seed(page)
  await page.goto('/play?mode=daily')
  await page.locator('[data-letter-pad]:visible').first().waitFor()
  await winRound(page, lemma.word)

  await expect(page.locator('[data-endcard-pos]')).toHaveText('noun')
  await expect(page.locator('[data-endcard-ipa]')).toContainText('ækʃən')
  await expect(page.locator('[data-endcard-family]')).toContainText('actor')
  await expect(page.locator('[data-endcard-actions]')).toBeInViewport()
})
