import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { describe, expect, test } from 'bun:test'
import { mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

const REPO = path.join(import.meta.dir, '..')
const CEFRS = ['a1', 'a2', 'b1', 'b2', 'c1', 'c2']

/** rel -> sha256 of every pack file, to prove a dry-run writes nothing. */
function snapshotPacks(): Record<string, string> {
  const root = path.join(REPO, 'public', 'packs')
  const out: Record<string, string> = {}
  for (const lang of readdirSync(root)) {
    for (const name of readdirSync(path.join(root, lang))) {
      if (!name.endsWith('.json')) continue
      out[`${lang}/${name}`] = createHash('sha256')
        .update(readFileSync(path.join(root, lang, name)))
        .digest('hex')
    }
  }
  return out
}

describe('expand-packs --grow --dry-run (fixture candidates, ADR 0058 / #328)', () => {
  test('prints per-band capacity for every selected pack and writes nothing', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'hiato-grow-'))
    const candidates: Record<string, string[]> = {}
    for (const cefr of CEFRS) {
      candidates[`en/${cefr}`] = ['ZEPPELIN', 'QUINOA', 'BUNGALOW', 'KIOSK', 'LANTERN', 'MARATHON']
    }
    const fixture = path.join(dir, 'candidates.json')
    writeFileSync(fixture, JSON.stringify(candidates))

    const before = snapshotPacks()
    const res = spawnSync(
      'bun',
      ['scripts/expand-packs.ts', '--grow', '--dry-run', '--lang=en'],
      {
        cwd: REPO,
        env: { ...process.env, HIATO_GROW_CANDIDATES: fixture },
        encoding: 'utf8',
        timeout: 180_000,
      },
    )
    expect(res.status).toBe(0)
    expect(res.stderr).not.toContain('Error')
    for (const cefr of CEFRS) {
      // ADR 0058: packs grow append-only past 400, so the existing count is data-dependent.
      expect(res.stdout).toMatch(new RegExp(`en/${cefr}: existing \\d+, capacity \\d+`))
      expect(res.stdout).toMatch(new RegExp(`\\| en/${cefr} \\| \\d+ \\|`))
    }
    expect(res.stdout).toContain('bandTarget')
    expect(res.stdout).toContain('dry-run: skip gloss/synonym generation and pack writes')
    // Zero changes under public/packs/.
    expect(snapshotPacks()).toEqual(before)
  })
})
