/**
 * Pin every pack's lemma count to the ADR 0058 range [PIN_FLOOR, bandTarget]
 * (was: exactly 400), in slot order, with a version bump when content changes
 * (ADR 0006). Append-only growth passes the range and keeps slots; reorder or
 * removal still fails. CI checks out the PR head at depth 1, so the committed
 * pin cannot see a reorder by itself. `stableSlotErrors` diffs the head against
 * `PACK_PIN_BASE` and fails when a word that exists in both has changed index.
 * A same-slot replacement still passes. An empty base tree fails closed.
 */
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { nfcUpper } from './lemma-denylist'
import { bandTarget, PACK_TARGET_CAP, type SelectLang } from './pack-select'
import { isPackCefr, isPackLang, type PackCefr } from '../src/packs/schema'

/** Lower bound of the pin range guard for every pack (ADR 0058). */
export const PIN_FLOOR = 350

/** Range guard for one pack rel (`lang/cefr.json`); unknown shapes get the cap only. */
export function pinRange(rel: string): { floor: number; ceiling: number } {
  const posix = rel.split('\\').join('/')
  const [lang, file] = posix.split('/')
  const cefr = (file ?? '').replace(/\.json$/, '')
  if (lang && isPackLang(lang) && isPackCefr(cefr)) {
    return { floor: PIN_FLOOR, ceiling: bandTarget(lang as SelectLang, cefr as PackCefr) }
  }
  return { floor: PIN_FLOOR, ceiling: PACK_TARGET_CAP }
}

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
  const { floor, ceiling } = pinRange(rel)
  if (pack.lemmas.length < floor || pack.lemmas.length > ceiling) {
    errors.push(
      `${rel}: lemma count ${pack.lemmas.length} outside [${floor}, ${ceiling}] (ADR 0058 range guard)`,
    )
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
    errors.push(`${rel}: pack does not match pin (paste this entry into scripts/data/pack-pin.json: ${expected})`)
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

function repoRoot(): string {
  return path.join(import.meta.dir, '..')
}

function baseSlotPacks(rev: string): SlotPack[] {
  const cwd = repoRoot()
  const list = execFileSync('git', ['ls-tree', '-r', '--name-only', rev, 'public/packs'], {
    encoding: 'utf8',
    cwd,
  })
  const out: SlotPack[] = []
  for (const file of list.split('\n')) {
    if (!file.endsWith('.json')) continue
    const raw = execFileSync('git', ['show', `${rev}:${file}`], { encoding: 'utf8', cwd })
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
  if (rev.startsWith('-')) {
    console.error('PACK_PIN_BASE must not start with "-"')
    process.exit(1)
  }
  const base = baseSlotPacks(rev)
  if (base.length === 0) {
    console.error(`PACK_PIN_BASE ${rev} has no public/packs`)
    process.exit(1)
  }
  const root = path.join(repoRoot(), 'public', 'packs')
  const errors = stableSlotErrors(base, headSlotPacks(root))
  if (errors.length) {
    for (const e of errors) console.error(e)
    process.exit(1)
  }
}

if (import.meta.main) runSlotGuard()
