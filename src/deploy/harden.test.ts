import { describe, expect, test } from 'bun:test'
import { getHealth } from '../api/client'
import { onRequestGet } from '../../functions/api/health'
import {
  BUN_PIN,
  PAGES_PROJECT,
  STAGING_STAGE,
  PRODUCTION_STAGE,
  ROLLBACK_API_PATH,
  ROLLBACK_NAME,
  headerRule,
  parseHeadersFile,
  readStageBindings,
  PRODUCTION_ORIGIN,
  selectRollbackTarget,
  SOCIAL_BANNER_PATH,
  socialImageOrigin,
  type PagesDeployment,
} from './harden'

const root = new URL('../../', import.meta.url)

async function readRepo(path: string): Promise<string> {
  return Bun.file(new URL(path, root)).text()
}

describe('cache and security headers', () => {
  test('ships the ADR 0011 cache rules and a locked-down security set', async () => {
    const rules = parseHeadersFile(await readRepo('public/_headers'))

    for (const path of ['/', '/index.html', '/sw.js', '/workbox-*.js', '/manifest.webmanifest']) {
      expect(headerRule(rules, path).headers['cache-control']).toBe('no-cache')
    }
    expect(headerRule(rules, '/packs/*').headers['cache-control']).toBe(
      'public, max-age=0, must-revalidate',
    )
    expect(headerRule(rules, '/assets/*').headers['cache-control']).toBe(
      'public, max-age=31536000, immutable',
    )
    expect(headerRule(rules, '/og-banner.png').headers['cache-control']).toBe(
      'public, max-age=86400',
    )

    const security = headerRule(rules, '/*').headers
    expect(security['x-content-type-options']).toBe('nosniff')
    expect(security['referrer-policy']).toBe('strict-origin-when-cross-origin')
    expect(security['x-frame-options']).toBe('DENY')
    expect(security['permissions-policy']).toContain('camera=()')
    expect(security['strict-transport-security']).toContain('max-age=31536000')
    const csp = security['content-security-policy'] ?? ''
    expect(csp).toContain("default-src 'self'")
    expect(csp).toContain("script-src 'self'")
    expect(csp).toContain("style-src 'self'")
    expect(csp).toContain("font-src 'self'")
    expect(csp).toContain("connect-src 'self'")
    expect(csp).toContain("worker-src 'self'")
    expect(csp).toContain("frame-ancestors 'none'")
    expect(csp).toContain("object-src 'none'")
    expect(csp).not.toContain('unsafe-eval')
    expect(csp).not.toContain('unsafe-inline')
  })
})

describe('staging bindings differ from production', () => {
  test('wrangler.toml gives each environment its own HIATO_STAGE', async () => {
    const bindings = readStageBindings(await readRepo('wrangler.toml'))
    expect(bindings.production).toBe(PRODUCTION_STAGE)
    expect(bindings.staging).toBe(STAGING_STAGE)
    expect(bindings.staging).not.toBe(bindings.production)
  })

  test('health accepts only the two stage bindings', async () => {
    const production = await onRequestGet({ env: { HIATO_STAGE: PRODUCTION_STAGE } })
    expect(production.status).toBe(200)
    expect(await production.json()).toEqual({ ok: true, stage: PRODUCTION_STAGE })

    const staging = await onRequestGet({ env: { HIATO_STAGE: STAGING_STAGE } })
    expect(staging.status).toBe(200)
    expect(await staging.json()).toEqual({ ok: true, stage: STAGING_STAGE })

    const missing = await onRequestGet({ env: {} })
    expect(missing.status).toBe(503)
    expect(await missing.json()).toEqual({ ok: false })

    const legacyPreview = await onRequestGet({ env: { HIATO_STAGE: 'preview' } })
    expect(legacyPreview.status).toBe(503)
    expect(await legacyPreview.json()).toEqual({ ok: false })
  })

  test('getHealth resolves only a 200 body that includes stage', async () => {
    const original = globalThis.fetch
    globalThis.fetch = (async () =>
      Response.json({ ok: true, stage: 'staging' })) as typeof fetch
    try {
      expect(await getHealth()).toEqual({ ok: true, stage: 'staging' })
    } finally {
      globalThis.fetch = original
    }

    globalThis.fetch = (async () => Response.json({ ok: true })) as typeof fetch
    try {
      await expect(getHealth()).rejects.toThrow('Health response missing stage')
    } finally {
      globalThis.fetch = original
    }
  })
})

describe('social banner', () => {
  test('production links use the public alias; previews use the deployment', () => {
    expect(socialImageOrigin({})).toBe(PRODUCTION_ORIGIN)
    expect(socialImageOrigin({ branch: 'main', pagesUrl: 'https://abc123.hiato.pages.dev' })).toBe(
      PRODUCTION_ORIGIN,
    )
    expect(
      socialImageOrigin({
        branch: 'staging',
        pagesUrl: 'https://staging-deploy.hiato.pages.dev/ignored',
      }),
    ).toBe('https://staging-deploy.hiato.pages.dev')
    expect(socialImageOrigin({ branch: 'staging' })).toBe(PRODUCTION_ORIGIN)
    expect(socialImageOrigin({ branch: 'staging', pagesUrl: 'http://insecure.example' })).toBe(
      PRODUCTION_ORIGIN,
    )
    expect(socialImageOrigin({ branch: 'staging', pagesUrl: 'not a url' })).toBe(PRODUCTION_ORIGIN)
  })

  test('index.html advertises a large summary card and a 1200×630 banner', async () => {
    const html = await readRepo('index.html')
    expect(html).toContain('name="twitter:card" content="summary_large_image"')
    expect(html).toContain(
      `property="og:image" content="%HIATO_ORIGIN%${SOCIAL_BANNER_PATH}?v=1"`,
    )
    expect(html).toContain(
      `name="twitter:image" content="%HIATO_ORIGIN%${SOCIAL_BANNER_PATH}?v=1"`,
    )
    expect(html).toContain('property="og:image:width" content="1200"')
    expect(html).toContain('property="og:image:height" content="630"')

    const cfg = await readRepo('vite.config.ts')
    expect(cfg).toContain('socialImageOrigin')
    expect(cfg).toContain("'**/og-banner.png'")
    expect(cfg).toContain('/^\\/og-banner\\.png/')

    const bytes = new Uint8Array(
      await Bun.file(new URL(`../../public${SOCIAL_BANNER_PATH}`, import.meta.url)).arrayBuffer(),
    )
    expect(bytes[0]).toBe(0x89)
    expect(bytes[1]).toBe(0x50)
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
    expect(view.getUint32(16)).toBe(1200)
    expect(view.getUint32(20)).toBe(630)
    expect(bytes.byteLength).toBeLessThan(300_000)
  })
})

describe('Bun pin', () => {
  test('packageManager, tool-versions, CI, and Pages docs share 1.4.2', async () => {
    const pkg = JSON.parse(await readRepo('package.json')) as { packageManager: string }
    expect(pkg.packageManager).toBe(`bun@${BUN_PIN}`)
    expect((await readRepo('.tool-versions')).trim()).toBe(`bun ${BUN_PIN}`)
    expect(await readRepo('.github/workflows/ci.yml')).toContain(`bun-version: '${BUN_PIN}'`)

    for (const path of [
      'README.md',
      'docs/cloudflare-pages.md',
      'docs/adr/0002-package-manager-bun.md',
      'docs/adr/0013-bun-version-at-scaffold.md',
    ]) {
      const text = await readRepo(path)
      expect(text).toContain(BUN_PIN)
      expect(text).toContain('Production')
      expect(text).toContain('Preview')
    }
  })
})

describe('OS appearance chrome', () => {
  test('dual theme-color, color-scheme, and no inline style or script', async () => {
    const html = await readRepo('index.html')
    const darkTheme = html.indexOf(
      'name="theme-color" media="(prefers-color-scheme: dark)" content="#1c1b19"',
    )
    const creamTheme = html.indexOf('name="theme-color" content="#f7f6f3"')
    expect(darkTheme).toBeGreaterThan(-1)
    expect(creamTheme).toBeGreaterThan(darkTheme)
    expect(html.match(/name="theme-color"/g)?.length).toBe(2)
    expect(html).toContain('name="color-scheme" content="light dark"')
    expect(html).toContain('name="apple-mobile-web-app-status-bar-style" content="default"')
    expect(html).not.toMatch(/<style\b/i)

    const scripts = [
      ...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi),
    ]
    expect(scripts.length).toBeGreaterThan(0)
    for (const [, attrs, body] of scripts) {
      expect(attrs).toMatch(/\bsrc=/)
      expect(body.trim()).toBe('')
    }

    const csp =
      headerRule(parseHeadersFile(await readRepo('public/_headers')), '/*').headers[
        'content-security-policy'
      ] ?? ''
    expect(csp).not.toContain('unsafe-inline')

    const cfg = await readRepo('vite.config.ts')
    expect(cfg).toContain("theme_color: '#f7f6f3'")
    expect(cfg).toContain("background_color: '#f7f6f3'")
    expect(cfg).not.toContain('color_scheme_dark')
    expect(cfg).not.toContain('pwaAssets')
  })
})

describe('named rollback hiato-production', () => {
  test('docs name the project path and exclude preview deployments', async () => {
    const doc = await readRepo('docs/cloudflare-pages.md')
    expect(doc).toContain(ROLLBACK_NAME)
    expect(doc).toContain(PAGES_PROJECT)
    expect(doc).toContain(ROLLBACK_API_PATH)
    expect(doc).toContain('Preview deployments are not valid rollback targets')
    expect(doc).toContain('older than the one currently serving')
  })

  test('selects the newest successful production deployment older than current', () => {
    const deployments: PagesDeployment[] = [
      {
        id: 'preview-new',
        environment: 'preview',
        success: true,
        createdAt: '2026-09-22T12:00:00Z',
      },
      {
        id: 'prod-current',
        environment: 'production',
        success: true,
        createdAt: '2026-09-22T10:00:00Z',
        isCurrent: true,
      },
      {
        id: 'prod-failed',
        environment: 'production',
        success: false,
        createdAt: '2026-09-21T10:00:00Z',
      },
      {
        id: 'prod-previous',
        environment: 'production',
        success: true,
        createdAt: '2026-09-20T10:00:00Z',
      },
      {
        id: 'prod-older',
        environment: 'production',
        success: true,
        createdAt: '2026-09-19T10:00:00Z',
      },
    ]
    expect(selectRollbackTarget(deployments)?.id).toBe('prod-previous')
    expect(
      selectRollbackTarget([
        {
          id: 'only',
          environment: 'production',
          success: true,
          createdAt: '2026-09-22T10:00:00Z',
          isCurrent: true,
        },
      ]),
    ).toBeNull()
    expect(
      selectRollbackTarget(
        deployments.map((deployment) =>
          deployment.id === 'prod-previous'
            ? { ...deployment, isCurrent: true }
            : { ...deployment, isCurrent: false },
        ),
      )?.id,
    ).toBe('prod-older')
    expect(
      selectRollbackTarget(
        deployments.map((deployment) => ({ ...deployment, isCurrent: false })),
      ),
    ).toBeNull()
  })
})
