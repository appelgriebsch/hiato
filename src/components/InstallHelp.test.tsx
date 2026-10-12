import { afterEach, describe, expect, test } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { SelectionCard } from '@/pages/Language'
import {
  INSTALL_HELP_OPENED_KEY,
  InstallHelpLink,
  installLinkVisible,
  openInstallHelp,
  type BeforeInstallPromptEvent,
} from './InstallHelp'

const g = globalThis as Record<string, unknown>
const saved = { window: g.window, localStorage: g.localStorage }

function env({ standalone = false, opened = false } = {}) {
  const store = new Map<string, string>(opened ? [[INSTALL_HELP_OPENED_KEY, '1']] : [])
  g.localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
  }
  g.window = {
    matchMedia: (q: string) => ({ matches: standalone && q === '(display-mode: standalone)' }),
    navigator: {},
  }
  return store
}

afterEach(() => {
  g.window = saved.window
  g.localStorage = saved.localStorage
})

const link = (ready: boolean) => renderToStaticMarkup(<InstallHelpLink visible={ready} />)

describe('A2HS link under Continue (#201)', () => {
  test('selection card renders no install link', () => {
    env()
    for (const phase of ['idle', 'caching', 'ready', 'error'] as const) {
      const html = renderToStaticMarkup(
        <MemoryRouter>
          <SelectionCard lang="en" cefr="a1" phase={phase} showSaving />
        </MemoryRouter>,
      )
      expect(html).not.toContain('data-install-link')
    }
  })

  test('visibility for every ready × standalone × opened case (matchMedia mocked)', () => {
    for (const ready of [true, false])
      for (const standalone of [true, false])
        for (const opened of [true, false]) {
          env({ standalone, opened })
          const want = ready && !standalone && !opened
          expect(installLinkVisible(ready, standalone, opened)).toBe(want)
          const html = link(ready)
          expect(html.match(/data-install-link/g)?.length ?? 0).toBe(want ? 1 : 0)
          if (want) expect(html).toContain('Add Hiato to your Home Screen')
        }
  })

  test('tap opens the how-to and persists the opened flag; hidden on reload', async () => {
    const store = env()
    let shown = 0
    expect(await openInstallHelp(null, () => shown++)).toBe('sheet')
    expect(shown).toBe(1)
    expect(store.get(INSTALL_HELP_OPENED_KEY)).toBe('1')
    expect(link(true)).toBe('') // fresh mount = reload
  })

  test('native prompt when offered; failed prompt falls back to the how-to', async () => {
    env()
    let shown = 0
    const ok = { prompt: async () => {}, userChoice: Promise.resolve({ outcome: 'dismissed' }) }
    expect(await openInstallHelp(ok as unknown as BeforeInstallPromptEvent, () => shown++)).toBe('prompt')
    const bad = { prompt: async () => { throw new Error('x') }, userChoice: Promise.resolve({ outcome: 'dismissed' }) }
    expect(await openInstallHelp(bad as unknown as BeforeInstallPromptEvent, () => shown++)).toBe('sheet')
    expect(shown).toBe(1)
  })

  test('tap target is at least 44px tall (min-h-11), text stays quiet', () => {
    env()
    const html = link(true)
    expect(html).toMatch(/<button[^>]*class="[^"]*\bmin-h-11\b[^"]*text-ink-muted[^"]*"[^>]*data-install-link|data-install-link[^>]*min-h-11/)
  })
})
