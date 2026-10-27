import { spawn, spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { chmodSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, test } from 'bun:test'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const deploy = readFileSync(join(root, '.github/workflows/deploy.yml'), 'utf8')
const ci = readFileSync(join(root, '.github/workflows/ci.yml'), 'utf8')
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as {
  trustedDependencies: string[]
}
const sha = 'a'.repeat(40)

function job(yaml: string, name: string): string {
  const lines = yaml.split('\n')
  const start = lines.findIndex((line) => line === `  ${name}:`)
  if (start < 0) throw new Error(`missing job ${name}`)
  const body: string[] = []
  for (let i = start + 1; i < lines.length; i++) {
    if (/^  [a-z0-9-]+:$/.test(lines[i])) break
    body.push(lines[i])
  }
  return body.join('\n')
}

function jobNames(yaml: string): string[] {
  const lines = yaml.split('\n')
  const start = lines.indexOf('jobs:')
  if (start < 0) throw new Error('missing jobs')
  const names: string[] = []
  for (let i = start + 1; i < lines.length; i++) {
    if (lines[i] && !lines[i].startsWith(' ')) break
    const match = /^  ([a-z0-9-]+):$/.exec(lines[i])
    if (match) names.push(match[1])
  }
  return names
}

function step(jobBody: string, title: string): string {
  const lines = jobBody.split('\n')
  const start = lines.findIndex((line) => line === `      - name: ${title}`)
  if (start < 0) throw new Error(`missing step ${title}`)
  const block = [lines[start]]
  for (let i = start + 1; i < lines.length; i++) {
    if (lines[i].startsWith('      - ')) break
    block.push(lines[i])
  }
  return block.join('\n')
}

function runBody(block: string): string {
  const lines = block.split('\n')
  const idx = lines.findIndex((line) => line.startsWith('        run:'))
  if (idx < 0) throw new Error('missing run')
  if (lines[idx].trim() !== 'run: |') return lines[idx].replace(/^.*run:\s*/, '')
  return lines
    .slice(idx + 1)
    .map((line) => line.slice(10))
    .join('\n')
}

function wranglerScript(name: string): string {
  return runBody(step(job(deploy, name), 'Install wrangler from the lockfile'))
}

/** From the lockfile read through the case, the part tests execute. */
function versionGuard(script: string): string {
  const start = script.indexOf('version=$(')
  const end = script.indexOf('esac')
  if (start < 0 || end < 0) throw new Error('version guard missing')
  return script.slice(start, end + 'esac'.length)
}

function runDigest(script: string, fault: 'ok' | 'digest' | 'recorded' | 'tamper' | 'missing' | 'corrupt') {
  const dir = mkdtempSync(join(tmpdir(), 'hiato-digest-'))
  const runner = join(dir, 'runner')
  const stage = join(dir, 'stage')
  const ws = join(dir, 'ws')
  try {
    mkdirSync(join(stage, 'dist'), { recursive: true })
    mkdirSync(join(stage, 'functions', '_generated'), { recursive: true })
    mkdirSync(join(runner, 'release'), { recursive: true })
    mkdirSync(ws)
    const index = 'ok\n'
    const buildSha = 'export {}\n'
    writeFileSync(join(stage, 'functions', '_generated', 'build-sha.ts'), buildSha)
    if (fault === 'missing') writeFileSync(join(stage, 'dist', 'other.txt'), 'x\n')
    else writeFileSync(join(stage, 'dist', 'index.html'), index)
    const tarPath = join(runner, 'release', 'hiato-pages.tar.gz')
    const pack = () => {
      const packed = spawnSync('tar', ['-czf', tarPath, 'dist', 'functions/_generated'], { cwd: stage })
      if (packed.status !== 0) throw new Error('tar failed')
    }
    if (fault === 'corrupt') writeFileSync(tarPath, 'not a tarball\n')
    else pack()
    const digest = createHash('sha256').update(readFileSync(tarPath)).digest('hex')
    writeFileSync(
      join(runner, 'release', 'hiato-pages.tar.gz.sha256'),
      `${fault === 'recorded' ? 'c'.repeat(64) : digest}\n`,
    )
    if (fault === 'tamper') {
      writeFileSync(join(stage, 'dist', 'index.html'), 'evil\n')
      pack()
    }
    if (fault === 'corrupt') {
      // Already on disk, so a non-zero is `tar` failing. `tar … || true` would exit 0.
      mkdirSync(join(ws, 'dist'), { recursive: true })
      mkdirSync(join(ws, 'functions', '_generated'), { recursive: true })
      writeFileSync(join(ws, 'dist', 'index.html'), index)
      writeFileSync(join(ws, 'functions', '_generated', 'build-sha.ts'), buildSha)
    }
    const result = spawnSync('bash', ['-c', script], {
      cwd: ws,
      env: {
        ...process.env,
        RUNNER_TEMP: runner,
        GITHUB_WORKSPACE: ws,
        DIGEST: fault === 'digest' ? 'b'.repeat(64) : digest,
      },
      encoding: 'utf8',
    })
    const read = (rel: string) => {
      try {
        return readFileSync(join(ws, rel), 'utf8')
      } catch {
        return ''
      }
    }
    return { status: result.status, index: read('dist/index.html'), buildSha: read('functions/_generated/build-sha.ts'), wantIndex: index, wantSha: buildSha }
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

function runGuard(lockVersion: string, printed: string) {
  const dir = mkdtempSync(join(tmpdir(), 'hiato-wrangler-'))
  try {
    writeFileSync(
      join(dir, 'bun.lock'),
      JSON.stringify({ packages: { wrangler: [`wrangler@${lockVersion}`, ''] } }),
    )
    const bin = join(dir, 'bin')
    mkdirSync(bin)
    writeFileSync(join(bin, 'node'), `#!/bin/sh\nprintf '%s\\n' ${JSON.stringify(printed)}\n`)
    chmodSync(join(bin, 'node'), 0o755)
    return spawnSync('bash', ['-euo', 'pipefail', '-c', versionGuard(wranglerScript('staging'))], {
      cwd: dir,
      env: { ...process.env, PATH: `${bin}:${process.env.PATH ?? ''}` },
      encoding: 'utf8',
    })
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

type SmokeMode = 'ok' | 'sha' | 'stage' | 'header' | '404'

const stubSource = `
const http = require('node:http')
const mode = process.env.SMOKE_MODE
const sha = process.env.SMOKE_SHA
const stage = 'staging'
const server = http.createServer((req, res) => {
  const url = req.url || ''
  const headers = { connection: 'close' }
  if (url === '/api/health') {
    if (mode === '404') {
      res.writeHead(404, Object.assign({ 'content-type': 'text/plain' }, headers))
      res.end('missing')
      return
    }
    headers['content-type'] = 'application/json'
    headers['x-content-type-options'] = 'nosniff'
    if (mode !== 'header') headers['cache-control'] = 'no-store'
    const body = JSON.stringify({
      ok: true,
      stage: mode === 'stage' ? 'other' : stage,
      sha: mode === 'sha' ? 'b'.repeat(40) : sha,
    })
    res.writeHead(200, headers)
    res.end(body)
    return
  }
  if (url === '/packs/en/a1.json') {
    res.writeHead(200, Object.assign({
      'content-type': 'application/json',
      'cache-control': 'public, max-age=0, must-revalidate',
    }, headers))
    res.end('{}')
    return
  }
  if (url === '/packs/en/nope.json') {
    res.writeHead(404, Object.assign({
      'content-type': 'text/plain',
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
    }, headers))
    res.end('Not Found')
    return
  }
  if (url === '/' || url === '/share?p=probe') {
    res.writeHead(200, Object.assign({ 'content-type': 'text/html', 'cache-control': 'no-cache' }, headers))
    res.end('<html></html>')
    return
  }
  res.writeHead(500, headers)
  res.end('unexpected')
})
server.listen(0, '127.0.0.1', () => {
  process.stdout.write(String(server.address().port) + '\\n')
})
`

function startStub(mode: SmokeMode): Promise<{ url: string; stop: () => void }> {
  const child = spawn('node', ['-e', stubSource], {
    env: { ...process.env, SMOKE_MODE: mode, SMOKE_SHA: sha },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  return new Promise((resolve, reject) => {
    let buf = ''
    let settled = false
    const fail = (message: string) => {
      if (settled) return
      settled = true
      child.kill()
      reject(new Error(message))
    }
    const timer = setTimeout(() => fail('stub did not listen'), 2000)
    child.stdout.on('data', (chunk: Buffer) => {
      buf += chunk.toString()
      const line = buf.split('\n')[0]?.trim() ?? ''
      if (!/^\d+$/.test(line) || settled) return
      settled = true
      clearTimeout(timer)
      resolve({ url: `http://127.0.0.1:${line}`, stop: () => child.kill() })
    })
    child.on('exit', (code) => fail(`stub exited ${code}`))
  })
}

async function smoke(mode: SmokeMode): Promise<number | null> {
  const started = await startStub(mode)
  try {
    const result = spawnSync('bash', [join(root, 'scripts/smoke-health.sh'), started.url, 'staging', sha], {
      env: { ...process.env, SMOKE_DEADLINE: '0', SMOKE_SLEEP: '0' },
      encoding: 'utf8',
    })
    return result.status
  } finally {
    started.stop()
  }
}

describe('deploy.yml', () => {
  test('runs after green CI for a push to main of this repo', () => {
    expect(deploy).toMatch(/workflow_run:\n {4}workflows: \[CI\]\n {4}types: \[completed\]/)
    expect(deploy).not.toMatch(/^\s*push:/m)
    const build = job(deploy, 'build')
    expect(build).toContain("github.event_name == 'workflow_run'")
    expect(build).toContain("github.event.workflow_run.conclusion == 'success'")
    expect(build).toContain("github.event.workflow_run.event == 'push'")
    expect(build).toContain("github.event.workflow_run.head_branch == 'main'")
    expect(build).toContain(
      'github.event.workflow_run.head_repository.full_name == github.repository',
    )
    expect(job(deploy, 'staging')).toContain('needs: build')
    expect(job(deploy, 'production')).toContain('needs: [build, staging]')
    expect(deploy).toMatch(/^run-name: \$\{\{ github\.event\.workflow_run\.head_sha \}\}/m)
  })

  test('checks out the validated head sha and does not use the workflow sha', () => {
    expect(deploy).not.toContain('GITHUB_SHA')
    expect(deploy).not.toContain('github.sha')
    const build = job(deploy, 'build')
    expect(build).toContain('HEAD_SHA: ${{ github.event.workflow_run.head_sha }}')
    expect(build).toContain('^[0-9a-f]{40}$')
    expect(build).toContain('ref: ${{ steps.sha.outputs.sha }}')
    for (const name of ['staging', 'production']) {
      expect(job(deploy, name)).toContain('ref: ${{ needs.build.outputs.sha }}')
      expect(job(deploy, name)).toContain('--commit-hash "$SHA"')
    }
    expect(build).not.toContain('bun test')
  })

  test('pins actions and does not persist checkout credentials', () => {
    for (const yaml of [deploy, ci]) {
      const uses = [...yaml.matchAll(/uses: ([^\s#]+)/g)].map((match) => match[1])
      expect(uses.length).toBeGreaterThan(0)
      for (const use of uses) expect(use).toMatch(/@[0-9a-f]{40}$/)
    }
    const checkouts = deploy.split('\n').filter((line) => line.includes('- uses: actions/checkout@'))
    expect(checkouts.length).toBe(3)
    for (const yaml of [deploy, ci]) {
      const lines = yaml.split('\n')
      for (let i = 0; i < lines.length; i++) {
        if (!lines[i].includes('- uses: actions/checkout@')) continue
        expect(lines.slice(i, i + 6).join('\n')).toContain('persist-credentials: false')
      }
    }
  })

  test('pins node from .nvmrc before setup-bun in every job', () => {
    const names = jobNames(deploy)
    for (const name of ['build', 'staging', 'production']) expect(names).toContain(name)
    for (const name of names) {
      const body = job(deploy, name)
      expect(body).toContain('node-version-file: .nvmrc')
      expect(body).toContain('node scripts/node-check.mjs --exact')
      const checkAt = body.indexOf('node scripts/node-check.mjs --exact')
      const bunAt = body.indexOf('oven-sh/setup-bun')
      expect(checkAt).toBeGreaterThanOrEqual(0)
      expect(bunAt).toBeGreaterThan(checkAt)
    }
  })

  test('keeps secrets off the build job and off every job env', () => {
    const build = job(deploy, 'build')
    expect(build).not.toContain('secrets.')
    expect(build.split('\n').some((line) => line.startsWith('    env:'))).toBe(false)
    expect(build.split('\n').some((line) => line.startsWith('    environment:'))).toBe(false)
    for (const name of ['staging', 'production']) {
      const body = job(deploy, name)
      expect(body.split('\n').some((line) => line.startsWith('    env:'))).toBe(false)
      expect(body.split('\n').some((line) => line.startsWith('    secrets:'))).toBe(false)
      const title = name === 'staging' ? 'Publish preview branch staging' : 'Publish production branch main'
      const publish = step(body, title)
      expect(publish).toContain('CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}')
      expect(publish).toContain('CLOUDFLARE_ACCOUNT_ID: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}')
      expect(body.replace(publish, '')).not.toContain('CLOUDFLARE_')
      expect(body.replace(publish, '')).not.toContain('secrets.')
    }
  })

  test('verifies the artifact digest in staging and production', () => {
    for (const name of ['staging', 'production']) {
      const verify = step(job(deploy, name), 'Verify artifact digest')
      expect(verify).toContain('DIGEST: ${{ needs.build.outputs.digest }}')
      expect(verify).toContain('"$file.sha256"')
      expect(verify).toContain('"$digest" != "$DIGEST"')
      expect(verify).toContain('"$digest" != "$recorded"')
      expect(verify).toContain('functions/_generated/build-sha.ts')
      const script = runBody(verify)
      expect(script.split('\n')[0]).toBe('set -euo pipefail')
      const ok = runDigest(script, 'ok')
      expect(ok.status).toBe(0)
      expect(ok.index).toBe(ok.wantIndex)
      expect(ok.buildSha).toBe(ok.wantSha)
      expect(runDigest(script, 'digest').status).not.toBe(0)
      expect(runDigest(script, 'recorded').status).not.toBe(0)
      expect(runDigest(script, 'tamper').status).not.toBe(0)
      expect(runDigest(script, 'missing').status).not.toBe(0)
      expect(runDigest(script, 'corrupt').status).not.toBe(0)
    }
    expect(deploy).not.toContain('retention-days')
  })

  test('publishes staging as a preview branch and production as main, never dirty', () => {
    const staging = runBody(step(job(deploy, 'staging'), 'Publish preview branch staging'))
    const production = runBody(step(job(deploy, 'production'), 'Publish production branch main'))
    expect(staging).toMatch(/--branch staging \\\n/)
    expect(staging).not.toMatch(/--branch main\b/)
    expect(production).toMatch(/--branch main \\\n/)
    for (const script of [staging, production]) {
      expect(script).toContain('--commit-hash "$SHA"')
      expect(script).not.toMatch(/--commit-dirty[ =]/)
      expect(script).not.toMatch(/--env[ =]|--config[ =]/)
    }
  })

  test('wrangler install guard fails closed', () => {
    const staging = wranglerScript('staging')
    const production = wranglerScript('production')
    expect(staging).toBe(production)
    expect(staging).toContain('bun install --frozen-lockfile --ignore-scripts')
    expect(staging).not.toMatch(/\|\| true/)
    const read = staging.match(/bun -e '([^']+)'/)
    if (!read) throw new Error('missing bun -e')
    const locked = spawnSync('bun', ['-e', read[1]], { cwd: root, encoding: 'utf8' })
    expect(locked.status).toBe(0)
    expect(locked.stdout.trim()).toBe('4.136.2')

    const good = runGuard('4.136.2', '4.136.2')
    expect(good.status).toBe(0)
    expect(runGuard('', '4.136.2').status).not.toBe(0)
    expect(runGuard('nope', 'nope').status).not.toBe(0)
    expect(runGuard('4.136.2', '9.9.9').status).not.toBe(0)
  })
})

describe('smoke-health.sh', () => {
  test('keeps a 60s default and deploy does not override it', () => {
    const script = readFileSync(join(root, 'scripts/smoke-health.sh'), 'utf8')
    expect(script).toContain('SMOKE_DEADLINE:-60')
    expect(script).toContain('SMOKE_SLEEP:-2')
    expect(deploy).not.toContain('SMOKE_DEADLINE')
    expect(deploy).not.toContain('SMOKE_SLEEP')
    expect(job(deploy, 'staging')).toContain(
      'bash scripts/smoke-health.sh "$DEPLOYMENT_URL" staging "$SHA"',
    )
    expect(job(deploy, 'production')).toContain(
      'bash scripts/smoke-health.sh "$DEPLOYMENT_URL" production "$SHA"',
    )
  })

  test('accepts the health body and rejects a bad probe', async () => {
    expect(await smoke('ok')).toBe(0)
    expect(await smoke('sha')).not.toBe(0)
    expect(await smoke('stage')).not.toBe(0)
    expect(await smoke('header')).not.toBe(0)
    expect(await smoke('404')).not.toBe(0)
  })
})

describe('ci.yml', () => {
  test('functions build leaves package.json and bun.lock untouched', () => {
    const build = job(ci, 'build-test')
    const fn = step(build, 'Pages functions build leaves package.json and bun.lock untouched')
    expect(fn).toContain(
      'node node_modules/wrangler/bin/wrangler.js pages functions build --outdir "$RUNNER_TEMP/functions-build"',
    )
    expect(fn).toContain('git diff --exit-code -- package.json bun.lock')
    expect(fn).toContain('git status --porcelain -- package.json bun.lock')
    for (const name of ['staging', 'production']) {
      const title = name === 'staging' ? 'Publish preview branch staging' : 'Publish production branch main'
      expect(step(job(deploy, name), title)).toContain('git diff --exit-code -- package.json bun.lock')
    }
  })

  test('build-test gates lint, licences, prod audit, and pinned linters', () => {
    const build = job(ci, 'build-test')
    expect(build).toContain('node scripts/node-check.mjs --exact')
    expect(build).toContain('bun run lint')
    expect(build).toContain('bun run licenses:check')
    expect(build).toContain('bun audit --prod --audit-level=high')
    expect(build).toContain('actionlint -shellcheck')
    expect(build).toContain('shellcheck scripts/*.sh')
    expect(build).toContain('actionlint_1.7.12_linux_amd64.tar.gz')
    expect(build).toContain('shellcheck-v0.11.0.linux.x86_64.tar.xz')
    expect(build).toContain('8aca8db96f1b94770f1b0d72b6dddcb1ebb8123cb3712530b08cc387b349a3d8')
    expect(build).toContain('8c3be12b05d5c177a04c29e3c78ce89ac86f1595681cab149b65b97c4e227198')
  })
})

describe('install scripts', () => {
  test('bunfig ignores scripts and trustedDependencies is empty', () => {
    const bunfig = readFileSync(join(root, 'bunfig.toml'), 'utf8')
    expect(bunfig).toMatch(/^ignoreScripts = true$/m)
    expect(pkg.trustedDependencies).toEqual([])
  })
})
