import { describe, expect, test } from 'bun:test'
import {
  CF_BEACON_HOST,
  CF_BEACON_SRC,
  CF_RUM_HOST,
  initAnalytics,
  loadBeacon,
  resetAnalyticsForTest,
  WEB_ANALYTICS_TOKEN,
  type AnalyticsDeps,
} from './analytics'
import { parseHeadersFile, headerRule } from '../deploy/harden'
import type { HealthResponse } from '../api/client'

type FakeScript = {
  defer: boolean
  src: string
  attrs: Record<string, string>
  setAttribute: (name: string, value: string) => void
}

function fakeDocument() {
  const scripts: FakeScript[] = []
  const doc = {
    querySelector: (sel: string) =>
      sel === 'script[data-cf-beacon]' && scripts.length > 0 ? scripts[0] : null,
    createElement: () => {
      const script: FakeScript = {
        defer: false,
        src: '',
        attrs: {},
        setAttribute(name, value) {
          this.attrs[name] = value
        },
      }
      scripts.push(script)
      return script
    },
    head: {
      appendChild: (el: unknown) => el,
    },
  }
  return { doc, scripts }
}

function health(stage: 'production' | 'staging'): HealthResponse {
  return { ok: true, stage, sha: 'a'.repeat(40) }
}

async function run(deps: AnalyticsDeps) {
  resetAnalyticsForTest()
  await initAnalytics(deps)
}

describe('cookieless Web Analytics gating (ADR 0047, #224)', () => {
  test('production with a token injects the beacon exactly once', async () => {
    const { doc, scripts } = fakeDocument()
    await run({ token: 'tok123', health: async () => health('production'), doc: doc as never })
    expect(scripts.length).toBe(1)
    expect(scripts[0]!.src).toBe(CF_BEACON_SRC)
    expect(scripts[0]!.defer).toBe(true)
    expect(scripts[0]!.attrs['data-cf-beacon']).toBe(JSON.stringify({ token: 'tok123' }))

    resetAnalyticsForTest()
    await initAnalytics({ token: 'tok123', health: async () => health('production'), doc: doc as never })
    expect(scripts.length).toBe(1)
    expect(loadBeacon(doc as never, 'tok123')).toBe(false)
    expect(scripts.length).toBe(1)
  })

  test('staging never injects', async () => {
    const { doc, scripts } = fakeDocument()
    await run({ token: 'tok123', health: async () => health('staging'), doc: doc as never })
    expect(scripts.length).toBe(0)
  })

  test('health failure (offline) never injects', async () => {
    const { doc, scripts } = fakeDocument()
    await run({
      token: 'tok123',
      health: async () => {
        throw new Error('offline')
      },
      doc: doc as never,
    })
    expect(scripts.length).toBe(0)
  })

  test('empty token keeps the beacon off even on production', async () => {
    const { doc, scripts } = fakeDocument()
    await run({ token: '   ', health: async () => health('production'), doc: doc as never })
    expect(scripts.length).toBe(0)
  })

  test('default token comes from the build-time env define and is empty under bun test', async () => {
    expect(WEB_ANALYTICS_TOKEN).toBe('')
    const { doc, scripts } = fakeDocument()
    await run({ health: async () => health('production'), doc: doc as never })
    expect(scripts.length).toBe(0)
  })

  test('vite.config bakes WEB_ANALYTICS_TOKEN into the bundle via define', async () => {
    const root = new URL('../../', import.meta.url)
    const cfg = await Bun.file(new URL('vite.config.ts', root)).text()
    expect(cfg).toContain(
      "__HIATO_WEB_ANALYTICS_TOKEN__: JSON.stringify(process.env.WEB_ANALYTICS_TOKEN ?? '')",
    )
  })

  test('deploy.yml passes WEB_ANALYTICS_TOKEN from vars to the build step', async () => {
    const root = new URL('../../', import.meta.url)
    const yml = await Bun.file(new URL('.github/workflows/deploy.yml', root)).text()
    expect(yml).toMatch(
      /- run: bun run build\n {8}env:\n {10}HIATO_BUILD_SHA: \$\{\{ steps\.sha\.outputs\.sha \}\}\n {10}WEB_ANALYTICS_TOKEN: \$\{\{ vars\.WEB_ANALYTICS_TOKEN \}\}\n/,
    )
  })

  test('initAnalytics runs at most once per page load', async () => {
    const { doc, scripts } = fakeDocument()
    resetAnalyticsForTest()
    const deps = { token: 't', health: async () => health('production'), doc: doc as never }
    await Promise.all([initAnalytics(deps), initAnalytics(deps)])
    expect(scripts.length).toBe(1)
  })

  test('shipped CSP allows exactly the beacon script host and RUM host', async () => {
    const root = new URL('../../', import.meta.url)
    const rules = parseHeadersFile(await Bun.file(new URL('public/_headers', root)).text())
    const csp = headerRule(rules, '/*').headers['content-security-policy'] ?? ''
    expect(csp).toContain(`script-src 'self' ${CF_BEACON_HOST}`)
    expect(csp).toContain(`connect-src 'self' ${CF_RUM_HOST}`)
    expect(csp).not.toContain('unsafe-inline')
    expect(csp).not.toContain('unsafe-eval')
  })
})
