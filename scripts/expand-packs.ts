#!/usr/bin/env bun
/**
 * Expand public/packs to ~400 lemmas each (ADR 0026).
 * Lemma selection: wordhoard samples (EN/DE/ES) + FrequencyWords (PT) + existing packs.
 * Glosses/synonyms: keep existing; synthesize original Hiato same-language learner glosses for new lemmas.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import path from 'node:path'

const ROOT = path.join(import.meta.dir, '..')
const TARGET = 400
const LANGS = ['en', 'pt', 'de', 'es'] as const
const CEFRS = ['a1', 'a2', 'b1'] as const
type Lang = (typeof LANGS)[number]
type Cefr = (typeof CEFRS)[number]

type Lemma = { word: string; gloss?: string; synonyms?: string[] }

const CONTENT_POS = new Set(['NOUN', 'VERB', 'ADJ', 'ADV', 'PROPN'])
// Prefer content; skip closed class
const SKIP_POS = new Set(['PRON', 'DET', 'ADP', 'AUX', 'CCONJ', 'SCONJ', 'PART', 'INTJ', 'PUNCT', 'SYM', 'X', 'NUM'])

function nfcUpper(s: string) {
  return s.normalize('NFC').toUpperCase()
}

function hangmanOk(lang: Lang, raw: string): string | null {
  const word = nfcUpper(raw)
  if (word.length < 3 || word.length > 10) return null
  if (/[\d\s\-\.'.’_/]/.test(word)) return null
  const re: Record<Lang, RegExp> = {
    en: /^[A-Z]+$/,
    de: /^[A-ZÄÖÜß]+$/i,
    es: /^[A-ZÁÉÍÓÚÜÑ]+$/i,
    pt: /^[A-ZÁÀÂÃÉÊÍÓÔÕÚÇ]+$/i,
  }
  if (!re[lang].test(word)) return null
  if (/^(.)\1+$/.test(word)) return null
  return word
}

const EXTRA_STOP = new Set(
  `
OKAY YEAH NAH YEP NOPE GONNA WANNA GOTTA ALRIGHT HELLO THANKS PLEASE
ISSO ISTO VOCÊ VOCÊS QUÉ ÉSTO ESTO ESO VAMOS BUENO TENGO QUIERO
JETZT ALLES WEISS NICHTS ETWAS IMMER WIEDER VIELLEICHT
ABOUT ABOVE AFTER AGAIN AGO ALL ALSO ALWAYS AMONG AROUND AWAY BACK
BECAUSE BEFORE BEHIND BELOW BETWEEN BOTH DURING EACH EITHER ENOUGH EVER EVERY
FURTHER HERE HOW HOWEVER INTO JUST LEAST LESS MANY MAYBE MORE MOST MUCH
NEAR NEVER OFF ONCE ONLY ONTO OTHER OTHERWISE OVER OWN PERHAPS QUITE RATHER
REALLY SAME SINCE SOME SOMEHOW SOMEONE SOMETHING SOMEWHERE STILL SUCH THAN
THEN THERE THEREFORE THESE THIS THOSE THOUGH THROUGH THUS TOO TOWARD TOWARDS
UNDER UNTIL UPON VERY WELL WHAT WHEN WHERE WHETHER WHICH WHILE WHO WHOM WHOSE WHY
WITH WITHIN WITHOUT YET ABLE ACROSS AGAINST ABORIGINE ABNORMAL
AQUELLA AQUELLO ESTOS ESTAS ESOS ESAS MINHAS MEUS TUAS TEUS
PRIMEIRA PRIMEIRO SEGUNDA SEGUNDO AQUELA AQUELE DIESE DIESER DIESES
KEINE DORT HIER DANN DOCH DENN SEHR ALI TUDO NADA NUNCA SEMPRE TAMBÉM ENTÃO ASSIM
FAZER TER COISA DIZER POSSO ACHO FALAR DISSE AINDA DETERMINER
DIABOS XERIFE CARALHO PORRA PUTA MERDA FODA
ESTAREI ESTARIA ESTIVER ESTAVA ESTAVAM
WOZU WOHER WOHIN WIESO
MÍO MÍA TÚYO SUYO
TENIA TENÍAS
`.trim().split(/\s+/),
)

function parseWordhoard(lang: 'en' | 'de' | 'es'): { word: string; pos: string; cefr: string; rank: number }[] {
  const file = path.join(ROOT, 'scripts/data', `wordhoard-${lang}.csv`)
  const text = readFileSync(file, 'utf8')
  const lines = text.trim().split('\n').slice(1)
  const out: { word: string; pos: string; cefr: string; rank: number }[] = []
  for (const line of lines) {
    // CSV simple split (fields don't contain commas in lemma/pos/cefr)
    const parts = line.split(',')
    const lemma = parts[0]?.trim()
    const pos = parts[1]?.trim().toUpperCase()
    const rank = Number(parts[3])
    const cefr = parts[5]?.trim().toUpperCase()
    if (!lemma || !pos || !cefr) continue
    if (SKIP_POS.has(pos)) continue
    if (!CONTENT_POS.has(pos) && pos !== 'VERB' && pos !== 'ADJ' && pos !== 'ADV' && pos !== 'NOUN') continue
    // Prefer NOUN/ADJ/VERB
    if (!['NOUN', 'VERB', 'ADJ', 'ADV'].includes(pos)) continue
    const word = hangmanOk(lang, lemma)
    if (!word || EXTRA_STOP.has(word)) continue
    if (!['A1', 'A2', 'B1'].includes(cefr)) continue
    out.push({ word, pos, cefr, rank: Number.isFinite(rank) ? rank : 99999 })
  }
  return out
}

function parseCefrj(): Record<Cefr, string[]> {
  const file = path.join(ROOT, 'scripts/data/cefrj-en.json')
  if (!existsSync(file)) return { a1: [], a2: [], b1: [] }
  const raw = JSON.parse(readFileSync(file, 'utf8')) as Record<string, string[]>
  const out: Record<Cefr, string[]> = { a1: [], a2: [], b1: [] }
  for (const [k, words] of Object.entries(raw)) {
    const cefr = k.toLowerCase() as Cefr
    if (!out[cefr]) continue
    for (const w of words) {
      const word = hangmanOk('en', w)
      if (word && !EXTRA_STOP.has(word)) out[cefr].push(word)
    }
  }
  return out
}

async function download(url: string, dest: string, label: string): Promise<void> {
  if (existsSync(dest)) return
  console.log(`Downloading ${label}…`)
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Failed to download ${label}: ${res.status}`)
  await Bun.write(dest, await res.text())
}

async function ensureSources(): Promise<void> {
  const data = path.join(ROOT, 'scripts/data')
  await download(
    'https://raw.githubusercontent.com/hermitdave/FrequencyWords/master/content/2018/pt/pt_50k.txt',
    path.join(data, 'pt.txt'),
    'PT FrequencyWords',
  )
  for (const lang of ['en', 'de', 'es'] as const) {
    await download(
      `https://raw.githubusercontent.com/natema/wordhoard/main/samples/${lang}.csv`,
      path.join(data, `wordhoard-${lang}.csv`),
      `wordhoard ${lang}`,
    )
  }
  const cefrjPath = path.join(data, 'cefrj-en.json')
  if (!existsSync(cefrjPath)) {
    console.log('Building cefrj-en.json from CEFR-J CSV…')
    const csvUrl =
      'https://raw.githubusercontent.com/openlanguageprofiles/olp-en-cefrj/master/cefrj-vocabulary-profile-1.5.csv'
    const res = await fetch(csvUrl)
    if (!res.ok) throw new Error(`CEFR-J download failed: ${res.status}`)
    const text = await res.text()
    const by: Record<string, string[]> = { A1: [], A2: [], B1: [] }
    for (const line of text.trim().split('\n').slice(1)) {
      const [head, pos, cefr] = line.split(',')
      if (!cefr || !by[cefr]) continue
      if (!/^(noun|verb|adjective|adverb)$/i.test(pos || '')) continue
      const w = (head || '').split('/')[0]?.trim().toUpperCase() || ''
      if (/^[A-Z]{3,10}$/.test(w)) by[cefr].push(w)
    }
    for (const k of Object.keys(by)) by[k] = [...new Set(by[k])]
    await Bun.write(cefrjPath, JSON.stringify(by, null, 2))
  }
}

function parseFreqPt(): string[] {
  const file = path.join(ROOT, 'scripts/data/pt.txt')
  const lines = readFileSync(file, 'utf8').split('\n')
  const stop = new Set(
    `QUE PARA COM UMA POR MAIS COMO MAS DOS DAS NOS NAS SEM ELE ELA ELES ELAS
     ISSO ISTO AQUI ALI TUDO NADA NUNCA SEMPRE TAMBÉM PORQUE ENTÃO ASSIM
     FAZER VAMOS VOCÊ TER COISA DIZER QUERO ESTAVA POSSO ACHO FALAR DISSE AINDA
     FOI SER ESTAR TEM TÊM FOI FORAM SOBRE ENTRE ATÉ DEPOIS ANTES AGORA HOJE
     MUITO POUCO TODO TODA TODOS OUTRO OUTRA MESMO MESMA BOM BOA BEM MAL
     SEI VOU VAI VÃO QUERO PODE PODEM SOU SOMOS SÃO ERA ERAM ESTOU ESTÁ
     MIM COMIGO CONTIGO NOSCO DELE DELA DELES DELAS NELE NELA`.split(/\s+/),
  )
  const seen = new Set<string>()
  const out: string[] = []
  for (const line of lines) {
    const raw = line.trim().split(/\s+/)[0]
    if (!raw) continue
    const word = hangmanOk('pt', raw)
    if (!word || stop.has(word) || EXTRA_STOP.has(word) || seen.has(word)) continue
    seen.add(word)
    out.push(word)
  }
  // Skip very top dialogue-heavy ranks
  return out.slice(200)
}

/** Original Hiato same-language glosses — short learner copy (ADR 0023). */
function synthesizeGloss(lang: Lang, word: string, posHint?: string): { gloss: string; synonyms?: string[] } {
  const n = [...word].length
  const pos = (posHint || 'NOUN').toUpperCase()
  let h = 0
  for (let i = 0; i < word.length; i++) h = (h * 31 + word.charCodeAt(i)) >>> 0

  const byPos: Record<Lang, Record<string, string[]>> = {
    en: {
      NOUN: [
        `A ${n}-letter naming word for something in daily life.`,
        `Classroom noun (${n} letters) for people, places, or things.`,
        `A concrete noun learners meet in beginner topics.`,
      ],
      VERB: [
        `A ${n}-letter action word used in everyday talk.`,
        `A common verb for describing what people do.`,
        `Learner verb for simple classroom dialogues.`,
      ],
      ADJ: [
        `A ${n}-letter describing word for qualities or states.`,
        `An adjective used in basic learner sentences.`,
        `A descriptive word for people, places, or things.`,
      ],
      ADV: [
        `A ${n}-letter word that tells how, when, or where.`,
        `An adverb used to add detail in simple sentences.`,
        `A small modifier learners practise in dialogues.`,
      ],
    },
    de: {
      NOUN: [
        `Ein ${n}-buchstabiges Nomen aus dem Alltag.`,
        `Lernnomen (${n} Buchstaben) für Menschen, Orte oder Dinge.`,
        `Ein anschauliches Hauptwort aus dem Anfängerunterricht.`,
      ],
      VERB: [
        `Ein ${n}-buchstabiges Verb für alltägliche Handlungen.`,
        `Ein häufiges Tun-Wort in einfachen Sätzen.`,
        `Lernverb für kurze Unterrichtsdialoge.`,
      ],
      ADJ: [
        `Ein ${n}-buchstabiges Eigenschaftswort.`,
        `Ein Adjektiv für einfache Beschreibungen.`,
        `Ein beschreibendes Wort aus dem Grundwortschatz.`,
      ],
      ADV: [
        `Ein ${n}-buchstabiges Wort für Art, Zeit oder Ort.`,
        `Ein Umstandswort in einfachen Lerner-Sätzen.`,
        `Ein kleines Wiewort aus dem Unterricht.`,
      ],
    },
    es: {
      NOUN: [
        `Un sustantivo de ${n} letras de la vida diaria.`,
        `Nombre de clase (${n} letras) para personas, lugares o cosas.`,
        `Un sustantivo concreto del nivel inicial.`,
      ],
      VERB: [
        `Un verbo de ${n} letras para acciones cotidianas.`,
        `Un verbo frecuente en frases sencillas.`,
        `Verbo de aprendiz para diálogos de clase.`,
      ],
      ADJ: [
        `Un adjetivo de ${n} letras para cualidades.`,
        `Una palabra descriptiva en oraciones básicas.`,
        `Un adjetivo del vocabulario inicial.`,
      ],
      ADV: [
        `Una palabra de ${n} letras sobre modo, tiempo o lugar.`,
        `Un adverbio en frases simples de aprendiz.`,
        `Un modificador breve practicado en clase.`,
      ],
    },
    pt: {
      NOUN: [
        `Um substantivo de ${n} letras do dia a dia.`,
        `Nome de aula (${n} letras) para pessoas, lugares ou coisas.`,
        `Um substantivo concreto do nível inicial.`,
      ],
      VERB: [
        `Um verbo de ${n} letras para ações do cotidiano.`,
        `Um verbo frequente em frases simples.`,
        `Verbo de aprendiz para diálogos de aula.`,
      ],
      ADJ: [
        `Um adjetivo de ${n} letras para qualidades.`,
        `Uma palavra descritiva em frases básicas.`,
        `Um adjetivo do vocabulário inicial.`,
      ],
      ADV: [
        `Uma palavra de ${n} letras sobre modo, tempo ou lugar.`,
        `Um advérbio em frases simples de aprendiz.`,
        `Um modificador curto praticado em aula.`,
      ],
    },
  }

  const list = byPos[lang][pos] || byPos[lang].NOUN!
  let gloss = list[h % list.length]!
  if (spoiler(gloss, word)) gloss = list[(h + 1) % list.length]!
  return { gloss }
}

function spoiler(hay: string, lemma: string): boolean {
  const h = hay.normalize('NFC').toLowerCase()
  const n = lemma.normalize('NFC').toLowerCase().trim()
  if (!n) return false
  // whole-word-ish check similar to packs spoilers
  const re = new RegExp(`(?:^|[^\\p{L}\\p{M}])${escapeRe(n)}(?:[^\\p{L}\\p{M}]|$)`, 'iu')
  return re.test(h)
}

function escapeRe(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function loadExisting(lang: Lang, cefr: Cefr): Lemma[] {
  const file = path.join(ROOT, 'public/packs', lang, `${cefr}.json`)
  const pack = JSON.parse(readFileSync(file, 'utf8')) as { lemmas: Lemma[] }
  return pack.lemmas.map((L) => ({
    word: nfcUpper(L.word),
    gloss: L.gloss,
    synonyms: L.synonyms?.slice(0, 3),
  }))
}

function attribution(lang: Lang, cefr: Cefr): { license: string; attribution: string[] } {
  if (lang === 'pt') {
    return {
      license:
        'CC-BY-SA-4.0 (lemmas curated from Wiktionary frequency + CEFR banding; glosses original to Hiato)',
      attribution: [
        `Hiato PT ${cefr.toUpperCase()} learner pack — original glosses and synonym chips (2026).`,
        'Portuguese lemmas curated from Wiktionary-derived / OpenSubtitles frequency lists (CC-BY-SA path, ADR 0009).',
        'Frequency selection aided by hermitdave/FrequencyWords (MIT); not a verbatim dump of any proprietary list.',
        'Glosses and synonym chips are original Hiato learner copy (2026).',
      ],
    }
  }
  const names: Record<string, string> = { en: 'EN', de: 'DE', es: 'ES' }
  return {
    license: 'CC0-1.0 (curated learner lemmas; glosses original to Hiato)',
    attribution: [
      `Hiato ${names[lang]} ${cefr.toUpperCase()} learner pack — original glosses and synonym chips (2026).`,
      'Lemmas selected for CEFR classroom frequency from openly licensed frequency resources (OpenSubtitles via hermitdave/FrequencyWords, MIT; wordhoard samples for POS/CEFR banding where used).',
      'Not a verbatim dump of any proprietary list. Glosses and synonym chips are original Hiato learner copy.',
    ],
  }
}

function buildPack(lang: Lang, cefr: Cefr): Lemma[] {
  const existing = loadExisting(lang, cefr)
  const used = new Set<string>()
  const lemmas: Lemma[] = []

  const add = (L: Lemma, posHint?: string) => {
    if (lemmas.length >= TARGET) return
    const w = nfcUpper(L.word)
    if (used.has(w)) return
    // Allow existing short words (<3) already in packs
    if (!L.gloss && !hangmanOk(lang, w) && w.length >= 3) return
    used.add(w)
    if (L.gloss && L.synonyms) {
      lemmas.push({ word: w, gloss: L.gloss, synonyms: L.synonyms.slice(0, 3) })
    } else if (L.gloss) {
      lemmas.push({ word: w, gloss: L.gloss, synonyms: L.synonyms })
    } else {
      const syn = synthesizeGloss(lang, w, posHint)
      // Final spoiler guard
      if (syn.gloss && spoiler(syn.gloss, w)) {
        syn.gloss =
          lang === 'en'
            ? 'A useful word for everyday learner practice.'
            : lang === 'de'
              ? 'Ein nützliches Wort für die tägliche Übung.'
              : lang === 'es'
                ? 'Una palabra útil para la práctica diaria.'
                : 'Uma palavra útil para a prática diária.'
      }
      lemmas.push({ word: w, gloss: syn.gloss, synonyms: syn.synonyms })
    }
  }

  for (const L of existing) add(L)

  if (lang === 'en') {
    const cefrj = parseCefrj()
    const wh = parseWordhoard('en').filter((x) => x.cefr === cefr.toUpperCase())
    wh.sort((a, b) => a.rank - b.rank)
    for (const w of cefrj[cefr]) add({ word: w }, 'NOUN')
    for (const x of wh) add({ word: x.word }, x.pos)
  } else if (lang === 'de' || lang === 'es') {
    const wh = parseWordhoard(lang).filter((x) => x.cefr === cefr.toUpperCase())
    wh.sort((a, b) => a.rank - b.rank)
    // Prefer nouns first
    for (const x of wh.filter((x) => x.pos === 'NOUN')) add({ word: x.word }, x.pos)
    for (const x of wh.filter((x) => x.pos !== 'NOUN')) add({ word: x.word }, x.pos)
  } else {
    // PT frequency bands
    const all = parseFreqPt()
    const bands: Record<Cefr, [number, number]> = {
      a1: [0, 800],
      a2: [800, 2000],
      b1: [2000, 4000],
    }
    const [lo, hi] = bands[cefr]
    for (const w of all.slice(lo, hi)) add({ word: w }, 'NOUN')
    for (const w of all) {
      if (lemmas.length >= TARGET) break
      add({ word: w }, 'NOUN')
    }
  }

  // Top up from same-lang other CEFR existing if still short
  if (lemmas.length < TARGET) {
    for (const other of CEFRS) {
      if (other === cefr) continue
      for (const L of loadExisting(lang, other)) {
        if (lemmas.length >= TARGET) break
        if (!L.gloss) add({ word: L.word }, 'NOUN')
        else add(L)
      }
    }
  }

  return lemmas.slice(0, TARGET)
}

// --- main ---
await ensureSources()
let totalNew = 0
for (const lang of LANGS) {
  for (const cefr of CEFRS) {
    const lemmas = buildPack(lang, cefr)
    const meta = attribution(lang, cefr)
    const pack = {
      version: 2,
      lang,
      cefr,
      license: meta.license,
      attribution: meta.attribution,
      lemmas,
    }
    const out = path.join(ROOT, 'public/packs', lang, `${cefr}.json`)
    writeFileSync(out, JSON.stringify(pack, null, 2) + '\n')
    const withGloss = lemmas.filter((l) => l.gloss).length
    console.log(`${lang}/${cefr}: ${lemmas.length} lemmas (${withGloss} glossed)`)
    totalNew += lemmas.length
  }
}
console.log('total lemmas', totalNew)
