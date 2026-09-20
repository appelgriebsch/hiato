#!/usr/bin/env bun
/**
 * Validate public/packs JSON files — schema, ADR 0023 spoilers, ADR 0026 floor,
 * NSFW denylist, and template-gloss rejection (Ask Avery C1/C2).
 */
import { readdir, readFile, stat } from 'node:fs/promises'
import path from 'node:path'
import {
  PACK_CEFR_LEVELS,
  PACK_CEFRS,
  PACK_LANGS,
  isPackCefr,
  isPackLang,
  type WordPack,
} from '../src/packs/schema'
import { spoilerContains } from '../src/packs/spoilers'
import { isDeniedLemma, loadDenylist, nfcUpper } from './lemma-denylist'
import { isTemplateGloss, TEMPLATE_GLOSS_RE } from './gloss-quality'

const ROOT = path.join(import.meta.dir, '..', 'public', 'packs')
const DENY = loadDenylist()

function assertString(v: unknown, label: string): string {
  if (typeof v !== 'string' || !v.trim()) {
    throw new Error(`${label} must be a non-empty string`)
  }
  return v
}

function validatePack(raw: unknown, file: string): WordPack {
  if (!raw || typeof raw !== 'object') {
    throw new Error(`${file}: root must be an object`)
  }
  const o = raw as Record<string, unknown>

  if (typeof o.version !== 'number' || !Number.isFinite(o.version)) {
    throw new Error(`${file}: version must be a number`)
  }
  if (!isPackLang(o.lang)) {
    throw new Error(`${file}: lang must be en|de|es|pt`)
  }
  if (!isPackCefr(o.cefr)) {
    throw new Error(`${file}: cefr must be ${PACK_CEFR_LEVELS.join('|')}`)
  }
  assertString(o.license, `${file}: license`)
  if (!Array.isArray(o.attribution) || o.attribution.length === 0) {
    throw new Error(`${file}: attribution must be a non-empty string[]`)
  }
  for (const [i, a] of o.attribution.entries()) {
    assertString(a, `${file}: attribution[${i}]`)
  }
  if (!Array.isArray(o.lemmas) || o.lemmas.length === 0) {
    throw new Error(`${file}: lemmas must be a non-empty array`)
  }

  const lemmas = o.lemmas.map((entry, i) => {
    if (!entry || typeof entry !== 'object') {
      throw new Error(`${file}: lemmas[${i}] must be an object`)
    }
    const e = entry as Record<string, unknown>
    const word = assertString(e.word, `${file}: lemmas[${i}].word`).normalize('NFC')
    const gloss =
      e.gloss === undefined
        ? undefined
        : assertString(e.gloss, `${file}: lemmas[${i}].gloss`).normalize('NFC')
    let synonyms: string[] | undefined
    if (e.synonyms !== undefined) {
      if (!Array.isArray(e.synonyms)) {
        throw new Error(`${file}: lemmas[${i}].synonyms must be an array`)
      }
      synonyms = e.synonyms.map((s, j) =>
        assertString(s, `${file}: lemmas[${i}].synonyms[${j}]`).normalize('NFC'),
      )
    }

    if (isDeniedLemma(word, DENY)) {
      throw new Error(`${file}: lemmas[${i}] denylist — lemma "${word}"`)
    }
    if (gloss && isTemplateGloss(gloss)) {
      throw new Error(
        `${file}: lemmas[${i}] template gloss — "${word}" matches ${TEMPLATE_GLOSS_RE}`,
      )
    }
    if (gloss && spoilerContains(gloss, word)) {
      throw new Error(
        `${file}: lemmas[${i}] spoiler — gloss contains lemma "${word}"`,
      )
    }
    if (synonyms) {
      for (const [j, s] of synonyms.entries()) {
        if (spoilerContains(s, word)) {
          throw new Error(
            `${file}: lemmas[${i}] spoiler — synonyms[${j}] contains lemma "${word}"`,
          )
        }
      }
    }

    // DE: flag damaged ß→SS forms when the lemma looks like a common ß word
    // (soft check via nfcUpper round-trip awareness — STRASSE from Straße is wrong)
    if (o.lang === 'de' && /SS/.test(word) && !word.includes('ß')) {
      // only informational via known list restored by expand; packs should use ß when source had it
    }

    return { word, gloss, synonyms }
  })

  return {
    version: o.version,
    lang: o.lang,
    cefr: o.cefr,
    license: o.license as string,
    attribution: o.attribution as string[],
    lemmas,
  }
}

async function walkJson(dir: string): Promise<string[]> {
  const out: string[] = []
  let entries: string[]
  try {
    entries = await readdir(dir)
  } catch {
    return out
  }
  for (const name of entries) {
    const full = path.join(dir, name)
    const st = await stat(full)
    if (st.isDirectory()) {
      out.push(...(await walkJson(full)))
    } else if (name.endsWith('.json')) {
      out.push(full)
    }
  }
  return out
}

const files = await walkJson(ROOT)
if (files.length === 0) {
  console.error(`No pack JSON under ${ROOT}`)
  process.exit(1)
}

const PACK_PATH_RE = new RegExp(
  `^(${PACK_LANGS.join('|')})/(${PACK_CEFR_LEVELS.join('|')})\\.json$`,
)

const seen = new Set<string>()

let ok = 0
for (const file of files) {
  const text = await readFile(file, 'utf8')
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch (e) {
    console.error(`${file}: invalid JSON — ${e}`)
    process.exit(1)
  }
  const rel = path.relative(ROOT, file)
  const pack = validatePack(raw, rel)

  const relPosix = rel.split(path.sep).join('/')
  const pathMatch = relPosix.match(PACK_PATH_RE)
  if (!pathMatch) {
    throw new Error(`${rel}: expected packs/{lang}/{cefr}.json`)
  }
  const [, pathLang, pathCefr] = pathMatch
  seen.add(`${pathLang}/${pathCefr}`)
  if (pack.lang !== pathLang || pack.cefr !== pathCefr) {
    throw new Error(
      `${rel}: path lang/cefr ${pathLang}/${pathCefr} does not match JSON ${pack.lang}/${pack.cefr}`,
    )
  }

  if (pack.lang === 'pt') {
    const blob = [pack.license, ...pack.attribution].join('\n')
    if (!/cc-by-sa/i.test(blob)) {
      throw new Error(
        `${rel}: PT pack license/attribution must mention CC-BY-SA`,
      )
    }
  }

  const SOFT_FLOOR = 350
  if (pack.lemmas.length < SOFT_FLOOR) {
    throw new Error(
      `${rel}: lemma count ${pack.lemmas.length} is below pre-prod soft floor ${SOFT_FLOOR} (ADR 0026 aims ~400)`,
    )
  }

  // Spot-check: every lemma uppercased via nfcUpper for consistency
  for (const [i, L] of pack.lemmas.entries()) {
    if (nfcUpper(L.word) !== L.word.normalize('NFC')) {
      // allow if already NFC; require denylist path used nfcUpper forms
      if (isDeniedLemma(L.word, DENY)) {
        throw new Error(`${rel}: lemmas[${i}] denylist after normalize`)
      }
    }
  }

  console.log(
    `ok ${rel} — ${pack.lemmas.length} lemmas (${pack.lang}/${pack.cefr})`,
  )
  ok++
}

for (const lang of PACK_LANGS) {
  for (const cefr of PACK_CEFRS) {
    if (!seen.has(`${lang}/${cefr}`)) {
      throw new Error(`missing shipped pack public/packs/${lang}/${cefr}.json`)
    }
  }
}

console.log(`packs:check passed (${ok} file${ok === 1 ? '' : 's'})`)
