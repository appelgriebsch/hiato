import { execSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { resolveFullBuildSha } from '../src/deploy/build-sha.ts'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

const sha = resolveFullBuildSha(
  {
    HIATO_BUILD_SHA: process.env.HIATO_BUILD_SHA,
    CF_PAGES_COMMIT_SHA: process.env.CF_PAGES_COMMIT_SHA,
    GITHUB_SHA: process.env.GITHUB_SHA,
  },
  () =>
    execSync('git rev-parse HEAD', {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      cwd: root,
    }),
)

const dir = join(root, 'functions', '_generated')
mkdirSync(dir, { recursive: true })
writeFileSync(
  join(dir, 'build-sha.ts'),
  `export const BUILD_SHA = ${JSON.stringify(sha)}\n`,
)
