#!/usr/bin/env bun
/**
 * Apply scripts/data/lemma-pos.json to every shipped pack (ADR 0055 / #315):
 * set `pos` on each lemma from the source map, bump the pack `version` when the
 * body changed, and rewrite scripts/data/pack-pin.json. Prints the byte delta
 * per pack for the ADR 0055 size report.
 *
 *   bun run scripts/apply-lemma-pos.ts            (after build-lemma-pos.ts)
 *   bun run scripts/apply-lemma-pos.ts --dry-run
 */
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { nfcUpper } from './lemma-denylist'
import { packPinEntry, type PackPinFile } from './pack-pin'
import { loadLemmaPosMap, type LemmaPosMap } from './lemma-pos'
import { PACK_LANGS, PACK_CEFR_LEVELS } from '../src/packs/schema'

const ROOT = path.join(import.meta.dir, '..')
const PACKS = path.join(ROOT, 'public', 'packs')
const PIN_PATH = path.join(ROOT, 'scripts', 'data', 'pack-pin.json')
const dryRun = process.argv.includes('--dry-run')

type PackFile = {
  version: number
  lang: string
  cefr: string
  license: string
  attribution: string[]
  lemmas: { word: string; pos?: string; [k: string]: unknown }[]
}

function main() {
  const posMap: LemmaPosMap = loadLemmaPosMap()
  const pin: PackPinFile = JSON.parse(readFileSync(PIN_PATH, 'utf8')) as PackPinFile
  let totalBefore = 0
  let totalAfter = 0

  for (const lang of PACK_LANGS) {
    for (const cefr of PACK_CEFR_LEVELS) {
      const rel = `${lang}/${cefr}.json`
      const file = path.join(PACKS, rel)
      const before = readFileSync(file, 'utf8')
      const pack = JSON.parse(before) as PackFile
      const words = posMap[lang] ?? {}
      let changed = 0
      for (const L of pack.lemmas) {
        const want = words[nfcUpper(L.word)] ?? null
        if (want && L.pos !== want) {
          L.pos = want
          changed += 1
        } else if (!want && L.pos !== undefined) {
          delete L.pos
          changed += 1
        }
      }
      if (!changed) {
        pin[rel] = packPinEntry(pack)
        continue
      }
      pack.version += 1
      const after = JSON.stringify(pack, null, 2) + '\n'
      totalBefore += Buffer.byteLength(before, 'utf8')
      totalAfter += Buffer.byteLength(after, 'utf8')
      pin[rel] = packPinEntry(pack)
      if (!dryRun) writeFileSync(file, after)
      console.log(
        `${rel}: pos on ${changed}/${pack.lemmas.length} lemmas, version ${pack.version - 1}→${pack.version}, ${(Buffer.byteLength(before, 'utf8') / 1024).toFixed(1)}→${(Buffer.byteLength(after, 'utf8') / 1024).toFixed(1)} KB`,
      )
    }
  }

  if (!dryRun) {
    writeFileSync(PIN_PATH, JSON.stringify(pin, null, 2) + '\n')
    console.log(`rewrote ${PIN_PATH}`)
  }
  console.log(
    `total packs bytes: ${(totalBefore / 1024 / 1024).toFixed(2)}→${(totalAfter / 1024 / 1024).toFixed(2)} MB (delta ${(((totalAfter - totalBefore) / 1024) | 0)} KB) ${dryRun ? '(dry-run)' : ''}`,
  )
}

main()
