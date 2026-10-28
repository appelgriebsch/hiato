/**
 * Pin every pack at 400 lemmas, in slot order, with a version bump when
 * content changes (ADR 0006). CI checks out the PR head at depth 1, so the
 * committed pin cannot see a reorder by itself. `stableSlotErrors` diffs
 * the head against the PR base ref and fails when a word that exists in
 * both has changed index. A same-slot replacement still passes.
 */
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { nfcUpper } from './lemma-denylist'

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
    const expected = JSON.stringify({ [rel]: packPinEntry(pack) })
    errors.push(`${rel}: pack does not match pin (update scripts/data/pack-pin.json to ${expected})`)
  }
  return errors
}

export type SlotPack = {
  rel: string
  words: readonly string[]
}

/** Fail when a word present on both sides sits at a different index. */
export function stableSlotErrors(base: readonly SlotPack[], head: readonly SlotPack[]): string[] {
  const errors: string[] = []
  const baseByRel = new Map(base.map((p) => [p.rel, p.words]))
  for (const pack of head) {
    const prev = baseByRel.get(pack.rel)
    if (!prev) continue
    const prevAt = new Map<string, number>()
    prev.forEach((word, i) => {
      const key = nfcUpper(word)
      if (!prevAt.has(key)) prevAt.set(key, i)
    })
    pack.words.forEach((word, i) => {
      const key = nfcUpper(word)
      const from = prevAt.get(key)
      if (from === undefined || from === i) return
      errors.push(`${pack.rel}: "${key}" moved from slot ${from} to slot ${i}`)
    })
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

function wordsOf(raw: string): string[] {
  const pack = JSON.parse(raw) as { lemmas?: { word?: string }[] }
  return (pack.lemmas ?? []).map((l) => nfcUpper(String(l.word ?? '')))
}

function headSlotPacks(root: string): SlotPack[] {
  const out: SlotPack[] = []
  for (const lang of readdirSync(root)) {
    const dir = path.join(root, lang)
    for (const name of readdirSync(dir)) {
      if (!name.endsWith('.json')) continue
      out.push({
        rel: `${lang}/${name}`,
        words: wordsOf(readFileSync(path.join(dir, name), 'utf8')),
      })
    }
  }
  return out
}

function baseSlotPacks(rev: string): SlotPack[] {
  const list = execFileSync('git', ['ls-tree', '-r', '--name-only', rev, 'public/packs'], {
    encoding: 'utf8',
  })
  const out: SlotPack[] = []
  for (const file of list.split('\n')) {
    if (!file.endsWith('.json')) continue
    const raw = execFileSync('git', ['show', `${rev}:${file}`], { encoding: 'utf8' })
    out.push({ rel: file.slice('public/packs/'.length), words: wordsOf(raw) })
  }
  return out
}

function runSlotGuard(): void {
  const rev = process.env.PACK_PIN_BASE
  if (!rev) {
    console.error('PACK_PIN_BASE is required (git rev of the PR base)')
    process.exit(1)
  }
  const root = path.join(import.meta.dir, '..', 'public', 'packs')
  const errors = stableSlotErrors(baseSlotPacks(rev), headSlotPacks(root))
  if (errors.length) {
    for (const e of errors) console.error(e)
    process.exit(1)
  }
}

const isDirect =
  process.argv[1] !== undefined &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isDirect) runSlotGuard()
