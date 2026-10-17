/**
 * Pin every pack at 400 lemmas, in slot order, with a version bump when
 * content changes (ADR 0006). CI checks out the PR head at depth 1, so the
 * committed pin is the base this guard diffs against.
 */
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import path from 'node:path'

export const PACK_LEMMA_COUNT = 400

export type PackPinEntry = {
  version: number
  /** SHA-256 of lemma words joined by newlines, in array order. */
  order: string
  /** SHA-256 of the pack JSON with `version` removed. */
  body: string
}

export type PackPinFile = Record<string, PackPinEntry>

export type PinPack = {
  version: number
  lemmas: readonly { word: string }[]
}

export function packOrderHash(words: readonly string[]): string {
  return createHash('sha256').update(words.join('\n')).digest('hex')
}

/** Key order follows the parsed pack, so a reorder of fields is a content change. */
export function packBodyHash(pack: object): string {
  const body: Record<string, unknown> = {}
  for (const key of Object.keys(pack)) {
    if (key === 'version') continue
    body[key] = (pack as Record<string, unknown>)[key]
  }
  return createHash('sha256').update(JSON.stringify(body)).digest('hex')
}

export function packPinEntry(pack: PinPack & object): PackPinEntry {
  return {
    version: pack.version,
    order: packOrderHash(pack.lemmas.map((l) => l.word)),
    body: packBodyHash(pack),
  }
}

export function packPinErrors(rel: string, pack: PinPack & object, pin: PackPinEntry | undefined): string[] {
  const errors: string[] = []
  if (pack.lemmas.length !== PACK_LEMMA_COUNT) {
    errors.push(`${rel}: expected 400 lemmas, found ${pack.lemmas.length}`)
  }
  if (!pin) {
    errors.push(`${rel}: missing pack pin`)
    return errors
  }
  const order = packOrderHash(pack.lemmas.map((l) => l.word))
  if (order !== pin.order) errors.push(`${rel}: slot order does not match pin`)
  const body = packBodyHash(pack)
  if (body !== pin.body && pack.version === pin.version) {
    errors.push(`${rel}: content changed but version was not bumped`)
  } else if (body !== pin.body || pack.version !== pin.version) {
    errors.push(`${rel}: pack does not match pin (update scripts/data/pack-pin.json)`)
  }
  return errors
}

export function collectPackPinErrors(
  packs: readonly { rel: string; pack: PinPack & object }[],
  pin: PackPinFile,
): string[] {
  const errors: string[] = []
  const seen = new Set<string>()
  for (const { rel, pack } of packs) {
    seen.add(rel)
    errors.push(...packPinErrors(rel, pack, pin[rel]))
  }
  for (const rel of Object.keys(pin)) {
    if (!seen.has(rel)) errors.push(`${rel}: pin entry has no pack`)
  }
  return errors
}

export function loadPackPin(
  file = path.join(import.meta.dir, 'data', 'pack-pin.json'),
): PackPinFile {
  return JSON.parse(readFileSync(file, 'utf8')) as PackPinFile
}
