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

  // Already-played replay: the DoneDaily EndCard carries the stored extras
  // plus the stored example (#318 acceptance: replay shows pos/ipa/family/example).
  expect(lemma.example, 'pinned daily word must ship an example').toBeTruthy()
  await page.goto('/play?mode=daily')
  await expect(page.locator('[data-endcard-teach]')).toBeVisible()
  await expect(page.locator('[data-endcard-pos]')).toHaveText('noun')
  await expect(page.locator('[data-endcard-ipa]')).toContainText('ækʃən')
  await expect(page.locator('[data-endcard-family]')).toContainText('actions')
  await expect(page.locator('[data-endcard-example]')).toHaveText(lemma.example!)
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

/**
 * #318 / ADR 0055: a pocket retry joins the loaded pack by lemmaIdentity, so the
 * retry EndCard shows the pack's pos/ipa/family/example while the pocket entry
 * itself stays word+gloss (no storage change). Uses a shipped EN A1 lemma that
 * carries full extras and is not the pinned daily (ACTION), so the ADR 0018
 * pocket gate allows the round without a completed daily.
 */
test('pocket retry EndCard shows the pack extras via the pack join; pocket storage stays word+gloss (#318)', async ({
  page,
}) => {
  type PackLemmaFull = Lemma & {
    synonyms?: string[]
    pos?: string
    ipa?: string
    family?: string[]
  }
  const pack = JSON.parse(
    readFileSync(new URL('../public/packs/en/a1.json', import.meta.url), 'utf8'),
  ) as { lemmas: PackLemmaFull[] }
  const daily = dailyLemma()
  const target = pack.lemmas.find(
    (l) =>
      /^[A-Z]+$/.test(l.word) &&
      l.word !== daily.word &&
      l.pos &&
      l.ipa &&
      l.family &&
      l.family.length > 0 &&
      l.example,
  )
  expect(target, 'need a shipped lemma with full extras that is not the daily').toBeTruthy()

  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.clock.setFixedTime(new Date(ISO))
  const now = new Date(ISO).getTime()
  const id = `en|a1|${target!.word}`
  await page.addInitScript(
    ({ prefs, pocket }: { prefs: unknown; pocket: unknown }) => {
      localStorage.setItem('hiato.prefs', JSON.stringify(prefs))
      localStorage.setItem('hiato.pocket', JSON.stringify(pocket))
    },
    {
      prefs: { lang: 'en', cefr: 'a1' },
      pocket: {
        v: 2,
        entries: [
          {
            id,
            lang: 'en',
            cefr: 'a1',
            word: target!.word,
            gloss: 'pocket gloss',
            addedAt: now,
            stage: 0,
            dueAt: now + 2 * 86_400_000,
          },
        ],
      },
    },
  )

  await page.goto(`/play?mode=pocket&id=${encodeURIComponent(id)}`)
  await page.locator('[data-letter-pad]:visible').first().waitFor()
  // In-round: no EndCard mount, no extras anywhere.
  await expect(page.locator('[data-endcard-teach]')).toHaveCount(0)
  await expect(page.locator('[data-endcard-meta]')).toHaveCount(0)
  await expect(page.locator('[data-endcard-pos]')).toHaveCount(0)
  await expect(page.locator('[data-endcard-ipa]')).toHaveCount(0)
  await expect(page.locator('[data-endcard-family]')).toHaveCount(0)
  await expect(page.locator('[data-endcard-example]')).toHaveCount(0)

  await loseRound(page, target!.word)

  // EndCard: pocket word + gloss, pack extras via the join (EN labels = codes).
  const teach = page.locator('[data-endcard-teach]')
  await expect(teach).toContainText('pocket gloss')
  await expect(teach).toContainText(target!.word)
  await expect(page.locator('[data-endcard-pos]')).toHaveText(target!.pos!)
  await expect(page.locator('[data-endcard-ipa]')).toContainText(
    target!.ipa!.replace(/^\//, '').replace(/\/$/, ''),
  )
  const family = page.locator('[data-endcard-family]')
  for (const chip of target!.family!) {
    await expect(family).toContainText(chip)
  }
  await expect(page.locator('[data-endcard-example]')).toHaveText(target!.example!)

  // Pocket storage format unchanged: the entry is still word+gloss, no extras.
  const stored = await page.evaluate(() => {
    const raw = localStorage.getItem('hiato.pocket')
    return raw ? (JSON.parse(raw) as { entries: Array<Record<string, unknown>> }) : null
  })
  const entry = stored?.entries.find((e) => e.word === target!.word)
  expect(entry).toBeDefined()
  expect(Object.keys(entry!).sort()).toEqual([
    'addedAt',
    'cefr',
    'dueAt',
    'gloss',
    'id',
    'lang',
    'stage',
    'word',
  ])
})

/**
 * #319 hardening: short-landscape (844x390) keeps the two-column EndCard with the
 * extras visible, the teach card scrolls (short-land:overflow-y-auto), and the
 * actions stay in view (existing scrollActionsIntoView, #209).
 */
test('short-landscape 844x390 EndCard shows the extras, teach card scrolls, actions in view (#319)', async ({
  page,
}) => {
  await page.setViewportSize({ width: 844, height: 390 })
  const lemma = dailyLemma()
  await seed(page)
  await page.goto('/play?mode=daily')
  await page.locator('[data-letter-pad]:visible').first().waitFor()
  await loseRound(page, lemma.word)

  await expect(page.locator('[data-endcard-pos]')).toBeVisible()
  await expect(page.locator('[data-endcard-ipa]')).toBeVisible()
  await expect(page.locator('[data-endcard-family]')).toBeVisible()
  await expect(page.locator('[data-endcard-example]')).toBeVisible()
  const teach = page.locator('[data-endcard-teach]')
  const overflowY = await teach.evaluate((el) => getComputedStyle(el).overflowY)
  expect(['auto', 'scroll']).toContain(overflowY)
  await expect(page.locator('[data-endcard-actions]')).toBeInViewport()
  expect(lemma.word).toBe('ACTION')
})

/**
 * #319 hardening: dark mode renders the extras, and the POS chip re-passes the
 * DOM contrast audit (docs/design/retro) at >= 4.5:1 with computed styles.
 */
test('dark mode EndCard extras render and the POS chip passes the DOM contrast audit (#319)', async ({
  page,
}) => {
  const lemma = dailyLemma()
  await seed(page)
  await page.emulateMedia({ reducedMotion: 'reduce', colorScheme: 'dark' })
  await page.goto('/play?mode=daily')
  await page.locator('[data-letter-pad]:visible').first().waitFor()
  expect(await page.evaluate(() => matchMedia('(prefers-color-scheme: dark)').matches)).toBe(true)
  await loseRound(page, lemma.word)

  const pos = page.locator('[data-endcard-pos]')
  await expect(pos).toBeVisible()
  await expect(pos).toHaveText('noun')
  await expect(page.locator('[data-endcard-family]')).toBeVisible()
  const ratio = await pos.evaluate((el) => {
    const cs = getComputedStyle(el)
    const parse = (c: string): [number, number, number] => {
      const m = c.match(/rgba?\(([^)]+)\)/)
      if (!m) throw new Error(`unparsable color: ${c}`)
      const parts = m[1]!.split(',').map((x) => Number.parseFloat(x))
      return [parts[0]!, parts[1]!, parts[2]!]
    }
    const lum = ([r, g, b]: [number, number, number]): number => {
      const f = (v: number) => {
        const s = v / 255
        return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
      }
      return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b)
    }
    const l1 = lum(parse(cs.color))
    const l2 = lum(parse(cs.backgroundColor))
    return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05)
  })
  expect(ratio).toBeGreaterThanOrEqual(4.5)
})
