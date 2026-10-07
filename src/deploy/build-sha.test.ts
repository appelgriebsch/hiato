import { describe, expect, test } from 'bun:test'
import { resolveBuildSha } from './build-sha'

const noGit = (): string => {
  throw new Error('git unavailable')
}

describe('resolveBuildSha (gh-166 / #167 W2)', () => {
  test('prefers CF_PAGES_COMMIT_SHA over GITHUB_SHA and slices to 7', () => {
    expect(
      resolveBuildSha(
        {
          CF_PAGES_COMMIT_SHA: 'abcdef0123456789',
          GITHUB_SHA: '1111111222223333',
        },
        noGit,
      ),
    ).toBe('abcdef0')
  })

  test('falls back to GITHUB_SHA when CF is absent', () => {
    expect(
      resolveBuildSha({ GITHUB_SHA: 'deadbeefcafe000' }, noGit),
    ).toBe('deadbee')
  })

  test('uses git when env is missing or too short', () => {
    expect(resolveBuildSha({}, () => 'abc1234')).toBe('abc1234')
    expect(resolveBuildSha({ GITHUB_SHA: 'abc' }, () => 'fedcba9')).toBe(
      'fedcba9',
    )
  })

  test('slices ambiguous git short SHA to 7', () => {
    expect(resolveBuildSha({}, () => 'abcdef0123456789\n')).toBe('abcdef0')
  })

  test('empty git stdout yields dev (never blank)', () => {
    expect(resolveBuildSha({}, () => '')).toBe('dev')
    expect(resolveBuildSha({}, () => '   \n')).toBe('dev')
  })

  test('git throw yields dev', () => {
    expect(resolveBuildSha({}, noGit)).toBe('dev')
  })
})

describe('vite define locks build SHA (gh-166 / #167 W1)', () => {
  test('wires __HIATO_BUILD_SHA__ via define + JSON.stringify(resolveBuildSha)', async () => {
    const src = await Bun.file(
      new URL('../../vite.config.ts', import.meta.url),
    ).text()
    expect(src).toContain("from './src/deploy/build-sha.js'")
    expect(src).toContain('resolveBuildSha(process.env, () =>')
    // Exact define key — Avery mutation __HIATO_BUILD_SHA_WRONG__ must fail here.
    expect(src).toMatch(
      /define:\s*\{[\s\S]*?__HIATO_BUILD_SHA__:\s*JSON\.stringify\(buildSha\)/,
    )
    expect(src).not.toContain('__HIATO_BUILD_SHA_WRONG__')
    const defineAt = src.indexOf('define:')
    expect(defineAt).toBeGreaterThan(0)
    const defineBlock = src.slice(defineAt, src.indexOf('plugins:', defineAt))
    expect(defineBlock).toContain('__HIATO_BUILD_SHA__')
    expect(defineBlock).toContain('JSON.stringify(buildSha)')
    expect(defineBlock).not.toMatch(/__HIATO_BUILD_SHA_[A-Z]+__/)
  })
})
