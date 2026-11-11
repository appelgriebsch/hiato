#!/usr/bin/env bun
/**
 * #225 / ADR 0048: add one example sentence per lemma to every shipped pack.
 *
 * Sentences are original Hiato learner copy (MIT with the app — see LICENSE /
 * NOTICE), generated from fixed per-language templates so they stay inside the
 * pack language and simple enough for A1–B1. Each example embeds the lemma as a
 * whole word (validated by packs:check). Idempotent: lemmas that already carry
 * an `example` keep it. Bumps each pack `version`, appends an attribution line,
 * and rewrites scripts/data/pack-pin.json so the pin matches the new body.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { PACK_CEFRS, PACK_LANGS, type PackLang } from '../src/packs/schema'
import { packPinEntry, loadPackPin, type PackPinFile } from './pack-pin'

const ROOT = path.join(import.meta.dir, '..')
const PACKS_DIR = path.join(ROOT, 'public', 'packs')
const PIN_FILE = path.join(ROOT, 'scripts', 'data', 'pack-pin.json')

const ATTRIBUTION_LINE =
  'Example sentences on the end card (post-round only) are original Hiato learner copy in the pack language, licensed MIT with the app (see LICENSE / NOTICE).'

/** Sentence templates per pack language. `{w}` is replaced by the lemma. */
const TEMPLATES: Record<PackLang, string[]> = {
  en: [
    'Can you use “{w}” in a sentence?',
    'The word “{w}” is useful every day.',
    'She wrote “{w}” on the board.',
    'We learned the word “{w}” yesterday.',
    'Try saying “{w}” out loud.',
    'My teacher asked me about “{w}”.',
  ],
  de: [
    'Kannst du „{w}“ in einem Satz verwenden?',
    'Das Wort „{w}“ ist jeden Tag nützlich.',
    'Sie schrieb „{w}“ an die Tafel.',
    'Wir haben „{w}“ gestern gelernt.',
    'Versuch, „{w}“ laut auszusprechen.',
    'Meine Lehrerin hat nach „{w}“ gefragt.',
  ],
  es: [
    '¿Puedes usar «{w}» en una frase?',
    'La palabra «{w}» es útil cada día.',
    'Ella escribió «{w}» en la pizarra.',
    'Aprendimos «{w}» ayer.',
    'Intenta decir «{w}» en voz alta.',
    'Mi profesor me preguntó por «{w}».',
  ],
  pt: [
    'Consegues usar “{w}” numa frase?',
    'A palavra “{w}” é útil todos os dias.',
    'Ela escreveu “{w}” no quadro.',
    'Aprendemos “{w}” ontem.',
    'Tenta dizer “{w}” em voz alta.',
    'O meu professor perguntou por “{w}”.',
  ],
  fr: [
    'Peux-tu employer « {w} » dans une phrase ?',
    'Le mot « {w} » est utile tous les jours.',
    'Elle a écrit « {w} » au tableau.',
    'Nous avons appris « {w} » hier.',
    'Essaie de dire « {w} » à voix haute.',
    "Mon professeur m'a demandé « {w} ».",
  ],
  it: [
    'Puoi usare «{w}» in una frase?',
    'La parola «{w}» è utile ogni giorno.',
    'Lei ha scritto «{w}» alla lavagna.',
    'Abbiamo imparato «{w}» ieri.',
    'Prova a dire «{w}» a voce alta.',
    'Il mio insegnante mi ha chiesto di «{w}».',
  ],
}

/** Deterministic template pick so re-runs are stable. */
function pickTemplate(lang: PackLang, word: string): string {
  const list = TEMPLATES[lang]
  let h = 0
  for (const ch of word.normalize('NFC')) {
    h = (h * 31 + (ch.codePointAt(0) ?? 0)) >>> 0
  }
  return list[h % list.length]!
}

/** Natural in-sentence form: German nouns stay capitalized, others lowercase. */
function sentenceForm(lang: PackLang, word: string): string {
  const w = word.normalize('NFC')
  if (lang === 'de') {
    return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()
  }
  return w.toLowerCase()
}

type PackFile = {
  version: number
  lang: PackLang
  cefr: string
  license: string
  attribution: string[]
  lemmas: { word: string; gloss?: string; synonyms?: string[]; example?: string }[]
}

function main(): void {
  const pin: PackPinFile = loadPackPin(PIN_FILE)
  let changed = 0
  let added = 0

  for (const lang of PACK_LANGS) {
    for (const cefr of PACK_CEFRS) {
      const rel = `${lang}/${cefr}.json`
      const file = path.join(PACKS_DIR, rel)
      const pack = JSON.parse(readFileSync(file, 'utf8')) as PackFile
      let touched = false
      for (const lemma of pack.lemmas) {
        if (typeof lemma.example === 'string' && lemma.example.trim()) continue
        lemma.example = pickTemplate(lang, lemma.word).replace(
          '{w}',
          sentenceForm(lang, lemma.word),
        )
        added++
        touched = true
      }
      if (!touched && pack.attribution.includes(ATTRIBUTION_LINE)) continue
      if (!pack.attribution.includes(ATTRIBUTION_LINE)) {
        pack.attribution.push(ATTRIBUTION_LINE)
        touched = true
      }
      pack.version += 1
      writeFileSync(file, `${JSON.stringify(pack, null, 2)}\n`)
      pin[rel] = packPinEntry(pack)
      changed++
    }
  }

  writeFileSync(PIN_FILE, `${JSON.stringify(pin, null, 2)}\n`)
  console.log(`add-examples: ${added} sentences added, ${changed} packs rewritten`)
}

main()
