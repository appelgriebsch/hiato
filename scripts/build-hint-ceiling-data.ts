#!/usr/bin/env bun
/**
 * Person-run only. Writes scripts/data/en-easiest-cefr.json and hint-stem-cache.json.
 * Do NOT call from packs:check, bun run build, or CI.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { Database } from 'bun:sqlite'
import { nfcUpper } from './lemma-denylist'
import { foldKey, hangmanOk, type SelectLang } from './pack-select'
import {
  computeHintCeilingStamp,
  fingerprintWordhoardDb,
  EN_EASIEST_CEFR_PATH,
  HINT_CEILING_SCHEMA,
  HINT_STEM_CACHE_PATH,
  type StemLang,
} from './hint-ceiling-data'
import { CEFR_RANK } from './hint-ceiling'

const DATA = path.join(import.meta.dir, 'data')
const CEFRJ_PATH = path.join(DATA, 'cefrj-en-with-b2.json')
const OCTANOVE_PATH = path.join(DATA, 'octanove-vocabulary-profile-c1c2-1.0.csv')
const WORDHOARD_DB = path.join(DATA, 'wordhoard-v0.1.0.db')

const CONTENT_POS_EN = /^(noun|verb|adjective|adverb)$/i

const DICT_FOR_LANG: Record<StemLang, string[]> = {
  en: ['dictionary-en'],
  de: ['dictionary-de'],
  es: ['dictionary-es'],
  pt: ['dictionary-pt', 'dictionary-pt-pt'],
}

function packageDir(pkg: string): string {
  const resolved = import.meta.resolve(pkg)
  const file = resolved.startsWith('file:') ? fileURLToPath(resolved) : resolved
  return path.dirname(file)
}

function minBand(a: string | undefined, b: string): string {
  if (!a) return b
  return (CEFR_RANK[b] ?? 99) < (CEFR_RANK[a] ?? 99) ? b : a
}

function buildEnEasiest(): Record<string, string> {
  if (!existsSync(CEFRJ_PATH)) {
    throw new Error(`Missing ${CEFRJ_PATH} — download CEFR-J first (see expand-packs)`)
  }
  if (!existsSync(OCTANOVE_PATH)) {
    throw new Error(`Missing ${OCTANOVE_PATH}`)
  }
  const tags: Record<string, string> = {}
  const cefrj = JSON.parse(readFileSync(CEFRJ_PATH, 'utf8')) as Record<string, string[]>
  for (const [level, words] of Object.entries(cefrj)) {
    const band = level.toLowerCase()
    if (!(band in CEFR_RANK)) continue
    for (const w of words) {
      const key = foldKey('en', w)
      if (!key) continue
      tags[key] = minBand(tags[key], band)
    }
  }
  const csv = readFileSync(OCTANOVE_PATH, 'utf8')
  for (const line of csv.trim().split('\n').slice(1)) {
    const [head, pos, cefrRaw] = line.split(',')
    const cefr = (cefrRaw || '').trim().toLowerCase()
    if (cefr !== 'c1' && cefr !== 'c2') continue
    if (!CONTENT_POS_EN.test(pos || '')) continue
    const w = hangmanOk('en', (head || '').split('/')[0]?.trim() || '')
    if (!w) continue
    const key = foldKey('en', w)
    tags[key] = minBand(tags[key], cefr)
  }
  return tags
}

type AffRule = {
  flag: string
  strip: string
  add: string
  /** simplified condition: '.' = any; otherwise last char must be in set or match class */
  cond: string
  cross: boolean
}

type AffixTable = {
  flagType: 'short' | 'long' | 'num' | 'UTF-8'
  sfx: Map<string, AffRule[]>
  pfx: Map<string, AffRule[]>
}

function parseAff(affText: string): AffixTable {
  const lines = affText.replace(/\r\n/g, '\n').split('\n')
  let flagType: AffixTable['flagType'] = 'short'
  const sfx = new Map<string, AffRule[]>()
  const pfx = new Map<string, AffRule[]>()
  let i = 0
  while (i < lines.length) {
    const line = lines[i]!.trim()
    i++
    if (!line || line.startsWith('#')) continue
    const parts = line.split(/\s+/)
    if (parts[0] === 'FLAG') {
      const t = (parts[1] || '').toLowerCase()
      if (t === 'long') flagType = 'long'
      else if (t === 'num') flagType = 'num'
      else if (t === 'utf-8' || t === 'utf8') flagType = 'UTF-8'
      continue
    }
    if (parts[0] !== 'SFX' && parts[0] !== 'PFX') continue
    const kind = parts[0] as 'SFX' | 'PFX'
    const flag = parts[1] || ''
    const cross = (parts[2] || 'N').toUpperCase().startsWith('Y')
    const count = Number(parts[3] || 0)
    const rules: AffRule[] = []
    for (let n = 0; n < count && i < lines.length; n++) {
      const rl = lines[i]!.trim()
      i++
      if (!rl || rl.startsWith('#')) {
        n--
        continue
      }
      const rp = rl.split(/\s+/)
      if (rp[0] !== kind || rp[1] !== flag) {
        // header drift — still try to parse as rule line
      }
      const strip = rp[2] === '0' ? '' : rp[2] || ''
      const add = (rp[3] || '').split('/')[0] || ''
      const cond = rp[4] || '.'
      rules.push({ flag, strip, add, cond, cross })
    }
    const map = kind === 'SFX' ? sfx : pfx
    map.set(flag, [...(map.get(flag) ?? []), ...rules])
  }
  return { flagType, sfx, pfx }
}

function splitFlags(flagField: string, flagType: AffixTable['flagType']): string[] {
  if (!flagField) return []
  if (flagType === 'long') {
    const out: string[] = []
    for (let i = 0; i < flagField.length; i += 2) out.push(flagField.slice(i, i + 2))
    return out
  }
  if (flagType === 'num') return flagField.split(',').map((s) => s.trim()).filter(Boolean)
  // short / UTF-8: one code unit per flag
  return [...flagField]
}

function condMatches(word: string, cond: string): boolean {
  if (!cond || cond === '.') return true
  // Hunspell conditions are regex-like on the end (SFX) / start (PFX).
  // Support simple forms: literal chars, [^...], [aeiou], .
  try {
    const re = new RegExp(`${cond}$`, 'u')
    return re.test(word)
  } catch {
    return word.endsWith(cond.replace(/[\[\]^]/g, ''))
  }
}

function condMatchesPrefix(word: string, cond: string): boolean {
  if (!cond || cond === '.') return true
  try {
    const re = new RegExp(`^${cond}`, 'u')
    return re.test(word)
  } catch {
    return word.startsWith(cond.replace(/[\[\]^]/g, ''))
  }
}

function applySuffix(word: string, rule: AffRule): string | null {
  if (!condMatches(word, rule.cond)) return null
  if (rule.strip) {
    if (!word.endsWith(rule.strip)) return null
    word = word.slice(0, -rule.strip.length)
  }
  return word + rule.add
}

function applyPrefix(word: string, rule: AffRule): string | null {
  if (!condMatchesPrefix(word, rule.cond)) return null
  if (rule.strip) {
    if (!word.startsWith(rule.strip)) return null
    word = word.slice(rule.strip.length)
  }
  return rule.add + word
}

/** Pack + English tag lemmas we care about stemming. */
function collectTargetLemmas(lang: StemLang): Set<string> {
  const out = new Set<string>()
  const packsRoot = path.join(import.meta.dir, '..', 'public', 'packs', lang)
  for (const cefr of ['a1', 'a2', 'b1', 'b2', 'c1', 'c2']) {
    const file = path.join(packsRoot, `${cefr}.json`)
    if (!existsSync(file)) continue
    const pack = JSON.parse(readFileSync(file, 'utf8')) as {
      lemmas: { word: string }[]
    }
    for (const L of pack.lemmas) {
      out.add(foldKey(lang as SelectLang, L.word))
    }
  }
  return out
}

/**
 * Affix-replay only for target lemmas (pack words), not the whole .dic.
 * Builds form → lemma for regular affixed surfaces of those lemmas.
 */
function replayAffixes(
  lang: StemLang,
  into: Map<string, Set<string>>,
  targets: Set<string>,
): void {
  for (const pkg of DICT_FOR_LANG[lang]) {
    const root = packageDir(pkg)
    const aff = parseAff(readFileSync(path.join(root, 'index.aff'), 'utf8'))
    const dicLines = readFileSync(path.join(root, 'index.dic'), 'utf8')
      .replace(/\r\n/g, '\n')
      .split('\n')
    for (const line of dicLines.slice(1)) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) continue
      const slash = trimmed.indexOf('/')
      const morph = trimmed.indexOf(' ')
      let head: string
      let flagField = ''
      if (slash >= 0) {
        head = trimmed.slice(0, slash)
        const rest = trimmed.slice(slash + 1)
        flagField = morph > slash ? rest.slice(0, morph - slash - 1) : rest.split(/\s+/)[0] || ''
      } else {
        head = morph >= 0 ? trimmed.slice(0, morph) : trimmed
      }
      if (!head || /\d/.test(head)) continue
      if (head.length > 20) continue
      const lemmaFold = foldKey(lang as SelectLang, nfcUpper(head))
      if (!targets.has(lemmaFold)) continue
      const addForm = (form: string) => {
        if (!form || form.length < 3 || form.length > 20) return
        if (/\d/.test(form)) return
        const fk = foldKey(lang as SelectLang, nfcUpper(form))
        if (fk === lemmaFold) return
        let set = into.get(fk)
        if (!set) {
          set = new Set()
          into.set(fk, set)
        }
        set.add(lemmaFold)
      }
      const flags = splitFlags(flagField, aff.flagType)
      for (const flag of flags) {
        for (const rule of aff.sfx.get(flag) ?? []) {
          const form = applySuffix(head, rule)
          if (form) addForm(form)
        }
        for (const rule of aff.pfx.get(flag) ?? []) {
          const form = applyPrefix(head, rule)
          if (form) addForm(form)
        }
      }
    }
  }
}

function loadWordhoardStems(
  lang: 'en' | 'de' | 'es',
  into: Map<string, Set<string>>,
  targets: Set<string>,
): void {
  if (!existsSync(WORDHOARD_DB)) {
    throw new Error(`Missing ${WORDHOARD_DB}`)
  }
  const db = new Database(WORDHOARD_DB, { readonly: true })
  try {
    const rows = db
      .query(
        `SELECT wf.form AS form, w.lemma AS lemma
         FROM word_form wf
         JOIN word w ON w.id = wf.word_id
         WHERE w.lang = ?`,
      )
      .all(lang) as { form: string; lemma: string }[]
    for (const row of rows) {
      if (!row.form || !row.lemma) continue
      if (row.form.length < 3 || row.form.length > 20) continue
      const formK = foldKey(lang, nfcUpper(row.form))
      const lemmaK = foldKey(lang, nfcUpper(row.lemma))
      if (!formK || !lemmaK || formK === lemmaK) continue
      if (!targets.has(lemmaK)) continue
      let set = into.get(formK)
      if (!set) {
        set = new Set()
        into.set(formK, set)
      }
      set.add(lemmaK)
    }
  } finally {
    db.close()
  }
}

function mapToRecord(m: Map<string, Set<string>>): Record<string, string[]> {
  const out: Record<string, string[]> = {}
  const keys = [...m.keys()].sort()
  for (const k of keys) {
    const lemmas = [...(m.get(k) ?? [])].sort()
    if (lemmas.length) out[k] = lemmas
  }
  return out
}

function main(): void {
  mkdirSync(DATA, { recursive: true })
  const wordhoard = fingerprintWordhoardDb()
  const stamp = computeHintCeilingStamp(wordhoard)
  console.log('stamp', stamp.slice(0, 16) + '…', 'wordhoard', wordhoard.size)

  const tags = buildEnEasiest()
  const tagKeys = Object.keys(tags).sort()
  const tagsSorted: Record<string, string> = {}
  for (const k of tagKeys) tagsSorted[k] = tags[k]!
  writeFileSync(
    EN_EASIEST_CEFR_PATH,
    JSON.stringify({ schema: HINT_CEILING_SCHEMA, stamp, wordhoard, tags: tagsSorted }, null, 2) + '\n',
  )
  console.log(`wrote ${EN_EASIEST_CEFR_PATH} (${tagKeys.length} tags)`)

  const stems: Record<StemLang, Record<string, string[]>> = {
    en: {},
    de: {},
    es: {},
    pt: {},
  }
  for (const lang of ['en', 'de', 'es', 'pt'] as const) {
    const targets = collectTargetLemmas(lang)
    // English: also stem CEFR-J/Octanove headwords so tag surfaces fold.
    if (lang === 'en') {
      for (const k of Object.keys(tagsSorted)) targets.add(k)
    }
    console.log(`${lang}: ${targets.size} target lemmas`)
    const into = new Map<string, Set<string>>()
    if (lang === 'en' || lang === 'de' || lang === 'es') {
      console.log(`wordhoard stems ${lang}…`)
      loadWordhoardStems(lang, into, targets)
    }
    console.log(`affix replay ${lang}…`)
    replayAffixes(lang, into, targets)
    stems[lang] = mapToRecord(into)
    console.log(`  ${lang}: ${Object.keys(stems[lang]).length} forms`)
  }

  writeFileSync(
    HINT_STEM_CACHE_PATH,
    JSON.stringify({ schema: HINT_CEILING_SCHEMA, stamp, wordhoard, stems }, null, 2) + '\n',
  )
  console.log(`wrote ${HINT_STEM_CACHE_PATH}`)
  const check = computeHintCeilingStamp(wordhoard)
  if (check !== stamp) {
    throw new Error('stamp drifted during build')
  }
}

main()
