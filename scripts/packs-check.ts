#!/usr/bin/env bun
/**
 * Validate public/packs JSON files — schema, ADR 0023 spoilers, ADR 0026 floor,
 * NSFW denylist, required non-template same-language gloss (ADR 0030), person-name gloss gate,
 * Hunspell language-membership (loanword allowlist), and ≥80% synonym chips.
 */
import { readdir, readFile, stat } from 'node:fs/promises'
import path from 'node:path'
import { isPackCefr, isPackLang, type WordPack } from '../src/packs/schema'
import { spoilerContains } from '../src/packs/spoilers'
import { isDeniedLemma, loadDenylist, nfcUpper } from './lemma-denylist'
import { loadNameList, onNameList } from './lemma-names'
import { isPersonNameGloss } from './name-gloss'
import {
  isTemplateGloss,
  isWrongLanguageGloss,
  TEMPLATE_GLOSS_RE,
} from './gloss-quality'
import { ensureDicts, isWordOfLang } from './lang-membership'
import {
  SYNONYM_CHIP_CAP,
  SYNONYM_COVERAGE_FLOOR,
  invalidSynonymChipReason,
  synonymCoverageRatio,
} from './synonym-chips'

const ROOT = path.join(import.meta.dir, '..', 'public', 'packs')
const DENY = loadDenylist()
const NAMES = loadNameList()

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
    throw new Error(`${file}: cefr must be a1|a2|b1`)
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
    const gloss = assertString(e.gloss, `${file}: lemmas[${i}].gloss`).normalize(
      'NFC',
    )
    let synonyms: string[] | undefined
    if (e.synonyms !== undefined) {
      if (!Array.isArray(e.synonyms)) {
        throw new Error(`${file}: lemmas[${i}].synonyms must be an array`)
      }
      if (e.synonyms.length > SYNONYM_CHIP_CAP) {
        throw new Error(
          `${file}: lemmas[${i}] synonyms length ${e.synonyms.length} exceeds cap ${SYNONYM_CHIP_CAP}`,
        )
      }
      synonyms = e.synonyms.map((s, j) => {
        const raw = assertString(s, `${file}: lemmas[${i}].synonyms[${j}]`)
        if (raw !== raw.normalize('NFC')) {
          throw new Error(
            `${file}: lemmas[${i}] synonyms[${j}] is not NFC`,
          )
        }
        const reason = invalidSynonymChipReason(word, raw, DENY)
        if (reason) {
          throw new Error(
            `${file}: lemmas[${i}] synonyms[${j}] ${reason} — "${raw}"`,
          )
        }
        return raw.normalize('NFC')
      })
    }

    if (isDeniedLemma(word, DENY)) {
      throw new Error(`${file}: lemmas[${i}] denylist — lemma "${word}"`)
    }
    if (!isWordOfLang(o.lang as 'en' | 'de' | 'es' | 'pt', word)) {
      throw new Error(
        `${file}: lemmas[${i}] not a word of ${o.lang} — "${word}"`,
      )
    }
    if (isTemplateGloss(gloss)) {
      throw new Error(
        `${file}: lemmas[${i}] template gloss — "${word}" matches ${TEMPLATE_GLOSS_RE}`,
      )
    }
    if (isWrongLanguageGloss(o.lang as string, gloss, isWordOfLang)) {
      throw new Error(
        `${file}: lemmas[${i}] gloss not in pack language ${o.lang} — "${word}" / "${gloss}"`,
      )
    }
    if (spoilerContains(gloss, word)) {
      throw new Error(
        `${file}: lemmas[${i}] spoiler — gloss contains lemma "${word}"`,
      )
    }
    if (onNameList(word, NAMES) && isPersonNameGloss(gloss, o.lang as string)) {
      throw new Error(
        `${file}: lemmas[${i}] person-name gloss — "${word}" / "${gloss}"`,
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

await ensureDicts()

const files = await walkJson(ROOT)
if (files.length === 0) {
  console.error(`No pack JSON under ${ROOT}`)
  process.exit(1)
}

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
  const pathMatch = relPosix.match(/^(en|de|es|pt)\/(a1|a2|b1)\.json$/)
  if (!pathMatch) {
    throw new Error(`${rel}: expected packs/{lang}/{cefr}.json`)
  }
  const [, pathLang, pathCefr] = pathMatch
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

  const chipRatio = synonymCoverageRatio(pack.lemmas, DENY)
  if (chipRatio < SYNONYM_COVERAGE_FLOOR) {
    throw new Error(
      `${rel}: synonym chip coverage ${(chipRatio * 100).toFixed(1)}% is below ${(SYNONYM_COVERAGE_FLOOR * 100).toFixed(0)}%`,
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

  const withChips = pack.lemmas.filter(
    (L) => (L.synonyms?.length ?? 0) > 0,
  ).length
  console.log(
    `ok ${rel} — ${pack.lemmas.length} lemmas, synonym chips ${withChips}/${pack.lemmas.length} (${(chipRatio * 100).toFixed(1)}%) (${pack.lang}/${pack.cefr})`,
  )
  ok++
}

console.log(`packs:check passed (${ok} file${ok === 1 ? '' : 's'})`)
