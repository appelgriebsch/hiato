#!/usr/bin/env bun
/**
 * Validate public/packs JSON files — schema, exclusive bands, license matrix,
 * ADR 0023 spoilers, ADR 0026/0028 floors, NSFW denylist, template-gloss,
 * pack-language gloss (ADR 0030), hangman length 3–10, Hunspell membership,
 * person-name gloss gate (#24).
 */
import { readdir, readFile, stat } from 'node:fs/promises'
import path from 'node:path'
import {
  C2_MIN,
  checkCompleteness,
  checkLemmaFloor,
  checkPackLicense,
  checkSynonymCoverage,
  exclusiveConflicts,
  lemmaFloor,
  validatePack,
  type PackSnapshot,
} from './packs-check-lib'
import { ensureDicts } from './lang-membership'

const ROOT = path.join(import.meta.dir, '..', 'public', 'packs')

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

const snapshots: PackSnapshot[] = []
const rels: string[] = []
const errors: string[] = []

for (const file of files) {
  const text = await readFile(file, 'utf8')
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch (e) {
    console.error(`${file}: invalid JSON — ${e}`)
    process.exit(1)
  }
  const rel = path.relative(ROOT, file).split(path.sep).join('/')
  rels.push(rel)
  const pack = validatePack(raw, rel)

  if (pack.lang !== rel.split('/')[0] || pack.cefr !== rel.split('/')[1]?.replace(/\.json$/, '')) {
    errors.push(
      `${rel}: path lang/cefr does not match JSON ${pack.lang}/${pack.cefr}`,
    )
  }

  const licenseErr = checkPackLicense(rel, pack)
  if (licenseErr) errors.push(licenseErr)

  const floorErr = checkLemmaFloor(rel, pack)
  if (floorErr) errors.push(floorErr)

  const syn = checkSynonymCoverage(rel, pack)
  if (syn.error) errors.push(syn.error)
  if (syn.warn) console.warn(syn.warn)

  snapshots.push({ rel, pack })
  const floor = lemmaFloor(pack.cefr)
  const extra = pack.cefr === 'c2' ? ` (C2_MIN=${C2_MIN})` : ''
  console.log(
    `ok ${rel} — ${pack.lemmas.length} lemmas (${pack.lang}/${pack.cefr}, floor ${floor}${extra})`,
  )
}

errors.push(...checkCompleteness(rels))
errors.push(...exclusiveConflicts(snapshots))

if (errors.length) {
  for (const e of errors) console.error(e)
  process.exit(1)
}

console.log(`packs:check passed (${snapshots.length} file${snapshots.length === 1 ? '' : 's'})`)
