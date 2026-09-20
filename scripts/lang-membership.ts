/**
 * Build-time Hunspell-like language membership for pack lemmas.
 * Loads dictionary-* only from ensureDicts() — never at import time so bun:test
 * can use tiny fixtures without pulling GPL/LGPL dicts into the test graph.
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import nspell from 'nspell'
import { nfcUpper } from './lemma-denylist'

export type MembershipLang = 'en' | 'de' | 'es' | 'pt'

export type SpellChecker = { correct(word: string): boolean }

type SpellMap = Record<MembershipLang, SpellChecker[]>

const ALLOW_FILE = path.join(import.meta.dir, 'data', 'loanword-allowlist.txt')
const TESTDATA = path.join(import.meta.dir, 'testdata')

/** English-only kinship tokens Hunspell still accepts in DE/ES/PT. Not FOR/COME/NO/ME/PARA. */
const ENGLISH_KINSHIP = new Set(
  ['DAD', 'MOM', 'DADDY', 'MOMMY', 'MUM', 'MUMMY'].map(nfcUpper),
)

let allowCache: Set<string> | null = null
let production: SpellMap | null = null
let fixtures: SpellMap | null = null

export function loadLoanwordAllowlist(): Set<string> {
  if (allowCache) return allowCache
  const set = new Set<string>()
  const text = readFileSync(ALLOW_FILE, 'utf8')
  for (const line of text.split('\n')) {
    const w = line.split('#')[0]?.trim()
    if (!w) continue
    set.add(nfcUpper(w))
  }
  allowCache = set
  return set
}

export function isAllowlistedLemma(word: string): boolean {
  return loadLoanwordAllowlist().has(nfcUpper(word))
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

export function isWordOfLang(lang: MembershipLang, word: string): boolean {
  const w = nfcUpper(word)
  if (!w) return false
  if (lang !== 'en' && ENGLISH_KINSHIP.has(w)) return false
  if (isAllowlistedLemma(w)) return true
  for (const spell of spellers()[lang]) {
    if (anyCorrect(spell, word, lang)) return true
    if (lang === 'de' && deCompoundOk(spell, word)) return true
  }
  return false
}
