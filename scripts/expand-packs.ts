#!/usr/bin/env bun
/**
 * Expand public/packs to ~400 lemmas each (ADR 0026).
 * Lemma selection: wordhoard samples (EN/DE/ES) + FrequencyWords (PT) + existing packs.
 * Glosses: keep curated non-template glosses; generate real same-language learner glosses
 * for new lemmas via xAI (never letter-count templates). Denylist rejects NSFW/violence.
 * Person names drop only when the lemma is on the name list *and* the gloss is a
 * person-name gloss (keep WILL/MARK/ROSA with a common-noun reading).
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'
import path from 'node:path'
import { isDeniedLemma, loadDenylist, nfcUpper } from './lemma-denylist'
import { loadNameList, onNameList } from './lemma-names'
import { isPersonNameGloss } from './name-gloss'
import { isTemplateGloss } from './gloss-quality'

const ROOT = path.join(import.meta.dir, '..')
const TARGET = 400
const LANGS = ['en', 'pt', 'de', 'es'] as const
const CEFRS = ['a1', 'a2', 'b1'] as const
type Lang = (typeof LANGS)[number]
type Cefr = (typeof CEFRS)[number]

type Lemma = { word: string; gloss?: string; synonyms?: string[] }

const CONTENT_POS = new Set(['NOUN', 'VERB', 'ADJ', 'ADV', 'PROPN'])
const SKIP_POS = new Set([
  'PRON', 'DET', 'ADP', 'AUX', 'CCONJ', 'SCONJ', 'PART', 'INTJ', 'PUNCT', 'SYM', 'X', 'NUM',
])

const DENY = loadDenylist()
const NAMES = loadNameList()

function isNameGlossLemma(lang: Lang, word: string, gloss: string | undefined): boolean {
  return !!(gloss && onNameList(word, NAMES) && isPersonNameGloss(gloss, lang))
}

function hangmanOk(lang: Lang, raw: string): string | null {
  const word = nfcUpper(raw)
  if (word.length < 3 || word.length > 10) return null
  if (/[\d\s\-\.'.’_/]/.test(word)) return null
  const re: Record<Lang, RegExp> = {
    en: /^[A-Z]+$/,
    de: /^[A-ZÄÖÜß]+$/,
    es: /^[A-ZÁÉÍÓÚÜÑ]+$/,
    pt: /^[A-ZÁÀÂÃÉÊÍÓÔÕÚÇ]+$/,
  }
  if (!re[lang].test(word)) return null
  if (/^(.)\1+$/.test(word)) return null
  if (isDeniedLemma(word, DENY)) return null
  return word
}

/** DE fold for matching STRAßE ↔ STRASSE without preferring damaged SS forms. */
function foldKey(lang: Lang, word: string): string {
  const w = nfcUpper(word)
  return lang === 'de' ? w.replaceAll('ß', 'SS') : w
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
DIABOS XERIFE
ESTAREI ESTARIA ESTIVER ESTAVA ESTAVAM
WOZU WOHER WOHIN WIESO
MÍO MÍA TÚYO SUYO
TENIA TENÍAS
DANKE GRACIAS THANKS SIR HAUSE DESTA NESTE NESTA DESTES DESTAS TIVE SINTO ESPERO QUERO POSSO ACHO VAMOS
`.trim().split(/\s+/).map(nfcUpper),
)

function parseWordhoard(lang: 'en' | 'de' | 'es'): { word: string; pos: string; cefr: string; rank: number }[] {
  const file = path.join(ROOT, 'scripts/data', `wordhoard-${lang}.csv`)
  const text = readFileSync(file, 'utf8')
  const lines = text.trim().split('\n').slice(1)
  const out: { word: string; pos: string; cefr: string; rank: number }[] = []
  for (const line of lines) {
    const parts = line.split(',')
    const lemma = parts[0]?.trim()
    const pos = parts[1]?.trim().toUpperCase()
    const rank = Number(parts[3])
    const cefr = parts[5]?.trim().toUpperCase()
    if (!lemma || !pos || !cefr) continue
    if (SKIP_POS.has(pos)) continue
    if (!CONTENT_POS.has(pos) && pos !== 'VERB' && pos !== 'ADJ' && pos !== 'ADV' && pos !== 'NOUN') continue
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
      const w = hangmanOk('en', (head || '').split('/')[0]?.trim() || '')
      if (w) by[cefr].push(w)
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
     MIM COMIGO CONTIGO NOSCO DELE DELA DELES DELAS NELE NELA`.split(/\s+/).map(nfcUpper),
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
  return out.slice(200)
}

function spoiler(hay: string, lemma: string): boolean {
  const h = hay.normalize('NFC').toLowerCase()
  const n = lemma.normalize('NFC').toLowerCase().trim()
  if (!n) return false
  const re = new RegExp(`(?:^|[^\\p{L}\\p{M}])${escapeRe(n)}(?:[^\\p{L}\\p{M}]|$)`, 'iu')
  return re.test(h)
}

function escapeRe(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function glossCachePath(lang: Lang) {
  return path.join(ROOT, 'scripts/data/gloss-cache', `${lang}.json`)
}

function loadGlossCache(lang: Lang): Record<string, string> {
  const f = glossCachePath(lang)
  if (!existsSync(f)) return {}
  return JSON.parse(readFileSync(f, 'utf8')) as Record<string, string>
}

function saveGlossCache(lang: Lang, cache: Record<string, string>) {
  const dir = path.dirname(glossCachePath(lang))
  mkdirSync(dir, { recursive: true })
  writeFileSync(glossCachePath(lang), JSON.stringify(cache, null, 2) + '\n')
}

/** Prefer curated non-template glosses; drop denylisted; fold DE ß/SS. */
function loadCuratedMaps(): Record<Lang, Map<string, Lemma>> {
  const maps: Record<Lang, Map<string, Lemma>> = {
    en: new Map(),
    de: new Map(),
    es: new Map(),
    pt: new Map(),
  }
  for (const lang of LANGS) {
    for (const cefr of CEFRS) {
      const file = path.join(ROOT, 'public/packs', lang, `${cefr}.json`)
      if (!existsSync(file)) continue
      const pack = JSON.parse(readFileSync(file, 'utf8')) as { lemmas: Lemma[] }
      for (const L of pack.lemmas) {
        const word = nfcUpper(L.word)
        if (isDeniedLemma(word, DENY)) continue
        if (!L.gloss || isTemplateGloss(L.gloss)) continue
        if (spoiler(L.gloss, word)) continue
        if (isNameGlossLemma(lang, word, L.gloss)) continue
        const key = foldKey(lang, word)
        const prev = maps[lang].get(key)
        // Prefer form that still contains ß when both exist
        if (prev && lang === 'de' && prev.word.includes('ß') && !word.includes('ß')) continue
        maps[lang].set(key, {
          word,
          gloss: L.gloss,
          synonyms: L.synonyms?.slice(0, 3),
        })
      }
    }
  }
  return maps
}

function readXaiKey(): string | null {
  try {
    const authPath = `${process.env.HOME}/.grok/auth.json`
    if (!existsSync(authPath)) return null
    const auth = JSON.parse(readFileSync(authPath, 'utf8')) as Record<string, { key?: string }>
    for (const v of Object.values(auth)) {
      if (v?.key) return v.key
    }
  } catch {
    /* ignore */
  }
  return process.env.XAI_API_KEY || null
}

const LANG_NAME: Record<Lang, string> = {
  en: 'English',
  de: 'German',
  es: 'Spanish',
  pt: 'Portuguese',
}

async function generateGlosses(
  lang: Lang,
  words: string[],
  cache: Record<string, string>,
): Promise<void> {
  const missing = words.filter((w) => {
    const g = cache[w]
    if (!g || isTemplateGloss(g) || spoiler(g, w)) return true
    if (isNameGlossLemma(lang, w, g)) return true
    return false
  })
  if (missing.length === 0) return

  const key = readXaiKey()
  if (!key) {
    throw new Error(
      `Need glosses for ${missing.length} ${lang} lemmas but no xAI key (set XAI_API_KEY or ~/.grok/auth.json)`,
    )
  }

  const BATCH = 60
  console.log(`Generating ${missing.length} ${lang} glosses in batches of ${BATCH}…`)
  for (let i = 0; i < missing.length; i += BATCH) {
    const batch = missing.slice(i, i + BATCH)
    const prompt =
      `Language: ${LANG_NAME[lang]} (${lang}).\n` +
      `Write a short same-language learner dictionary gloss for each lemma (one simple sentence or clause).\n` +
      `Rules: never include the lemma itself as a whole word in its gloss (do not start with the lemma); ` +
      `no letter-count or classroom-template fluff; no NSFW. Prefer "a/an/the …" or "to …" style definitions.\n` +
      `Never define a lemma as a given name, first name, surname, family name, or proper name of a person. ` +
      `If it has an ordinary noun/verb/adjective/adverb meaning, use that. If it is only a personal name, omit it from the JSON.\n` +
      `Return JSON object mapping each UPPERCASE lemma to its gloss string.\n` +
      `Lemmas:\n${batch.join('\n')}`

    const res = await fetch('https://api.x.ai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        model: 'grok-4-fast-non-reasoning',
        temperature: 0.2,
        messages: [
          {
            role: 'system',
            content:
              'You write concise learner-dictionary glosses. Reply with a single JSON object only.',
          },
          { role: 'user', content: prompt },
        ],
      }),
    })
    if (!res.ok) {
      const t = await res.text()
      throw new Error(`xAI gloss API ${res.status}: ${t.slice(0, 300)}`)
    }
    const body = (await res.json()) as {
      choices?: { message?: { content?: string } }[]
    }
    const content = body.choices?.[0]?.message?.content || ''
    const jsonMatch = content.match(/\{[\s\S]*\}/)
    if (!jsonMatch) throw new Error(`No JSON in gloss response: ${content.slice(0, 200)}`)
    const parsed = JSON.parse(jsonMatch[0]) as Record<string, string>
    for (const w of batch) {
      const g =
        parsed[w] ||
        parsed[w.toLowerCase()] ||
        parsed[nfcUpper(w)] ||
        Object.entries(parsed).find(([k]) => nfcUpper(k) === w)?.[1]
      if (!g || typeof g !== 'string') {
        console.warn(`  missing gloss for ${w}`)
        continue
      }
      let gloss = g.trim()
      if (spoiler(gloss, w) || isTemplateGloss(gloss) || isNameGlossLemma(lang, w, gloss)) {
        console.warn(`  rejected gloss for ${w}: ${gloss.slice(0, 60)}`)
        continue
      }
      cache[w] = gloss
    }
    saveGlossCache(lang, cache)
    console.log(`  ${lang} glosses ${Math.min(i + BATCH, missing.length)}/${missing.length}`)
  }

  // Retry leftovers with stricter anti-spoiler instructions
  let leftovers = words.filter((w) => {
    const g = cache[w]
    if (!g || isTemplateGloss(g) || spoiler(g, w)) return true
    if (isNameGlossLemma(lang, w, g)) return true
    return false
  })
  for (let attempt = 0; attempt < 3 && leftovers.length; attempt++) {
    console.log(`  ${lang} retry ${attempt + 1}: ${leftovers.length} leftovers`)
    for (let i = 0; i < leftovers.length; i += 20) {
      const batch = leftovers.slice(i, i + 20)
      const prompt =
        `Language: ${LANG_NAME[lang]} (${lang}).\n` +
        `For each lemma, write a short learner gloss that does NOT contain the lemma letters as a whole word at all.\n` +
        `Define the meaning using other words only. JSON object mapping UPPERCASE lemma → gloss.\n` +
        batch.map((w) => `- ${w}`).join('\n')
      const res = await fetch('https://api.x.ai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${key}`,
        },
        body: JSON.stringify({
          model: 'grok-4-fast-non-reasoning',
          temperature: 0.4,
          messages: [
            {
              role: 'system',
              content:
                'JSON only. Each gloss must avoid the headword as a whole word (ADR 0023).',
            },
            { role: 'user', content: prompt },
          ],
        }),
      })
      if (!res.ok) continue
      const body = (await res.json()) as {
        choices?: { message?: { content?: string } }[]
      }
      const content = body.choices?.[0]?.message?.content || ''
      const jsonMatch = content.match(/\{[\s\S]*\}/)
      if (!jsonMatch) continue
      try {
        const parsed = JSON.parse(jsonMatch[0]) as Record<string, string>
        for (const w of batch) {
          const g =
            parsed[w] ||
            Object.entries(parsed).find(([k]) => nfcUpper(k) === w)?.[1]
          if (!g || typeof g !== 'string') continue
          const gloss = g.trim()
          if (spoiler(gloss, w) || isTemplateGloss(gloss)) continue
          if (isNameGlossLemma(lang, w, gloss)) continue
          cache[w] = gloss
        }
      } catch {
        /* ignore bad json */
      }
      saveGlossCache(lang, cache)
    }
    leftovers = words.filter((w) => {
      const g = cache[w]
      if (!g || isTemplateGloss(g) || spoiler(g, w)) return true
      if (isNameGlossLemma(lang, w, g)) return true
      return false
    })
  }
  if (leftovers.length) {
    console.warn(`  ${lang} still missing glosses: ${leftovers.join(', ')}`)
  }
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

function selectWords(
  lang: Lang,
  cefr: Cefr,
  curated: Map<string, Lemma>,
  glossCache: Record<string, string> = {},
): { word: string; posHint?: string; curated?: Lemma }[] {
    const slots = new Map<string, { word: string; posHint?: string; curated?: Lemma }>()

  const add = (word: string, posHint?: string, cur?: Lemma) => {
    if (slots.size >= TARGET && !slots.has(foldKey(lang, word))) return
    const w = nfcUpper(word)
    if (!w || EXTRA_STOP.has(w) || isDeniedLemma(w, DENY)) return
    const gloss = (cur?.gloss && !isTemplateGloss(cur.gloss) ? cur.gloss : null) || glossCache[w]
    // Name-list tokens stay only with a real common-noun gloss (not occupancy for later drop).
    if (onNameList(w, NAMES)) {
      if (!gloss || isTemplateGloss(gloss) || spoiler(gloss, w) || isPersonNameGloss(gloss, lang)) {
        return
      }
    }
    const key = foldKey(lang, w)
    const ok = hangmanOk(lang, w)
    if (!ok && !(cur?.gloss && w.length >= 2 && w.length <= 12)) return
    const form = ok || w
    const prev = slots.get(key)
    if (prev) {
      // Prefer German ß orthography over SS; keep best curated gloss
      const preferBeta = lang === 'de' && form.includes('ß') && !prev.word.includes('ß')
      const mergedCur = cur?.gloss ? cur : prev.curated
      if (preferBeta) {
        slots.set(key, { word: form, posHint: posHint || prev.posHint, curated: mergedCur })
      } else if (cur?.gloss && !prev.curated?.gloss) {
        slots.set(key, { word: prev.word, posHint: prev.posHint || posHint, curated: cur })
      }
      return
    }
    if (slots.size >= TARGET) return
    slots.set(key, { word: form, posHint, curated: cur })
  }

  // 1) Frequency sources first so DE ß forms win over legacy SS pack spellings


  // 2) Frequency / wordhoard
  if (lang === 'en') {
    const cefrj = parseCefrj()
    const wh = parseWordhoard('en').filter((x) => x.cefr === cefr.toUpperCase())
    wh.sort((a, b) => a.rank - b.rank)
    for (const w of cefrj[cefr]) add(w, 'NOUN', curated.get(foldKey(lang, w)))
    for (const x of wh) add(x.word, x.pos, curated.get(foldKey(lang, x.word)))
  } else if (lang === 'de' || lang === 'es') {
    const wh = parseWordhoard(lang).filter((x) => x.cefr === cefr.toUpperCase())
    wh.sort((a, b) => a.rank - b.rank)
    for (const x of wh.filter((x) => x.pos === 'NOUN')) {
      add(x.word, x.pos, curated.get(foldKey(lang, x.word)))
    }
    for (const x of wh.filter((x) => x.pos !== 'NOUN')) {
      add(x.word, x.pos, curated.get(foldKey(lang, x.word)))
    }
    // Extra top-up from other CEFR bands in wordhoard
    if (slots.size < TARGET) {
      const more = parseWordhoard(lang).sort((a, b) => a.rank - b.rank)
      for (const x of more) {
        if (slots.size >= TARGET) break
        add(x.word, x.pos, curated.get(foldKey(lang, x.word)))
      }
    }
  } else {
    const all = parseFreqPt()
    const bands: Record<Cefr, [number, number]> = {
      a1: [0, 800],
      a2: [800, 2000],
      b1: [2000, 4000],
    }
    const [lo, hi] = bands[cefr]
    for (const w of all.slice(lo, hi)) add(w, 'NOUN', curated.get(foldKey(lang, w)))
    for (const w of all) {
      if (slots.size >= TARGET) break
      add(w, 'NOUN', curated.get(foldKey(lang, w)))
    }
  }

  // 2) Overlay remaining curated lemmas (real glosses) to top up / attach glosses
  for (const L of curated.values()) {
    add(L.word, undefined, L)
  }

  return [...slots.values()].slice(0, TARGET)
}

function buildLemmas(
  lang: Lang,
  selected: { word: string; posHint?: string; curated?: Lemma }[],
  glossCache: Record<string, string>,
): Lemma[] {
  const lemmas: Lemma[] = []
  for (const s of selected) {
    const w = s.word
    let gloss = s.curated?.gloss
    if (!gloss || isTemplateGloss(gloss)) gloss = glossCache[w]
    if (
      !gloss ||
      isTemplateGloss(gloss) ||
      spoiler(gloss, w) ||
      isNameGlossLemma(lang, w, gloss)
    ) {
      throw new Error(`${lang}: missing real gloss for ${w}`)
    }
    lemmas.push({
      word: w,
      gloss,
      synonyms: s.curated?.synonyms?.slice(0, 3),
    })
  }
  return lemmas
}

function hasRealGloss(
  lang: Lang,
  s: { word: string; curated?: Lemma },
  cache: Record<string, string>,
): boolean {
  const g = (s.curated?.gloss && !isTemplateGloss(s.curated.gloss) ? s.curated.gloss : null) || cache[s.word]
  return !!(
    g &&
    !isTemplateGloss(g) &&
    !spoiler(g, s.word) &&
    !isNameGlossLemma(lang, s.word, g)
  )
}

// --- main ---
await ensureSources()
const curatedMaps = loadCuratedMaps()
for (const lang of LANGS) {
  console.log(`${lang}: ${curatedMaps[lang].size} curated glosses retained`)
}

const caches: Record<Lang, Record<string, string>> = {
  en: loadGlossCache('en'),
  de: loadGlossCache('de'),
  es: loadGlossCache('es'),
  pt: loadGlossCache('pt'),
}
for (const lang of LANGS) {
  for (const L of curatedMaps[lang].values()) {
    if (L.gloss && !isNameGlossLemma(lang, L.word, L.gloss)) caches[lang][L.word] = L.gloss
  }
}

const selections: Record<string, { word: string; posHint?: string; curated?: Lemma }[]> = {}
for (const lang of LANGS) {
  for (const cefr of CEFRS) {
    selections[`${lang}/${cefr}`] = selectWords(lang, cefr, curatedMaps[lang], caches[lang])
  }
}

// Generate glosses for anything not curated (skip person-name glosses)
for (const lang of LANGS) {
  const cache = caches[lang]
  const need = new Set<string>()
  for (const cefr of CEFRS) {
    for (const s of selections[`${lang}/${cefr}`]!) {
      if (hasRealGloss(lang, s, cache)) continue
      need.add(s.word)
    }
  }
  await generateGlosses(lang, [...need], cache)
  saveGlossCache(lang, cache)
}

let totalNew = 0
for (const lang of LANGS) {
  const cache = caches[lang]
  for (const cefr of CEFRS) {
    let selected = selections[`${lang}/${cefr}`]!.filter((s) => hasRealGloss(lang, s, cache))
    // Top up from broader selection if name-gloss / denylist / gloss gaps shrank the pack
    if (selected.length < TARGET) {
      const extra = selectWords(lang, cefr, curatedMaps[lang], cache)
      const have = new Set(selected.map((s) => foldKey(lang, s.word)))
      const need = extra
        .filter((s) => !have.has(foldKey(lang, s.word)) && !hasRealGloss(lang, s, cache))
        .map((s) => s.word)
      if (need.length) {
        await generateGlosses(lang, need, cache)
        saveGlossCache(lang, cache)
      }
      for (const s of extra) {
        if (selected.length >= TARGET) break
        const key = foldKey(lang, s.word)
        if (have.has(key)) continue
        if (!hasRealGloss(lang, s, cache)) continue
        have.add(key)
        selected.push(s)
      }
    }
    selected = selected.slice(0, TARGET)
    if (selected.length < 350) {
      throw new Error(`${lang}/${cefr}: only ${selected.length} glossed lemmas after filters`)
    }
    const lemmas = buildLemmas(lang, selected, cache)
    const meta = attribution(lang, cefr)
    const pack = {
      version: 3,
      lang,
      cefr,
      license: meta.license,
      attribution: meta.attribution,
      lemmas,
    }
    const outFile = path.join(ROOT, 'public/packs', lang, `${cefr}.json`)
    writeFileSync(outFile, JSON.stringify(pack, null, 2) + '\n')
    console.log(`${lang}/${cefr}: ${lemmas.length} lemmas`)
    totalNew += lemmas.length
  }
}
console.log('total lemmas', totalNew)
