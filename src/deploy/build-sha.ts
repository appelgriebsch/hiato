/** Resolve the short build SHA baked into About via Vite `define`. */

export type BuildShaEnv = {
  CF_PAGES_COMMIT_SHA?: string
  GITHUB_SHA?: string
}

/**
 * Precedence: CF_PAGES_COMMIT_SHA → GITHUB_SHA → git → `'dev'`.
 * Staging/prod bake via GITHUB_SHA (GHA); branch previews via CF_PAGES_COMMIT_SHA.
 * Never blank, never fetch, never throw out of config load.
 *
 * Callers supply `readGitSha` (vite.config wraps `git rev-parse`); tests stub it.
 */
export function resolveBuildSha(
  env: BuildShaEnv,
  readGitSha: () => string,
): string {
  const fromEnv = env.CF_PAGES_COMMIT_SHA || env.GITHUB_SHA
  if (fromEnv && fromEnv.length >= 7) return fromEnv.slice(0, 7)
  try {
    const sha = readGitSha().trim().slice(0, 7)
    if (!sha) return 'dev'
    return sha
  } catch {
    return 'dev'
  }
}
