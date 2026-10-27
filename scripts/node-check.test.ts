import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, test } from 'bun:test'

const script = fileURLToPath(new URL('./node-check.mjs', import.meta.url))
const node = 'node'
const floor = { version: 'v22.23.4', nvmrc: '22.23.4', engines: '>=22.23.4 <23' }

type CheckResult = { ok: boolean; problems: string[]; notes: string[] }

/** Spawn Node to call checkNode. Bun's process.version is not Node's. */
function check(input: Record<string, unknown>): CheckResult {
  const out = execFileSync(
    node,
    [
      '--input-type=module',
      '-e',
      `import { checkNode } from ${JSON.stringify(script)};
       process.stdout.write(JSON.stringify(checkNode(${JSON.stringify(input)})));`,
    ],
    { encoding: 'utf8' },
  )
  return JSON.parse(out) as CheckResult
}

describe('checkNode', () => {
  test('passes v22.23.4 with --exact', () => {
    const r = check({ ...floor, exact: true })
    expect(r.ok).toBe(true)
    expect(r.problems).toEqual([])
    expect(r.notes).toEqual([])
  })

  test('passes a newer 22.x patch without --exact and notes it', () => {
    const r = check({ ...floor, version: 'v22.23.5', exact: false })
    expect(r.ok).toBe(true)
    expect(r.notes.join('\n')).toMatch(/newer than \.nvmrc 22\.23\.4/)
  })

  test('fails below the floor', () => {
    const r = check({ ...floor, version: 'v22.23.3' })
    expect(r.ok).toBe(false)
    expect(r.problems.join('\n')).toMatch(/below \.nvmrc/)
  })

  test('fails a wrong major', () => {
    const r = check({ ...floor, version: 'v20.19.2' })
    expect(r.ok).toBe(false)
    expect(r.problems.join('\n')).toMatch(/major is 20, not 22/)
  })

  test('fails when Bun stands in for node', () => {
    const r = check({ ...floor, version: 'v26.3.0', bun: '1.4.4' })
    expect(r.ok).toBe(false)
    expect(r.problems.join('\n')).toMatch(/process\.versions\.bun is set/)
  })

  test('fails an unreadable process.version', () => {
    for (const version of [undefined, '', 'garbage']) {
      const r = check({ ...floor, version })
      expect(r.ok).toBe(false)
      expect(r.problems.join('\n')).toMatch(/not vX\.Y\.Z/)
    }
  })

  test('fails when .nvmrc is missing or not X.Y.Z', () => {
    for (const nvmrc of [undefined, '22']) {
      const r = check({ ...floor, nvmrc })
      expect(r.ok).toBe(false)
      expect(r.problems.join('\n')).toMatch(/\.nvmrc is missing or not X\.Y\.Z/)
    }
  })

  test('fails when engines.node disagrees with .nvmrc', () => {
    const r = check({ ...floor, engines: '>=22 <23' })
    expect(r.ok).toBe(false)
    expect(r.problems.join('\n')).toMatch(/engines\.node .* is not >=22\.23\.4 <23/)
  })

  test('fails --exact when the patch is newer', () => {
    const r = check({ ...floor, version: 'v22.23.5', exact: true })
    expect(r.ok).toBe(false)
    expect(r.problems.join('\n')).toMatch(/not exactly \.nvmrc 22\.23\.4/)
    expect(r.notes).toEqual([])
  })
})

describe('node scripts/node-check.mjs', () => {
  test('CLI --root --exact passes when .nvmrc equals this node', () => {
    const dir = mkdtempSync(join(tmpdir(), 'node-check-'))
    try {
      const ver = execFileSync(node, ['-p', 'process.versions.node'], { encoding: 'utf8' }).trim()
      writeFileSync(join(dir, '.nvmrc'), `${ver}\n`)
      writeFileSync(
        join(dir, 'package.json'),
        JSON.stringify({ engines: { node: `>=${ver} <23` } }),
      )
      const out = execFileSync(node, [script, '--root', dir, '--exact'], { encoding: 'utf8' })
      expect(out).toBe('')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  test('CLI exits 1 when the floor is above this node', () => {
    const dir = mkdtempSync(join(tmpdir(), 'node-check-'))
    try {
      writeFileSync(join(dir, '.nvmrc'), '22.99.99\n')
      writeFileSync(
        join(dir, 'package.json'),
        JSON.stringify({ engines: { node: '>=22.99.99 <23' } }),
      )
      expect(() => execFileSync(node, [script, '--root', dir], { encoding: 'utf8' })).toThrow()
      try {
        execFileSync(node, [script, '--root', dir], { encoding: 'utf8' })
      } catch (error) {
        const err = error as { status: number; stdout: string }
        expect(err.status).toBe(1)
        expect(err.stdout).toMatch(/FAIL {2}v\d+\.\d+\.\d+ is below \.nvmrc 22\.99\.99/)
      }
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  test('CLI entry guard does not rely on import.meta.main', () => {
    expect(readFileSync(script, 'utf8')).not.toMatch(/^if \(import\.meta\.main\)/m)
  })

  test('CLI run through a symlinked path still checks and fails below the floor', () => {
    const dir = mkdtempSync(join(tmpdir(), 'node-check-'))
    try {
      symlinkSync(dirname(script), join(dir, 'link'))
      writeFileSync(join(dir, '.nvmrc'), '22.99.99\n')
      writeFileSync(
        join(dir, 'package.json'),
        JSON.stringify({ engines: { node: '>=22.99.99 <23' } }),
      )
      const linked = join(dir, 'link', 'node-check.mjs')
      try {
        execFileSync(node, [linked, '--root', dir], { encoding: 'utf8' })
        throw new Error('expected exit 1')
      } catch (error) {
        const err = error as { status?: number; stdout?: string }
        expect(err.status).toBe(1)
        expect(err.stdout).toMatch(/FAIL {2}v\d+\.\d+\.\d+ is below \.nvmrc 22\.99\.99/)
      }
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
