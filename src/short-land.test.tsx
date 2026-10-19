import { describe, expect, test } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { Layout } from '@/components/Layout'
import { About } from '@/pages/About'
import { Language } from '@/pages/Language'

describe('short-land variant (#209)', () => {
  test('index.css registers short-land with the landscape max-height query', async () => {
    const css = await Bun.file(new URL('./index.css', import.meta.url)).text()
    expect(css).toContain(
      '@custom-variant short-land (@media (orientation: landscape) and (max-height: 500px));',
    )
  })

  test('manifest does not lock orientation', async () => {
    const src = await Bun.file(new URL('../vite.config.ts', import.meta.url)).text()
    const manifestAt = src.indexOf('manifest:')
    expect(manifestAt).toBeGreaterThan(0)
    const manifest = src.slice(manifestAt, src.indexOf('workbox:', manifestAt))
    expect(manifest).not.toContain('orientation')
  })
})

describe('Layout footer and short-land column (#209)', () => {
  test('footer markup stays sticky; aside is the short-land column slot', () => {
    const withFooter = renderToStaticMarkup(
      <Layout footer={<p>Continue</p>} footerBleed>
        <p>Body</p>
      </Layout>,
    )
    expect(withFooter).toContain('data-layout-footer')
    expect(withFooter).toContain('sticky bottom-0 z-10')
    expect(withFooter).toContain('border-t border-line')
    expect(withFooter).toContain('-mx-4')
    expect(withFooter).toContain('scroll-pb-6 pb-2')
    expect(withFooter).toContain('Continue')
    expect(withFooter).not.toContain('data-layout-aside')

    const withAside = renderToStaticMarkup(
      <Layout
        footer={<p>Pad</p>}
        footerBleed
        aside={<p>Column pad</p>}
        columns="minmax(0, 1fr) minmax(0, 1.25fr)"
      >
        <p>Body</p>
      </Layout>,
    )
    expect(withAside).toContain('data-layout-footer')
    expect(withAside).toContain('sticky bottom-0 z-10')
    expect(withAside).toContain('Pad')
    expect(withAside).toContain('data-layout-aside')
    expect(withAside).toContain('Column pad')
    expect(withAside).toContain('short-land:hidden')
    expect(withAside).toContain('hidden min-h-0 min-w-0 short-land:col-start-2')
    expect(withAside).toContain('minmax(0, 1fr) minmax(0, 1.25fr)')
    expect(withAside).toContain('data-short-land-cols')
  })
})

describe('About 44px targets (#209)', () => {
  test('Back and source links carry min-h-11', () => {
    ;(globalThis as { __HIATO_BUILD_SHA__?: string }).__HIATO_BUILD_SHA__ ??= 'test'
    const html = renderToStaticMarkup(
      <MemoryRouter>
        <About />
      </MemoryRouter>,
    )
    expect(html).toMatch(/min-h-11 min-w-11[^"]*"[^>]*>← Back/)
    for (const href of [
      'https://creativecommons.org/licenses/by-sa/4.0/',
      'http://www.cefr-j.org/download.html',
      'https://github.com/rsms/inter',
      '/fonts/LICENSE.txt',
    ]) {
      const at = html.indexOf(`href="${href}"`)
      expect(at).toBeGreaterThan(0)
      const tag = html.slice(Math.max(0, at - 180), at)
      expect(tag).toContain('min-h-11')
    }
  })
})

describe('Language footer does not cover levels (#209)', () => {
  test('level radiogroup sits outside the sticky footer', () => {
    const html = renderToStaticMarkup(
      <MemoryRouter>
        <Language />
      </MemoryRouter>,
    )
    const levelAt = html.indexOf('aria-labelledby="cefr-heading"')
    const footerAt = html.indexOf('data-layout-footer')
    expect(levelAt).toBeGreaterThan(0)
    expect(footerAt).toBeGreaterThan(levelAt)
    const footer = html.slice(footerAt)
    expect(footer).not.toContain('aria-labelledby="cefr-heading"')
    expect(footer).toContain('sticky')
    expect(footer).toContain('short-land:hidden')
    // Short-land CTA is in the column, not inside the sticky footer.
    const picker = html.slice(html.indexOf('data-language-picker'), footerAt)
    expect(picker).toContain('short-land:flex')
    expect(picker).toContain('Continue to daily')
  })
})
