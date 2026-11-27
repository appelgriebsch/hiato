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

describe('About 44px targets and accordion IA (#209/#402)', () => {
  test('Back, switch, radios and summaries carry min-h-11; inline prose links do not', () => {
    ;(globalThis as { __HIATO_BUILD_SHA__?: string }).__HIATO_BUILD_SHA__ ??= 'test'
    const html = renderToStaticMarkup(
      <MemoryRouter>
        <About />
      </MemoryRouter>,
    )
    expect(html).toMatch(/min-h-11 min-w-11[^"]*"[^>]*>← Back/)
    // sound switch + language radios + accordion summaries are the 44px controls
    expect(html).toContain('role="switch"')
    expect(html.match(/<summary[^>]*class="[^"]*min-h-11[^"]*"/g)?.length).toBe(2)
    expect(html.match(/data-radio=/g)?.length).toBe(7)
    // inline prose license URLs inside the accordions are WCAG 2.5.8-exempt
    for (const href of [
      'https://creativecommons.org/licenses/by-sa/4.0/',
      'http://www.cefr-j.org/download.html',
      '/fonts/LICENSE.txt',
    ]) {
      const at = html.indexOf(`href="${href}"`)
      expect(at).toBeGreaterThan(0)
      const tag = html.slice(Math.max(0, at - 180), at)
      expect(tag).not.toContain('min-h-11')
    }
    // Inter and Jersey 10 repo links open in a new tab
    for (const href of ['https://github.com/rsms/inter', 'https://github.com/scfried/soft-type-jersey']) {
      const at = html.indexOf(`href="${href}"`)
      expect(at).toBeGreaterThan(0)
      const tag = html.slice(Math.max(0, at - 200), at + href.length + 60)
      expect(tag).toContain('target="_blank"')
      expect(tag).toContain('rel="noreferrer"')
    }
  })

  test('single h1 (About) at unchanged scale; section headings are h2; licenses collapse into closed details', () => {
    ;(globalThis as { __HIATO_BUILD_SHA__?: string }).__HIATO_BUILD_SHA__ ??= 'test'
    const html = renderToStaticMarkup(
      <MemoryRouter>
        <About />
      </MemoryRouter>,
    )
    expect(html.match(/<h1/g)?.length).toBe(1)
    expect(html).toContain('<h1 class="text-pixel-title text-ink">About</h1>')
    expect(html.match(/<h2/g)?.length).toBeGreaterThanOrEqual(4)
    expect(html).toContain('id="sound-label"')
    expect(html).toContain('id="ui-language-heading"')
    // two closed-by-default accordions with px-frame, +/− cue and count hint
    expect(html.match(/<details[^>]*class="[^"]*px-frame[^"]*"[^>]*>/g)?.length).toBe(2)
    expect(html).not.toContain('<details open')
    expect(html.match(/data-about-accordion="packs"|data-about-accordion="fonts"/g)?.length).toBe(2)
    expect(html).toContain('group-open/acc:hidden')
    expect(html).toContain('border-t border-line')
    // System spans full width above the 2x3 locale grid
    expect(html).toMatch(/data-radio="system"[^>]*col-span-2|col-span-2[^>]*data-radio="system"/)
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
