/**
 * Committed hint-ceiling caches. packs:check only READs these.
 * Missing file or stamp mismatch → throw (fail closed). Never rewrite; never ensureDicts.
 *
 * Stamp covers dictionary package bytes (always in node_modules) plus a wordhoard
 * size/hash fingerprint. At build time the fingerprint is taken from the local DB;
 * it is embedded in the JSON so CI (without the gitignored DB) can still verify.
 */
import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export const HINT_CEILING_SCHEMA = 1

export const EN_EASIEST_CEFR_PATH = path.join(
  import.meta.dir,
  'data',
  'en-easiest-cefr.json',
)
export const HINT_STEM_CACHE_PATH = path.join(
  import.meta.dir,
  'data',
  'hint-stem-cache.json',
)

export const WORDHOARD_DB_PATH = path.join(
  import.meta.dir,
  'data',
  'wordhoard-v0.1.0.db',
)
const LOCKFILE = path.join(import.meta.dir, '..', 'bun.lock')

const LOCK_PACKAGES = [
  'dictionary-de',
  'dictionary-en',
  'dictionary-es',
  'dictionary-pt',
  'dictionary-pt-pt',
  'nspell',
] as const

export type StemLang = 'en' | 'de' | 'es' | 'pt'

export type WordhoardFingerprint = {
  size: number
  sha256: string
}

function packageDir(pkg: string): string {
  const resolved = import.meta.resolve(pkg)
  const file = resolved.startsWith('file:') ? fileURLToPath(resolved) : resolved
  return path.dirname(file)
}

function lockIntegrityLines(): string {
  const text = readFileSync(LOCKFILE, 'utf8').replace(/\r\n/g, '\n')
  const lock = Bun.JSONC.parse(text) as {
    packages?: Record<string, unknown[]>
  }
  const packages = lock.packages ?? {}
  return LOCK_PACKAGES.map((name) => {
    const entry = packages[name]
    if (!Array.isArray(entry)) {
      throw new Error(`bun.lock missing package ${name}`)
    }
    const spec = entry[0]
    const integrity = entry.find(
      (part) => typeof part === 'string' && part.startsWith('sha512-'),
    )
    if (typeof spec !== 'string' || typeof integrity !== 'string') {
      throw new Error(`bun.lock pin for ${name} has no version or sha512`)
    }
    return `${spec} ${integrity}`
  }).join('\n')
}

const DICTS = [
  'dictionary-de',
  'dictionary-en',
  'dictionary-es',
  'dictionary-pt',
  'dictionary-pt-pt',
] as const

/** Fingerprint local wordhoard DB (build-time). */
export function fingerprintWordhoardDb(): WordhoardFingerprint {
  if (!existsSync(WORDHOARD_DB_PATH)) {
    throw new Error(`Missing ${WORDHOARD_DB_PATH}`)
  }
  const buf = readFileSync(WORDHOARD_DB_PATH)
  return {
    size: buf.byteLength,
    sha256: createHash('sha256').update(buf).digest('hex'),
  }
}

/**
 * Stamp = dict package bytes + wordhoard size/hash.
 * Pass the fingerprint embedded in the committed JSON when the DB is absent (CI).
 */
export function computeHintCeilingStamp(wordhoard: WordhoardFingerprint): string {
  const h = createHash('sha256')
  h.update('hint-ceiling-schema-1\n')
  h.update(lockIntegrityLines())
  h.update('\0')
  for (const pkg of DICTS) {
    const root = packageDir(pkg)
    h.update(readFileSync(path.join(root, 'index.aff')))
    h.update('\0')
    h.update(readFileSync(path.join(root, 'index.dic')))
    h.update('\0')
  }
  h.update(`wordhoard:${wordhoard.size}:${wordhoard.sha256}`)
  h.update('\0')
  return h.digest('hex')
}

type EnFile = {
  schema?: unknown
  stamp?: unknown
  wordhoard?: WordhoardFingerprint
  tags?: unknown
}

type StemFile = {
  schema?: unknown
  stamp?: unknown
  wordhoard?: WordhoardFingerprint
  stems?: unknown
}

function readWordhoardMeta(parsed: {
  wordhoard?: WordhoardFingerprint
}): WordhoardFingerprint {
  const w = parsed.wordhoard
  if (
    !w ||
    typeof w.size !== 'number' ||
    typeof w.sha256 !== 'string' ||
    !w.sha256
  ) {
    throw new Error('hint-ceiling cache missing wordhoard fingerprint')
  }
  return { size: w.size, sha256: w.sha256 }
}

function assertStamp(
  file: string,
  schema: unknown,
  stamp: unknown,
  wordhoard: WordhoardFingerprint,
): void {
  const want = computeHintCeilingStamp(wordhoard)
  if (schema !== HINT_CEILING_SCHEMA) {
    throw new Error(
      `${file}: schema ${String(schema)} != ${HINT_CEILING_SCHEMA} (rebuild with bun run scripts/build-hint-ceiling-data.ts)`,
    )
  }
  if (stamp !== want) {
    throw new Error(
      `${file}: stamp mismatch (rebuild with bun run scripts/build-hint-ceiling-data.ts)`,
    )
  }
}

/** Fail closed if missing or stamp mismatch. */
export function loadEnEasiestCefr(): Map<string, string> {
  if (!existsSync(EN_EASIEST_CEFR_PATH)) {
    throw new Error(
      `missing ${EN_EASIEST_CEFR_PATH} — run bun run scripts/build-hint-ceiling-data.ts`,
    )
  }
  const parsed = JSON.parse(readFileSync(EN_EASIEST_CEFR_PATH, 'utf8')) as EnFile
  const wh = readWordhoardMeta(parsed)
  assertStamp(EN_EASIEST_CEFR_PATH, parsed.schema, parsed.stamp, wh)
  if (!parsed.tags || typeof parsed.tags !== 'object') {
    throw new Error(`${EN_EASIEST_CEFR_PATH}: tags must be an object`)
  }
  const out = new Map<string, string>()
  for (const [k, v] of Object.entries(parsed.tags as Record<string, unknown>)) {
    if (typeof v !== 'string') {
      throw new Error(`${EN_EASIEST_CEFR_PATH}: tag for ${k} is not a string`)
    }
    out.set(k, v.toLowerCase())
  }
  return out
}

/** Fail closed if missing or stamp mismatch. */
export function loadHintStemCache(): Record<StemLang, Map<string, string[]>> {
  if (!existsSync(HINT_STEM_CACHE_PATH)) {
    throw new Error(
      `missing ${HINT_STEM_CACHE_PATH} — run bun run scripts/build-hint-ceiling-data.ts`,
    )
  }
  const parsed = JSON.parse(readFileSync(HINT_STEM_CACHE_PATH, 'utf8')) as StemFile
  const wh = readWordhoardMeta(parsed)
  assertStamp(HINT_STEM_CACHE_PATH, parsed.schema, parsed.stamp, wh)
  if (!parsed.stems || typeof parsed.stems !== 'object') {
    throw new Error(`${HINT_STEM_CACHE_PATH}: stems must be an object`)
  }
  const empty = (): Map<string, string[]> => new Map()
  const out: Record<StemLang, Map<string, string[]>> = {
    en: empty(),
    de: empty(),
    es: empty(),
    pt: empty(),
  }
  for (const lang of ['en', 'de', 'es', 'pt'] as const) {
    const block = (parsed.stems as Record<string, unknown>)[lang]
    if (!block || typeof block !== 'object') continue
    for (const [form, lemmas] of Object.entries(
      block as Record<string, unknown>,
    )) {
      if (!Array.isArray(lemmas)) continue
      const list = lemmas.filter((x): x is string => typeof x === 'string')
      if (list.length) out[lang].set(form, list)
    }
  }
  return out
}
