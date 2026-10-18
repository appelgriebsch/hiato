import { describe, expect, test } from 'bun:test'
import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import {
  collectPackPinErrors,
  loadPackPin,
  packPinEntry,
  packPinErrors,
  type PinPack,
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
    expect(bumped.some((e) => e.includes('does not match pin'))).toBe(true)
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
})
