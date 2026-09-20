#!/usr/bin/env bun
/**
 * Validate public/packs JSON files — schema shape + ADR 0023 spoiler rule.
 * Gloss / synonyms must not contain the lemma as a whole word (case-insensitive).
 */
import { readdir, readFile, stat } from 'node:fs/promises'
import path from 'node:path'
import { isPackCefr, isPackLang, type WordPack } from '../src/packs/schema'
import { spoilerContains } from '../src/packs/spoilers'

const ROOT = path.join(import.meta.dir, '..', 'public', 'packs')

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

  // ADR 0026 soft floor — pre-prod packs should be ~400 lemmas, not dozens
  const SOFT_FLOOR = 350
  if (pack.lemmas.length < SOFT_FLOOR) {
    throw new Error(
      `${rel}: lemma count ${pack.lemmas.length} is below pre-prod soft floor ${SOFT_FLOOR} (ADR 0026 aims ~400)`,
    )
  }

  console.log(
    `ok ${rel} — ${pack.lemmas.length} lemmas (${pack.lang}/${pack.cefr})`,
  )
  ok++
}

console.log(`packs:check passed (${ok} file${ok === 1 ? '' : 's'})`)
