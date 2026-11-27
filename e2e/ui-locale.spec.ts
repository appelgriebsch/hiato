import { expect, test } from '@playwright/test'

/**
 * UI locale switch (ADR 0063 / #379): the About "Interface language" picker
 * writes `hiato.ui-locale`, `<html lang>` follows it, Home chrome localizes,
 * and System returns to the device locale. `hiato.prefs` (pack language +
 * CEFR) is never touched by the picker.
 */
test.describe('UI locale picker (ADR 0063 / #379)', () => {
  test('About picker localizes the UI, System resets to the device locale, prefs untouched', async ({
    page,
  }) => {
    await page.addInitScript(() => {
      localStorage.setItem('hiato.prefs', JSON.stringify({ lang: 'en', cefr: 'a1' }))
    })

    // Default: no stored override, en-US device -> English UI.
    await page.goto('/')
    await expect(page.getByRole('link', { name: 'Change language' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'About' })).toBeVisible()
    await expect
      .poll(() => page.evaluate(() => document.documentElement.lang))
      .toBe('en')

    // Pick Português in About (locale-independent data-radio selectors: the
    // picker's own accessible name localizes once pt is active).
    await page.goto('/about')
    const picker = page.getByRole('radiogroup', { name: 'Interface language' })
    await expect(picker.locator('[data-radio="system"]')).toHaveAttribute(
      'aria-checked',
      'true',
    )
    await picker.locator('[data-radio="pt"]').click()
    await expect
      .poll(() => page.evaluate(() => document.documentElement.lang))
      .toBe('pt')
    await expect(
      page.locator('[data-ui-locale-picker] [data-radio="pt"]'),
    ).toHaveAttribute('aria-checked', 'true')
    await expect
      .poll(() => page.evaluate(() => localStorage.getItem('hiato.ui-locale')))
      .toBe(JSON.stringify({ v: 1, locale: 'pt' }))

    // Home chrome is localized; pack prefs are unchanged.
    await page.goto('/')
    await expect(page.getByRole('link', { name: 'Alterar idioma' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Sobre' })).toBeVisible()
    await expect
      .poll(() => page.evaluate(() => localStorage.getItem('hiato.prefs')))
      .toBe(JSON.stringify({ lang: 'en', cefr: 'a1' }))

    // The picker itself re-renders in pt; System resets to the device locale.
    await page.goto('/about')
    await page
      .getByRole('radiogroup', { name: 'Idioma da interface' })
      .locator('[data-radio="system"]')
      .click()
    await expect
      .poll(() => page.evaluate(() => document.documentElement.lang))
      .toBe('en')
    await expect
      .poll(() => page.evaluate(() => localStorage.getItem('hiato.ui-locale')))
      .toBe(JSON.stringify({ v: 1, locale: null }))
    await page.goto('/')
    await expect(page.getByRole('link', { name: 'Change language' })).toBeVisible()
  })
})

test.describe('device locale default (ADR 0063 / #379)', () => {
  test.use({ locale: 'pt-BR' })

  test('a pt-BR device gets the Portuguese UI with no stored override', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('hiato.prefs', JSON.stringify({ lang: 'en', cefr: 'a1' }))
    })
    await page.goto('/')
    await expect
      .poll(() => page.evaluate(() => document.documentElement.lang))
      .toBe('pt')
    await expect(page.getByRole('link', { name: 'Alterar idioma' })).toBeVisible()
    await expect
      .poll(() => page.evaluate(() => localStorage.getItem('hiato.ui-locale')))
      .toBeNull()
  })
})
