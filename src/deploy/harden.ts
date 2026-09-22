/** H1 production-harden checks (issue #8, ADR 0011 / 0013 / 0021 / 0022). */

export const BUN_PIN = '1.4.2'
export const PAGES_PROJECT = 'hiato'
/** Named production rollback: previous successful production deployment of this project. */
export const ROLLBACK_NAME = 'hiato-production'
export const ROLLBACK_API_PATH =
  '/accounts/{account_id}/pages/projects/hiato/deployments/{deployment_id}/rollback'

export const STAGE_BINDING = 'HIATO_STAGE'
export const PRODUCTION_STAGE = 'production'
export const PREVIEW_STAGE = 'preview'

export type PagesStage = typeof PRODUCTION_STAGE | typeof PREVIEW_STAGE

export function isPagesStage(value: string | undefined): value is PagesStage {
  return value === PRODUCTION_STAGE || value === PREVIEW_STAGE
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

export type StageBindings = {
  production: string
  preview: string
}

/**
 * Read `HIATO_STAGE` from a Pages wrangler file.
 * Top-level `[vars]` is production. `[env.preview.vars]` must override it.
 */
export function readStageBindings(toml: string): StageBindings {
  let section = ''
  let production: string | undefined
  let preview: string | undefined
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
    if (section === 'env.preview.vars') preview = value
  }
  if (!production || !preview) {
    throw new Error('wrangler.toml must set HIATO_STAGE for production and preview')
  }
  return { production, preview }
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
 * deployment that is not the one currently serving. Preview deployments are
 * never targets.
 */
export function selectRollbackTarget(
  deployments: readonly PagesDeployment[],
): PagesDeployment | null {
  const candidates = deployments.filter(
    (deployment) =>
      deployment.environment === 'production' &&
      deployment.success &&
      deployment.isCurrent !== true,
  )
  candidates.sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0))
  return candidates[0] ?? null
}
