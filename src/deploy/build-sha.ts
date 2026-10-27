/** Resolve the build SHA baked into About (7 chars) and `/api/health` (40 chars). */

export type BuildShaEnv = {
  HIATO_BUILD_SHA?: string
  CF_PAGES_COMMIT_SHA?: string
  GITHUB_SHA?: string
}

const FULL_SHA = /^[0-9a-f]{40}$/

/**
 * Winning source, unsliced. Precedence: HIATO_BUILD_SHA → CF_PAGES_COMMIT_SHA →
 * GITHUB_SHA → git. A higher source that is set but shorter than 7 chars blocks
 * the lower env sources and falls through to git, matching the old resolver.
 * Empty string if git throws or is blank.
 */
function chosenBuildSha(env: BuildShaEnv, readGitSha: () => string): string {
  const fromEnv = env.HIATO_BUILD_SHA || env.CF_PAGES_COMMIT_SHA || env.GITHUB_SHA
  if (fromEnv && fromEnv.length >= 7) return fromEnv.trim()
  try {
    return readGitSha().trim()
  } catch {
    return ''
  }
}

/**
 * Short SHA for Vite `define`. Precedence: HIATO_BUILD_SHA → CF_PAGES_COMMIT_SHA →
 * GITHUB_SHA → git → `'dev'`. Never blank, never fetch, never throw out of config load.
 *
 * Callers supply `readGitSha` (vite.config wraps `git rev-parse`); tests stub it.
 */
export function resolveBuildSha(env: BuildShaEnv, readGitSha: () => string): string {
  const raw = chosenBuildSha(env, readGitSha)
  if (!raw) return 'dev'
  return raw.slice(0, 7)
}

/** Full 40-char hex SHA, or `'dev'` when the winning source is not that form. */
export function resolveFullBuildSha(env: BuildShaEnv, readGitSha: () => string): string {
  const raw = chosenBuildSha(env, readGitSha)
  return FULL_SHA.test(raw) ? raw : 'dev'
}
