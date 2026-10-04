/** H1 production-harden checks (issue #8, ADR 0011 / 0013 / 0021 / 0022). */

export const BUN_PIN = '1.4.2'
export const PAGES_PROJECT = 'hiato'
/** Named production rollback: previous successful production deployment of this project. */
export const ROLLBACK_NAME = 'hiato-production'
export const ROLLBACK_API_PATH =
  '/accounts/{account_id}/pages/projects/hiato/deployments/{deployment_id}/rollback'

export const STAGE_BINDING = 'HIATO_STAGE'
export const PRODUCTION_STAGE = 'production'
export const STAGING_STAGE = 'staging'

export type PagesStage = typeof PRODUCTION_STAGE | typeof STAGING_STAGE

export function isPagesStage(value: string | undefined): value is PagesStage {
  return value === PRODUCTION_STAGE || value === STAGING_STAGE
}

export type HeaderRule = {
  path: string
  headers: Record<string, string>
}

/** Parse a Cloudflare Pages `_headers` file. Header names are lower-cased. */
export function parseHeadersFile(text: string): HeaderRule[] {
  const rules: HeaderRule[] = []
  let current: HeaderRule | null = null
  for (const raw of text.split('\n')) {
    const trimmed = raw.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const indented = raw.startsWith(' ') || raw.startsWith('\t')
    if (!indented) {
      current = { path: trimmed, headers: {} }
      rules.push(current)
      continue
    }
    if (!current) throw new Error(`header without a path: ${trimmed}`)
    const colon = trimmed.indexOf(':')
    if (colon < 1) throw new Error(`bad header line: ${trimmed}`)
    const name = trimmed.slice(0, colon).trim().toLowerCase()
    const value = trimmed.slice(colon + 1).trim()
    current.headers[name] = value
  }
  return rules
}

export function headerRule(
  rules: readonly HeaderRule[],
  path: string,
): HeaderRule {
  const rule = rules.find((item) => item.path === path)
  if (!rule) throw new Error(`missing _headers rule ${path}`)
  return rule
}

/**
 * Security headers from `public/_headers` `/*`.
 * Pages Functions do not receive `_headers`, so function responses set these.
 */
export const PAGES_SECURITY_HEADERS: Readonly<Record<string, string>> = {
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'strict-origin-when-cross-origin',
  'x-frame-options': 'DENY',
  'permissions-policy': 'camera=(), microphone=(), geolocation=(), payment=()',
  'strict-transport-security': 'max-age=31536000; includeSubDomains',
  'content-security-policy':
    "default-src 'self'; script-src 'self'; style-src 'self'; font-src 'self'; img-src 'self' data: blob:; connect-src 'self'; worker-src 'self'; manifest-src 'self'; base-uri 'self'; form-action 'self'; object-src 'none'; frame-ancestors 'none'",
}

/** Copy a response and set the `/*` security headers. Optional extras override. */
export function withSecurityHeaders(
  response: Response,
  extra?: Record<string, string>,
): Response {
  const headers = new Headers(response.headers)
  for (const [name, value] of Object.entries(PAGES_SECURITY_HEADERS)) {
    headers.set(name, value)
  }
  if (extra) {
    for (const [name, value] of Object.entries(extra)) headers.set(name, value)
  }
  if (response.status === 304 || response.status === 204) {
    return new Response(null, {
      status: response.status,
      statusText: response.statusText,
      headers,
    })
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  })
}

export type StageBindings = {
  production: string
  staging: string
}

/**
 * Read `HIATO_STAGE` from a Pages wrangler file.
 * Top-level `[vars]` is production. `[env.preview.vars]` must override it
 * with the staging stage name (Pages only has production and preview envs).
 */
export function readStageBindings(toml: string): StageBindings {
  let section = ''
  let production: string | undefined
  let staging: string | undefined
  for (const raw of toml.split('\n')) {
    const line = raw.trim()
    if (!line || line.startsWith('#')) continue
    const sectionMatch = /^\[([^\]]+)\]$/.exec(line)
    if (sectionMatch) {
      section = sectionMatch[1] ?? ''
      continue
    }
    const binding = /^HIATO_STAGE\s*=\s*"([^"]*)"\s*$/.exec(line)
    if (!binding) continue
    const value = binding[1] ?? ''
    if (section === 'vars') production = value
    if (section === 'env.production.vars') production = value
    if (section === 'env.preview.vars') staging = value
  }
  if (!production || !staging) {
    throw new Error('wrangler.toml must set HIATO_STAGE for production and staging')
  }
  return { production, staging }
}

export type PagesDeployment = {
  id: string
  environment: 'production' | 'preview'
  success: boolean
  /** ISO-8601 timestamp. Newer sorts first. */
  createdAt: string
  isCurrent?: boolean
}

/**
 * Rollback target for `hiato-production`: the newest successful production
 * deployment older than the one currently serving. A newer production
 * deployment is not a target, so a rollback cannot roll forward. Preview
 * deployments are never targets. No current deployment means no target.
 */
export function selectRollbackTarget(
  deployments: readonly PagesDeployment[],
): PagesDeployment | null {
  const current = deployments.find(
    (deployment) => deployment.isCurrent === true && deployment.environment === 'production',
  )
  if (!current) return null
  const candidates = deployments.filter(
    (deployment) =>
      deployment.environment === 'production' &&
      deployment.success &&
      deployment.createdAt < current.createdAt,
  )
  candidates.sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0))
  return candidates[0] ?? null
}

/** Stable production origin. Preview builds use the deployment URL instead. */
export const PRODUCTION_ORIGIN = 'https://hiato.pages.dev'

export const SOCIAL_BANNER_PATH = '/og-banner.png'

/**
 * Absolute origin for `og:image` / `twitter:image`.
 * Production (`main`, or a build with no Pages env) uses the public alias.
 * Any other branch uses that deployment's `CF_PAGES_URL`, so a preview link
 * unfurls the banner shipped with that build.
 */
export function socialImageOrigin(env: {
  pagesUrl?: string
  branch?: string
}): string {
  const branch = env.branch?.trim() ?? ''
  const pagesUrl = env.pagesUrl?.trim() ?? ''
  if (branch !== '' && branch !== 'main' && pagesUrl !== '') {
    try {
      const url = new URL(pagesUrl)
      if (url.protocol === 'https:') return url.origin
    } catch {
      // Ignore a malformed Pages URL and use the production alias.
    }
  }
  return PRODUCTION_ORIGIN
}
