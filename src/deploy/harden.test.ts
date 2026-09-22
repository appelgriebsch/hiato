import { describe, expect, test } from 'bun:test'
import { onRequestGet } from '../../functions/api/health'
import {
  BUN_PIN,
  PAGES_PROJECT,
  PREVIEW_STAGE,
  PRODUCTION_STAGE,
  ROLLBACK_API_PATH,
  ROLLBACK_NAME,
  headerRule,
  parseHeadersFile,
  readStageBindings,
  selectRollbackTarget,
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

describe('preview bindings differ from production', () => {
  test('wrangler.toml gives each environment its own HIATO_STAGE', async () => {
    const bindings = readStageBindings(await readRepo('wrangler.toml'))
    expect(bindings.production).toBe(PRODUCTION_STAGE)
    expect(bindings.preview).toBe(PREVIEW_STAGE)
    expect(bindings.preview).not.toBe(bindings.production)
  })

  test('health accepts only the two stage bindings', async () => {
    const production = await onRequestGet({ env: { HIATO_STAGE: PRODUCTION_STAGE } })
    expect(production.status).toBe(200)
    expect(await production.json()).toEqual({ ok: true, stage: PRODUCTION_STAGE })

    const preview = await onRequestGet({ env: { HIATO_STAGE: PREVIEW_STAGE } })
    expect(preview.status).toBe(200)
    expect(await preview.json()).toEqual({ ok: true, stage: PREVIEW_STAGE })

    const missing = await onRequestGet({ env: {} })
    expect(missing.status).toBe(503)
    expect(await missing.json()).toEqual({ ok: false })
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

describe('named rollback hiato-production', () => {
  test('docs name the project path and exclude preview deployments', async () => {
    const doc = await readRepo('docs/cloudflare-pages.md')
    expect(doc).toContain(ROLLBACK_NAME)
    expect(doc).toContain(PAGES_PROJECT)
    expect(doc).toContain(ROLLBACK_API_PATH)
    expect(doc).toContain('Preview deployments are not valid rollback targets')
  })

  test('selects the newest successful production deployment that is not current', () => {
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
  })
})
