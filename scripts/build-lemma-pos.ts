#!/usr/bin/env bun
/**
 * Build scripts/data/lemma-pos.json + pos-exempt.txt from the licensed pack
 * sources (ADR 0055 / #315). Sources are downloaded on demand into scripts/data
 * (gitignored); the generated map is committed so packs:check stays offline.
 *
 *   bun run scripts/build-lemma-pos.ts
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { gunzipSync } from 'node:zlib'
import { nfcUpper } from './lemma-denylist'
import { PACK_LANGS, PACK_CEFR_LEVELS, type PackLang, type PackPos } from '../src/packs/schema'
import {
  CEFRJ_CSV_PATH,
  DATA_DIR,
  LEMMA_POS_PATH,
  OCTANOVE_CSV_PATH,
  POS_EXEMPT_PATH,
  WORDHOARD_DB_PATH,
  isCurrentPosPass,
  loadPosGateLog,
  posGateKey,
  posSourceInfo,
  type LemmaPosMap,
} from './lemma-pos'

const ROOT = path.join(import.meta.dir, '..')
const PACKS = path.join(ROOT, 'public', 'packs')

const CEFRJ_CSV_URL =
  'https://raw.githubusercontent.com/openlanguageprofiles/olp-en-cefrj/master/cefrj-vocabulary-profile-1.5.csv'
const OCTANOVE_CSV_URL =
  'https://raw.githubusercontent.com/openlanguageprofiles/olp-en-cefrj/master/octanove-vocabulary-profile-c1c2-1.0.csv'
const WORDHOARD_GZ_URL =
  'https://github.com/natema/wordhoard/releases/download/v0.1.0/wordhoard.db.gz'
const WORDHOARD_GZ_PATH = path.join(DATA_DIR, 'wordhoard-v0.1.0.db.gz')

async function download(url: string, dest: string, binary = false): Promise<void> {
  if (existsSync(dest)) return
  console.log(`Downloading ${url} …`)
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Failed to download ${url}: ${res.status}`)
  mkdirSync(path.dirname(dest), { recursive: true })
  if (binary) await Bun.write(dest, await res.arrayBuffer())
  else await Bun.write(dest, await res.text())
}

async function ensureSources(): Promise<void> {
  mkdirSync(DATA_DIR, { recursive: true })
  await download(CEFRJ_CSV_URL, CEFRJ_CSV_PATH)
  await download(OCTANOVE_CSV_URL, OCTANOVE_CSV_PATH)
  await download(WORDHOARD_GZ_URL, WORDHOARD_GZ_PATH, true)
  if (!existsSync(WORDHOARD_DB_PATH)) {
    console.log('Decompressing wordhoard v0.1.0 db…')
    writeFileSync(WORDHOARD_DB_PATH, gunzipSync(readFileSync(WORDHOARD_GZ_PATH)))
  }
}

function main() {
  const map: LemmaPosMap = {}
  const exemptLines: string[] = [
    '# lang|WORD\treason — shipped lemmas with no licensed pos source (ADR 0055 / #315).',
  ]
  const perLang: Record<string, { pos: number; exempt: number; total: number }> = {}
  // #339/#362: a lemma filled by the gated Mistral fallback has a current
  // passing pos gate entry — it is not exempt, so filled lemmas leave this list.
  const posGate = loadPosGateLog()

  for (const lang of PACK_LANGS) {
    map[lang] = {}
    perLang[lang] = { pos: 0, exempt: 0, total: 0 }
    for (const cefr of PACK_CEFR_LEVELS) {
      const file = path.join(PACKS, lang, `${cefr}.json`)
      if (!existsSync(file)) continue
      const pack = JSON.parse(readFileSync(file, 'utf8')) as { lemmas: { word: string }[] }
      for (const L of pack.lemmas) {
        const word = nfcUpper(L.word)
        perLang[lang]!.total += 1
        const info = posSourceInfo(lang as PackLang, cefr, L.word)
        if (info.pos) {
          map[lang]![word] = info.pos as PackPos
          perLang[lang]!.pos += 1
        } else if (isCurrentPosPass(posGate[posGateKey(lang, word)])) {
          perLang[lang]!.pos += 1
        } else {
          exemptLines.push(`${lang}|${word}\t${info.reason}`)
          perLang[lang]!.exempt += 1
        }
      }
    }
    // Stable key order keeps the committed diff small.
    map[lang] = Object.fromEntries(Object.entries(map[lang]!).sort(([a], [b]) => a.localeCompare(b)))
  }

  writeFileSync(LEMMA_POS_PATH, JSON.stringify(map, null, 2) + '\n')
  exemptLines.sort((a, b) => a.localeCompare(b))
  writeFileSync(POS_EXEMPT_PATH, exemptLines.join('\n') + '\n')

  for (const lang of PACK_LANGS) {
    const s = perLang[lang]!
    console.log(
      `${lang}: ${s.pos}/${s.total} lemmas with pos (${((100 * s.pos) / Math.max(1, s.total)).toFixed(1)}%), ${s.exempt} exempt`,
    )
  }
  console.log(`wrote ${LEMMA_POS_PATH} and ${POS_EXEMPT_PATH}`)
}

await ensureSources()
main()
