/**
 * xAI synonym generation for expand-packs (not run on CI / bun:test).
 */
import { nfcUpper } from './lemma-denylist'
import { readXaiKey, xaiChat } from './xai-chat'
import {
  filterSynonymChips,
  synonymCacheKeyIsSettled,
} from './synonym-chips'

export type SynLang = 'en' | 'de' | 'es' | 'pt' | 'fr' | 'it'

const LANG_NAME: Record<SynLang, string> = {
  en: 'English',
  de: 'German',
  es: 'Spanish',
  pt: 'Portuguese',
  fr: 'French',
  it: 'Italian',
}

const SYNONYM_STYLE: Partial<Record<SynLang, string>> = {
  fr: 'Français seulement — jamais anglais. Écris œ, pas oe. Pas d’article et pas d’élision dans les synonymes (pas de un, une, le, la, l’, d’, n’, j’, qu’).',
  it: 'Italiano soltanto — mai inglese. Niente articolo e niente elisione nei sinonimi. Scrivi la lettera accentata (à è é ì ò ù), non la forma senza accento.',
}

function asStringArray(raw: unknown): string[] | null {
  if (raw === undefined) return null
  if (Array.isArray(raw)) {
    return raw.filter((x): x is string => typeof x === 'string')
  }
  if (typeof raw === 'string') {
    const t = raw.trim()
    if (!t || t === '[]') return []
    return [t]
  }
  return null
}

function lookupParsed(
  parsed: Record<string, unknown>,
  w: string,
): unknown {
  if (Object.hasOwn(parsed, w)) return parsed[w]
  if (Object.hasOwn(parsed, w.toLowerCase())) return parsed[w.toLowerCase()]
  const nfc = nfcUpper(w)
  if (Object.hasOwn(parsed, nfc)) return parsed[nfc]
  const hit = Object.entries(parsed).find(([k]) => nfcUpper(k) === w)
  return hit?.[1]
}

function applyParsed(
  lang: SynLang,
  batch: string[],
  parsed: Record<string, unknown>,
  cache: Record<string, string[]>,
  denylist: Set<string>,
): void {
  for (const w of batch) {
    if (synonymCacheKeyIsSettled(cache, w)) continue
    const arr = asStringArray(lookupParsed(parsed, w))
    if (arr === null) {
      console.warn(`  missing synonyms for ${w}`)
      continue
    }
    if (arr.length === 0) {
      cache[w] = []
      continue
    }
    const chips = filterSynonymChips(w, arr, denylist, lang)
    if (chips.length === 0) {
      console.warn(`  rejected ${lang} synonyms for ${w}: ${arr.join(', ')}`)
      continue
    }
    cache[w] = chips
  }
}

async function completeJson(
  key: string,
  temperature: number,
  system: string,
  prompt: string,
  soft = false,
): Promise<Record<string, unknown> | null> {
  let content: string
  try {
    content = await xaiChat(key, system, prompt, temperature)
  } catch (e) {
    if (!soft) throw e
    console.warn(`  ${(e as Error).message}`)
    return null
  }
  const jsonMatch = content.match(/\{[\s\S]*\}/)
  if (!jsonMatch) {
    const msg = `No JSON in synonym response: ${content.slice(0, 200)}`
    if (!soft) throw new Error(msg)
    console.warn(`  ${msg}`)
    return null
  }
  try {
    return JSON.parse(jsonMatch[0]) as Record<string, unknown>
  } catch {
    if (!soft) throw new Error('invalid synonym JSON')
    console.warn('  invalid synonym JSON')
    return null
  }
}

function batchPrompt(lang: SynLang, batch: string[]): string {
  return (
    `Language: ${LANG_NAME[lang]} (${lang}).\n` +
    `For each lemma, give 1–3 close same-language learner synonyms.\n` +
    `Rules: same language only (never a translation); never the lemma itself or a spelling of it; ` +
    `no NSFW; no letter-count fluff.\n` +
    `Use [] if there is no close synonym (unique referent: a specific fruit, weekday, number, ` +
    `or a colour with no near-synonym). Do not force a hypernym (never banana → fruit).\n` +
    `Most common verbs, adjectives, and abstract nouns have a close learner synonym ` +
    `(big/large, start/begin, house/home). Leave at most about one in five lemmas as [].\n` +
    (SYNONYM_STYLE[lang] ? `${SYNONYM_STYLE[lang]}\n` : '') +
    `Return a JSON object mapping each UPPERCASE lemma to a string array.\n` +
    `Lemmas:\n${batch.join('\n')}`
  )
}

/**
 * Fill missing cache keys (not explicit []). `[]` = unique referent, do not retry.
 */
export async function generateSynonyms(
  lang: SynLang,
  words: string[],
  cache: Record<string, string[]>,
  denylist: Set<string>,
  save: (cache: Record<string, string[]>) => void,
): Promise<void> {
  const unique = [...new Set(words.map(nfcUpper))]
  let missing = unique.filter((w) => !synonymCacheKeyIsSettled(cache, w))
  if (missing.length === 0) return

  const key = readXaiKey()
  if (!key) {
    throw new Error(
      `Need synonyms for ${missing.length} ${lang} lemmas but no xAI key — set XAI_API_KEY (or ~/.grok/auth.json)`,
    )
  }

  const BATCH = 60
  console.log(
    `Generating ${missing.length} ${lang} synonym sets in batches of ${BATCH}…`,
  )
  for (let i = 0; i < missing.length; i += BATCH) {
    const batch = missing.slice(i, i + BATCH)
    const parsed = await completeJson(
      key,
      0.2,
      'You write same-language learner synonyms. Reply with a single JSON object only.',
      batchPrompt(lang, batch),
    )
    if (parsed) applyParsed(lang, batch, parsed, cache, denylist)
    save(cache)
    console.log(
      `  ${lang} synonyms ${Math.min(i + BATCH, missing.length)}/${missing.length}`,
    )
  }

  missing = unique.filter((w) => !synonymCacheKeyIsSettled(cache, w))
  for (let attempt = 0; attempt < 3 && missing.length; attempt++) {
    console.log(`  ${lang} synonym retry ${attempt + 1}: ${missing.length} leftovers`)
    for (let i = 0; i < missing.length; i += 20) {
      const batch = missing.slice(i, i + 20)
      const prompt =
        `Language: ${LANG_NAME[lang]} (${lang}).\n` +
        `JSON object: UPPERCASE lemma → 1–3 close same-language synonyms, or [] if unique.\n` +
        `Never the lemma; never a translation; no NSFW; no banana→fruit hypernyms.\n` +
        (SYNONYM_STYLE[lang] ? `${SYNONYM_STYLE[lang]}\n` : '') +
        batch.map((w) => `- ${w}`).join('\n')
      const parsed = await completeJson(
        key,
        0.4,
        'JSON only. Same-language learner synonyms (ADR 0023).',
        prompt,
        true,
      )
      if (parsed) applyParsed(lang, batch, parsed, cache, denylist)
      save(cache)
    }
    missing = unique.filter((w) => !synonymCacheKeyIsSettled(cache, w))
  }
  if (missing.length) {
    console.warn(`  ${lang} still missing synonym cache keys: ${missing.join(', ')}`)
  }
}
