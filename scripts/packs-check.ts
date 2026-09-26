#!/usr/bin/env bun
/**
 * Validate public/packs JSON files — schema, exclusive bands, license matrix,
 * ADR 0023 spoilers, ADR 0026/0028 floors, NSFW denylist, template-gloss,
 * pack-language gloss (ADR 0030), hangman length 3–10, Hunspell membership,
 * person-name gloss gate (#24), hint ceiling (#52/#54/#53/#51 / EN+DE+PT+ES a1–b1).
 */
import { readdir, readFile, stat } from 'node:fs/promises'
import path from 'node:path'
import {
  C2_MIN,
  buildLemmaEasiestByLang,
  checkCompleteness,
  checkHintCeiling,
  checkLemmaFloor,
  checkPackLicense,
  checkSynonymCoverage,
  failClosedOnHunspellMiss,
  exclusiveConflicts,
  lemmaFloor,
  validatePack,
  type PackSnapshot,
} from './packs-check-lib'
import {
  ensureDicts,
  loadMembershipCache,
  MembershipDictsNeeded,
  writeMembershipCache,
} from './lang-membership'
import { loadEnEasiestCefr, loadHintStemCache } from './hint-ceiling-data'

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

/** Returns true when the packs failed a gate. */
async function checkAll(files: string[]): Promise<boolean> {
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

  // Hint ceiling: read committed caches only (fail closed). Build lemma maps after every pack parsed.
  let enTags: Map<string, string>
  let stemCache: ReturnType<typeof loadHintStemCache>
  try {
    enTags = loadEnEasiestCefr()
    stemCache = loadHintStemCache()
  } catch (e) {
    console.error(e instanceof Error ? e.message : e)
    return true
  }
  const lemmaEasiestByLang = buildLemmaEasiestByLang(snapshots)
  for (const { rel, pack } of snapshots) {
    errors.push(
      ...checkHintCeiling(rel, pack, lemmaEasiestByLang, stemCache, enTags),
    )
  }

  if (errors.length) {
    for (const e of errors) console.error(e)
    return true
  }

  console.log(`packs:check passed (${snapshots.length} file${snapshots.length === 1 ? '' : 's'})`)
  return false
}

loadMembershipCache()

const files = await walkJson(ROOT)
if (files.length === 0) {
  console.error(`No pack JSON under ${ROOT}`)
  process.exit(1)
}

let failed = false
let cacheMissInCi = false
try {
  try {
    failed = await checkAll(files)
  } catch (e) {
    if (!(e instanceof MembershipDictsNeeded)) throw e
    if (failClosedOnHunspellMiss()) {
      cacheMissInCi = true
      console.error(
        'packs:check: Hunspell verdict cache miss. Run bun run packs:check locally and commit scripts/data/hunspell-verdicts.json',
      )
    } else {
      console.error(
        'packs:check: Hunspell verdict cache miss — loading dictionaries',
      )
      await ensureDicts()
      failed = await checkAll(files)
    }
  }
} finally {
  if (!cacheMissInCi && writeMembershipCache()) {
    console.error(
      '::warning::packs:check rewrote scripts/data/hunspell-verdicts.json — commit it so the next run skips Hunspell',
    )
  }
}

if (cacheMissInCi) process.exit(1)

if (failed) process.exit(1)
