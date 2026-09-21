/**
 * Build-time Hunspell-like language membership for pack lemmas.
 * Loads dictionary-* only from ensureDicts() — never at import time so bun:test
 * can use tiny fixtures without pulling GPL/LGPL dicts into the test graph.
 *
 * Packs check keeps a committed verdict cache (scripts/data/hunspell-verdicts.json)
 * so CI does not construct nspell when every lookup is already known. The stamp
 * covers the bun.lock integrity of nspell and the dictionary packages, the
 * aff/dic bytes, this file, and lemma-denylist.ts (nfcUpper). Kinship and the
 * loanword allowlist are applied before the cache and are not stored in it.
 * Editing a stamped input invalidates the file; the next packs:check reloads
 * Hunspell once and rewrites it.
 */
import { createHash } from 'node:crypto'
import { readFileSync, renameSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import nspell from 'nspell'
import { nfcUpper } from './lemma-denylist'

export type MembershipLang = 'en' | 'de' | 'es' | 'pt'

export type SpellChecker = { correct(word: string): boolean }

type SpellMap = Record<MembershipLang, SpellChecker[]>

const ALLOW_FILE = path.join(import.meta.dir, 'data', 'loanword-allowlist.txt')
const TESTDATA = path.join(import.meta.dir, 'testdata')
const VERDICT_CACHE = path.join(import.meta.dir, 'data', 'hunspell-verdicts.json')
const LOCKFILE = path.join(import.meta.dir, '..', 'bun.lock')
const LFS_POINTER = 'version https://git-lfs.github.com/spec/v1'
const LOCK_PACKAGES = [
  'dictionary-de',
  'dictionary-en',
  'dictionary-es',
  'dictionary-pt',
  'dictionary-pt-pt',
  'nspell',
] as const
const DICT_PACKAGES = [
  'dictionary-de',
  'dictionary-en',
  'dictionary-es',
  'dictionary-pt',
  'dictionary-pt-pt',
] as const

/** English-only kinship tokens Hunspell still accepts in DE/ES/PT. Not FOR/COME/NO/ME/PARA. */
const ENGLISH_KINSHIP = new Set(
  ['DAD', 'MOM', 'DADDY', 'MOMMY', 'MUM', 'MUMMY'].map(nfcUpper),
)

type AllowLists = {
  all: Set<string>
  byLang: Record<MembershipLang, Set<string>>
}

let allowCache: AllowLists | null = null
let production: SpellMap | null = null
let fixtures: SpellMap | null = null
let entries: Map<string, boolean> | null = null
let activeStamp = ''
let dirty = false
let persistCache = false

/** Thrown when a verdict is missing and the Hunspell dictionaries are not loaded. */
export class MembershipDictsNeeded extends Error {
  constructor() {
    super('membership cache miss; Hunspell dictionaries are not loaded')
    this.name = 'MembershipDictsNeeded'
  }
}

export function membershipCacheKey(lang: MembershipLang, word: string): string {
  return `${lang}\0${word.normalize('NFC')}`
}

function lockIntegrityLines(): string {
  const text = readFileSync(LOCKFILE, 'utf8').replace(/\r\n/g, '\n')
  const lock = Bun.JSONC.parse(text) as {
    packages?: Record<string, unknown>
  }
  const packages = lock.packages ?? {}
  return LOCK_PACKAGES.map((name) => {
    const entry = packages[name]
    if (!Array.isArray(entry)) {
      throw new Error(`bun.lock has no package pin for ${name}`)
    }
    const spec = entry.find((part) => typeof part === 'string' && part.startsWith(`${name}@`))
    const integrity = entry.find(
      (part) => typeof part === 'string' && part.startsWith('sha512-'),
    )
    if (typeof spec !== 'string' || typeof integrity !== 'string') {
      throw new Error(`bun.lock pin for ${name} has no version or sha512`)
    }
    return `${spec} ${integrity}`
  }).join('\n')
}

function packageDir(pkg: string): string {
  const resolved = import.meta.resolve(pkg)
  const file = resolved.startsWith('file:') ? fileURLToPath(resolved) : resolved
  return path.dirname(file)
}

function hashText(h: ReturnType<typeof createHash>, file: string): void {
  h.update(readFileSync(file, 'utf8').replace(/\r\n/g, '\n'))
  h.update('\0')
}

/** Inputs that can change an isWordOfLang boolean, aside from the word itself. */
function membershipStamp(): string {
  const h = createHash('sha256')
  h.update('hunspell-verdicts-schema-1\n')
  h.update(lockIntegrityLines())
  h.update('\0')
  for (const pkg of DICT_PACKAGES) {
    const root = packageDir(pkg)
    h.update(readFileSync(path.join(root, 'index.aff')))
    h.update('\0')
    h.update(readFileSync(path.join(root, 'index.dic')))
    h.update('\0')
  }
  hashText(h, path.join(import.meta.dir, 'lang-membership.ts'))
  hashText(h, path.join(import.meta.dir, 'lemma-denylist.ts'))
  return h.digest('hex')
}

/** Load the committed verdict cache. A stamp mismatch discards every entry. */
export function loadMembershipCache(): void {
  persistCache = true
  activeStamp = membershipStamp()
  entries = new Map()
  dirty = false
  let text: string
  try {
    text = readFileSync(VERDICT_CACHE, 'utf8')
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return
    throw e
  }
  if (text.startsWith(LFS_POINTER)) {
    throw new Error(
      `${VERDICT_CACHE} is a Git LFS pointer. Commit the verdict JSON as a normal blob.`,
    )
  }
  let parsed: { schema?: unknown; stamp?: unknown; verdicts?: unknown }
  try {
    parsed = JSON.parse(text) as {
      schema?: unknown
      stamp?: unknown
      verdicts?: unknown
    }
  } catch {
    console.error(
      '::warning::hunspell-verdicts.json is unreadable — ignoring it',
    )
    return
  }
  if (parsed.schema !== 1 || parsed.stamp !== activeStamp) {
    console.error(
      '::warning::hunspell verdict cache stamp mismatch — dictionaries will be loaded',
    )
    return
  }
  if (!parsed.verdicts || typeof parsed.verdicts !== 'object') {
    throw new Error(`${VERDICT_CACHE}: verdicts must be an object`)
  }
  for (const [key, value] of Object.entries(
    parsed.verdicts as Record<string, unknown>,
  )) {
    if (typeof value !== 'boolean') {
      throw new Error(
        `${VERDICT_CACHE}: verdict for ${JSON.stringify(key)} is not a boolean`,
      )
    }
    entries.set(key, value)
  }
}

/** Write newly learned verdicts. A full cache hit does not touch the file. */
export function writeMembershipCache(): boolean {
  if (!persistCache || !entries || !dirty) return false
  const verdicts: Record<string, boolean> = {}
  for (const key of [...entries.keys()].sort()) {
    verdicts[key] = entries.get(key) as boolean
  }
  const body = `${JSON.stringify({ schema: 1, stamp: activeStamp, verdicts }, null, 2)}\n`
  let prev = ''
  try {
    prev = readFileSync(VERDICT_CACHE, 'utf8')
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e
  }
  if (prev === body) {
    dirty = false
    return false
  }
  const tmp = `${VERDICT_CACHE}.${process.pid}.tmp`
  writeFileSync(tmp, body)
  renameSync(tmp, VERDICT_CACHE)
  dirty = false
  return true
}

/** In-memory verdicts for tests. Never persisted. */
export function installMembershipCacheForTests(map: Map<string, boolean>): void {
  entries = map
  dirty = false
  persistCache = false
  activeStamp = 'test'
}

const LANG_TAG = new Set<MembershipLang>(['en', 'de', 'es', 'pt'])

export function loadLoanwordAllowlist(): AllowLists {
  if (allowCache) return allowCache
  const all = new Set<string>()
  const byLang: Record<MembershipLang, Set<string>> = {
    en: new Set(),
    de: new Set(),
    es: new Set(),
    pt: new Set(),
  }
  const text = readFileSync(ALLOW_FILE, 'utf8')
  for (const raw of text.split('\n')) {
    const line = raw.split('#')[0]?.trim()
    if (!line) continue
    const parts = line.split(/\s+/)
    if (parts.length !== 2) {
      throw new Error(
        `loanword-allowlist: expected "LANG WORD", got ${JSON.stringify(line)}`,
      )
    }
    const [tag, word] = parts
    const w = nfcUpper(word)
    if (tag === '*') {
      all.add(w)
      continue
    }
    if (!LANG_TAG.has(tag as MembershipLang)) {
      throw new Error(`loanword-allowlist: unknown lang ${JSON.stringify(tag)}`)
    }
    byLang[tag as MembershipLang].add(w)
  }
  allowCache = { all, byLang }
  return allowCache
}

export function isAllowlistedLemma(
  lang: MembershipLang,
  word: string,
): boolean {
  const w = nfcUpper(word)
  const lists = loadLoanwordAllowlist()
  return lists.all.has(w) || lists.byLang[lang].has(w)
}

function titleCase(word: string): string {
  if (!word) return word
  return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
}

function unique(words: string[]): string[] {
  return [...new Set(words.filter(Boolean))]
}

/** Case probes: original, lower, title, nfc-upper (ß kept), JS-upper (ß→SS). */
export function caseProbes(word: string): string[] {
  const nfc = word.normalize('NFC')
  const lower = nfc.toLowerCase()
  return unique([nfc, lower, titleCase(lower), nfcUpper(nfc), nfc.toUpperCase()])
}

/** DE ß ↔ ss/SS in addition to case probes (nspell does not implement CHECKSHARPS). */
export function membershipProbes(lang: MembershipLang, word: string): string[] {
  const base = caseProbes(word)
  if (lang !== 'de') return base
  const extra: string[] = []
  for (const w of base) {
    extra.push(w.replaceAll('ß', 'ss'), w.replaceAll('ß', 'SS'))
    extra.push(w.replace(/ss/gi, 'ß'))
  }
  return unique([...base, ...extra])
}

function anyCorrect(spell: SpellChecker, word: string, lang: MembershipLang): boolean {
  for (const p of membershipProbes(lang, word)) {
    if (spell.correct(p)) return true
  }
  return false
}

/** nspell does not implement German COMPOUNDBEGIN/MIDDLE/END — try 2-part splits. */
function deCompoundOk(spell: SpellChecker, word: string): boolean {
  for (const form of membershipProbes('de', word)) {
    const n = form.length
    if (n < 6) continue
    for (let i = 3; i <= n - 3; i++) {
      if (anyCorrect(spell, form.slice(0, i), 'de') && anyCorrect(spell, form.slice(i), 'de')) {
        return true
      }
    }
  }
  return false
}

export function dictsReady(): boolean {
  return !!(fixtures || production)
}

/** True after loadMembershipCache(). A miss then asks the caller to load dictionaries. */
export function membershipCacheArmed(): boolean {
  return entries !== null
}

function spellers(): SpellMap {
  const map = fixtures ?? production
  if (!map) {
    throw new Error('ensureDicts() or installFixtureSpellers() must run first')
  }
  return map
}

export function installFixtureSpellers(map: SpellMap): void {
  fixtures = map
}

export function installFixtureSpellersFromDir(dir = TESTDATA): void {
  const load = (name: string): SpellChecker =>
    nspell(
      readFileSync(path.join(dir, `${name}.aff`)),
      readFileSync(path.join(dir, `${name}.dic`)),
    )
  fixtures = {
    en: [load('en')],
    de: [load('de')],
    es: [load('es')],
    pt: [load('pt-pt'), load('pt-br')],
  }
}

type DictModule = { default: { aff: Uint8Array; dic: Uint8Array } }

async function loadProduction(): Promise<SpellMap> {
  const [en, de, es, ptBr, ptPt] = await Promise.all([
    import('dictionary-en') as Promise<DictModule>,
    import('dictionary-de') as Promise<DictModule>,
    import('dictionary-es') as Promise<DictModule>,
    import('dictionary-pt') as Promise<DictModule>,
    import('dictionary-pt-pt') as Promise<DictModule>,
  ])
  return {
    en: [nspell(en.default)],
    de: [nspell(de.default)],
    es: [nspell(es.default)],
    pt: [nspell(ptPt.default), nspell(ptBr.default)],
  }
}

/** Load Hunspell dictionaries from node_modules (build/check only). */
export async function ensureDicts(): Promise<void> {
  if (fixtures || production) return
  production = await loadProduction()
}

function spellLookup(lang: MembershipLang, word: string): boolean {
  for (const spell of spellers()[lang]) {
    if (anyCorrect(spell, word, lang)) return true
    if (lang === 'de' && deCompoundOk(spell, word)) return true
  }
  return false
}

/** Clear process-global spellers so bun:test files cannot leak fixture dicts. */
export function resetDicts(): void {
  fixtures = null
  production = null
  entries = null
  activeStamp = ''
  dirty = false
  persistCache = false
}

export function isWordOfLang(lang: MembershipLang, word: string): boolean {
  const w = nfcUpper(word)
  if (!w) return false
  if (lang !== 'en' && ENGLISH_KINSHIP.has(w)) return false
  if (isAllowlistedLemma(lang, w)) return true
  // Fixture dicts are the test oracle. Never read or fill the production cache.
  if (fixtures) return spellLookup(lang, word)

  const key = membershipCacheKey(lang, word)
  if (entries) {
    const hit = entries.get(key)
    if (hit !== undefined) return hit
    // A miss is not a pass. The caller loads dictionaries and retries.
    if (!production) throw new MembershipDictsNeeded()
  }

  const result = spellLookup(lang, word)
  if (entries) {
    entries.set(key, result)
    dirty = true
  }
  return result
}
