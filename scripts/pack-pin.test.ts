import { spawnSync } from 'node:child_process'
import { describe, expect, test } from 'bun:test'
import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import {
  collectPackPinErrors,
  loadPackPin,
  packPinEntry,
  packPinErrors,
  stableSlotErrors,
  type PinPack,
  type SlotPack,
} from './pack-pin'

function sample(n: number, gloss = 'una pista'): PinPack {
  return {
    version: 3,
    lemmas: Array.from({ length: n }, (_, i) => ({ word: `W${i}`, gloss })),
  }
}

describe('pack pin', () => {
  test('a pack with fewer than 400 lemmas fails', () => {
    const pack = sample(399)
    const errors = packPinErrors('es/b1.json', pack, packPinEntry(pack))
    expect(errors).toEqual(['es/b1.json: expected 400 lemmas, found 399'])
  })

  test('a shifted or reordered slot fails', () => {
    const pack = sample(400)
    const pin = packPinEntry(pack)
    const lemmas = pack.lemmas.slice()
    const [first] = lemmas.splice(0, 1)
    lemmas.push(first!)
    const errors = packPinErrors('es/b1.json', { ...pack, lemmas }, pin)
    expect(errors.some((e) => e.includes('slot order'))).toBe(true)
    expect(errors.some((e) => e.includes('expected 400'))).toBe(false)
  })

  test('a content change without a version bump fails', () => {
    const pack = sample(400)
    const pin = packPinEntry(pack)
    const changed = {
      ...pack,
      lemmas: pack.lemmas.map((l, i) => (i === 0 ? { ...l, gloss: 'otra pista' } : l)),
    }
    const stuck = packPinErrors('es/b1.json', changed, pin)
    expect(stuck.some((e) => e.includes('version was not bumped'))).toBe(true)
    expect(stuck.some((e) => e.includes('slot order'))).toBe(false)

    const bumped = packPinErrors('es/b1.json', { ...changed, version: pack.version + 1 }, pin)
    expect(bumped.some((e) => e.includes('version was not bumped'))).toBe(false)
    const mismatch = bumped.find((e) => e.includes('does not match pin'))
    expect(mismatch).toBeDefined()
    expect(mismatch).toContain(JSON.stringify({ 'es/b1.json': packPinEntry({ ...changed, version: pack.version + 1 }) }))
  })

  test('a missing pin fails', () => {
    const pack = sample(400)
    expect(packPinErrors('es/b1.json', pack, undefined)).toEqual(['es/b1.json: missing pack pin'])
  })

  test('an orphan pin fails', () => {
    const pack = sample(400)
    const pin = {
      'es/b1.json': packPinEntry(pack),
      'es/a1.json': packPinEntry(pack),
    }
    const errors = collectPackPinErrors([{ rel: 'es/b1.json', pack }], pin)
    expect(errors).toContain('es/a1.json: pin entry has no pack')
  })

  test('a surviving word that changes slot fails; a same-slot replacement passes', () => {
    const base: SlotPack[] = [{ rel: 'en/b1.json', words: ['CURIOUS', 'CURRENT', 'DAMAGE'] }]
    const swapped = stableSlotErrors(base, [
      { rel: 'en/b1.json', words: ['CURRENT', 'CURIOUS', 'DAMAGE'] },
    ])
    expect(swapped.some((e) => e.includes('"CURIOUS" moved from slot 0 to slot 1'))).toBe(true)
    expect(swapped.some((e) => e.includes('"CURRENT" moved from slot 1 to slot 0'))).toBe(true)

    const replaced = stableSlotErrors(base, [
      { rel: 'en/b1.json', words: ['CURIOUS', 'FRESH', 'DAMAGE'] },
    ])
    expect(replaced).toEqual([])

    const same = stableSlotErrors(base, base)
    expect(same).toEqual([])
  })

  test('shipped packs match the pin', () => {
    const root = path.join(import.meta.dir, '..', 'public', 'packs')
    const packs: { rel: string; pack: PinPack }[] = []
    for (const lang of readdirSync(root)) {
      for (const name of readdirSync(path.join(root, lang))) {
        if (!name.endsWith('.json')) continue
        const pack = JSON.parse(readFileSync(path.join(root, lang, name), 'utf8')) as PinPack
        packs.push({ rel: `${lang}/${name}`, pack })
      }
    }
    expect(collectPackPinErrors(packs, loadPackPin())).toEqual([])
  })

  test('the slot guard fails closed without a base or without packs', () => {
    const repo = path.join(import.meta.dir, '..')
    const env = { ...process.env }
    delete env.PACK_PIN_BASE
    const missing = spawnSync('bun', ['scripts/pack-pin.ts'], { cwd: repo, env, encoding: 'utf8' })
    expect(missing.status).toBe(1)
    expect(missing.stderr).toContain('PACK_PIN_BASE is required')

    const empty = spawnSync('git', ['hash-object', '-t', 'tree', '--stdin'], {
      cwd: repo,
      input: '',
      encoding: 'utf8',
    })
    expect(empty.status).toBe(0)
    const bare = spawnSync('bun', ['scripts/pack-pin.ts'], {
      cwd: repo,
      env: { ...process.env, PACK_PIN_BASE: empty.stdout.trim() },
      encoding: 'utf8',
    })
    expect(bare.status).toBe(1)
    expect(bare.stderr).toContain('has no public/packs')
  })
})
