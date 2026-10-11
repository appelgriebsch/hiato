/** Detect junk template glosses that must not ship (Ask Avery C2). */
export const TEMPLATE_GLOSS_RE =
  /Lernnomen|Anfängerunterricht|buchstabig|N-letter naming|sustantivo de \d+ letras|substantivo de \d+ letras|Classroom noun\s*\(|Nombre de clase|Nome de aula|\d+-letter (?:naming|action|describing) word|A concrete noun learners meet|Learner verb for simple|An adjective used in basic learner|A descriptive word for people, places|A small modifier learners practise|Ein anschauliches Hauptwort aus dem Anfänger|Ein häufiges Tun-Wort|Lernverb für kurze|Ein beschreibendes Wort aus dem Grundwortschatz|Ein kleines Wiewort|Un sustantivo concreto del nivel inicial|Verbo de aprendiz para|Una palabra descriptiva en oraciones básicas|Un modificador breve practicado|Um substantivo concreto do nível inicial|Verbo de aprendiz para diálogos|Uma palavra descritiva em frases básicas|Um modificador curto praticado|A useful word for everyday learner|Ein nützliches Wort für die tägliche|Una palabra útil para la práctica|Uma palavra útil para a prática/i

export function isTemplateGloss(gloss: string | undefined | null): boolean {
  if (!gloss || !gloss.trim()) return false
  return TEMPLATE_GLOSS_RE.test(gloss)
}

export type GlossLang = 'en' | 'de' | 'es' | 'pt' | 'fr' | 'it'

/** English infinitive / definite-article openers. */
const EN_OPENER = /^(to|the)\s/i
/** English frames that do not appear as these tokens in DE/ES/PT learner copy. */
const EN_FRAMES =
  /\b(something|someone|somebody|anything|anyone|anybody)\b/i
const EN_ONLY =
  /\b(cannot|without|within|itself|themselves|yourself)\b/i
/**
 * English "a NOUN of/that/…" dictionary frame.
 * Must not match PT/DE/ES "a …" articles (no English preposition after the noun).
 */
const EN_A_FRAME =
  /^a\s+[\p{L}'-]+\s+(of|or|that|who|which|used|from|for|with|when|where)\b/iu
/**
 * English article "an" before a vowel sound ("an apple").
 * Not German "an diesen …" (consonant) or "An einem/einer …".
 */
const EN_AN_FRAME = /^an\s+(?!ein(?:em|er|en|es)?\b)[aeiou]/i

/**
 * True when a gloss is shaped like an English learner definition (ADR 0030).
 * Pass `lang` so DE can treat a leading "a " as English (German does not).
 */
export function isEnglishShapedGloss(gloss: string, lang?: GlossLang): boolean {
  const g = gloss.normalize('NFC').trim()
  if (!g) return false
  if (EN_OPENER.test(g)) return true
  if (EN_FRAMES.test(g)) return true
  if (EN_ONLY.test(g)) return true
  if (EN_A_FRAME.test(g)) return true
  // Short English dictionary frames that otherwise look like valid romance-language copy.
  if (
    (lang === 'pt' || lang === 'es' || lang === 'de' || lang === 'fr' || lang === 'it') &&
    /^a\s+mistake\.?$/i.test(g)
  ) return true
  if (lang !== 'en' && /\bready for\b/i.test(g)) return true
  if (lang !== 'en' && /\bofficial in charge\b/i.test(g)) return true
  if (
    (lang === 'pt' || lang === 'es' || lang === 'de' || lang === 'fr' || lang === 'it') &&
    /^[A-Za-z ]+$/.test(g) &&
    /^(father|mother|ready for use|usual or regular)$/i.test(g)
  ) return true
  // Skip German preposition "an …"; English "an apple" still matches for other langs.
  if (lang !== 'de' && EN_AN_FRAME.test(g)) return true
  if (lang === 'de' && /^a\s/i.test(g)) return true
  return false
}

/**
 * Hunspell vote: gloss tokens are English-only more than pack-language-only.
 * Used when production/fixture spellers are loaded.
 */
export function englishGlossByMembership(
  lang: Exclude<GlossLang, 'en'>,
  gloss: string,
  isWordOfLang: (lang: GlossLang, word: string) => boolean,
): boolean {
  const tokens = gloss.normalize('NFC').match(/[\p{L}\p{M}]+/gu) ?? []
  let enOnly = 0
  let packOnly = 0
  let both = 0
  for (const t of tokens) {
    if (t.length < 3) continue
    const en = isWordOfLang('en', t)
    const pack = isWordOfLang(lang, t)
    if (en && !pack) enOnly++
    else if (pack && !en) packOnly++
    else if (en && pack) both++
  }
  const content = enOnly + packOnly + both
  if (content < 3) return enOnly >= 2 && packOnly === 0
  return enOnly >= 2 && enOnly > packOnly
}

/**
 * Gloss is not in the pack language (ADR 0030).
 * EN packs are English by construction. DE/ES/PT must not ship English copy.
 * Pass `isWordOfLang` from lang-membership when dicts are loaded.
 */
export function isWrongLanguageGloss(
  lang: string,
  gloss: string | undefined | null,
  isWordOfLang?: (lang: GlossLang, word: string) => boolean,
): boolean {
  if (!gloss || !gloss.trim()) return false
  if (lang === 'en') return false
  if (lang !== 'de' && lang !== 'es' && lang !== 'pt' && lang !== 'fr' && lang !== 'it') return false
  if (isEnglishShapedGloss(gloss, lang)) return true
  if (isWordOfLang && englishGlossByMembership(lang, gloss, isWordOfLang)) {
    return true
  }
  return false
}

/**
 * #178: placeholder glosses ("lo si fa") and boilerplate reused across lemmas.
 * Compared after trim, lowercase and a dropped final period.
 */
export const PLACEHOLDER_GLOSS_RE = /^(?:lo si fa|un uomo (?:lo fa|parla)|la gente lo hace)(?![\p{L}\p{N}])/iu

export function isPlaceholderGloss(gloss: string): boolean {
  return PLACEHOLDER_GLOSS_RE.test(glossKey(gloss))
}
/** One gloss text on this many lemmas of one pack is boilerplate. Legit max today is 3 (EN A1 "a young person"). */
export const BOILERPLATE_MIN = 4
/**
 * Grandfathered DE/ES boilerplate from before #178, capped at today's counts so
 * it can only shrink. Remove an entry when that pack is regenerated.
 */
export const BOILERPLATE_BASELINE: Record<string, Record<string, number>> = {
  'es/a1.json': { 'la gente lo hace': 25, 'un adjetivo del vocabulario inicial': 10 },
  'es/a2.json': { 'la gente lo hace': 6, 'un adjetivo del vocabulario inicial': 4 },
  'es/b1.json': {
    'un verbo frecuente en frases sencillas': 22,
    'un adjetivo del vocabulario inicial': 22,
    'un adjetivo de 6 letras para cualidades': 6,
    'un verbo de 6 letras para acciones cotidianas': 5,
    'un adjetivo de 5 letras para cualidades': 5,
    'un verbo de 9 letras para acciones cotidianas': 4,
    'un adjetivo de 8 letras para cualidades': 4,
    'un verbo de 8 letras para acciones cotidianas': 4,
  },
  'de/a1.json': { 'ein umstandswort in einfachen lerner-sätzen': 14, 'ein adjektiv für einfache beschreibungen': 5 },
  'de/a2.json': { 'ein umstandswort in einfachen lerner-sätzen': 17, 'ein adjektiv für einfache beschreibungen': 12 },
  'de/b1.json': { 'ein umstandswort in einfachen lerner-sätzen': 23, 'ein adjektiv für einfache beschreibungen': 9 },
}

export function glossKey(gloss: string): string {
  return gloss.normalize('NFC').trim().toLowerCase().replace(/\.$/, '')
}

/** Errors for placeholder glosses and any gloss text reused on BOILERPLATE_MIN+ lemmas. */
export function boilerplateGlossErrors(
  rel: string,
  lemmas: readonly { word: string; gloss?: string }[],
  baseline: Record<string, Record<string, number>> = BOILERPLATE_BASELINE,
): string[] {
  const allowed = baseline[rel] ?? {}
  const counts = new Map<string, string[]>()
  for (const L of lemmas) {
    const k = glossKey(L.gloss ?? '')
    counts.set(k, [...(counts.get(k) ?? []), L.word])
  }
  const errors: string[] = []
  for (const [k, words] of counts) {
    if (words.length <= (allowed[k] ?? 0)) continue
    if (isPlaceholderGloss(k)) {
      errors.push(`${rel}: placeholder gloss "${k}" on ${words.join(', ')}`)
    } else if (words.length >= BOILERPLATE_MIN) {
      errors.push(`${rel}: boilerplate gloss "${k}" reused on ${words.length} lemmas (${words.slice(0, 5).join(', ')}…)`)
    }
  }
  return errors
}

/** #179 C1: stem length for the transparent-form gate (ADR 0023). */
export function stemOf(lemma: string): string {
  const w = foldWord(lemma)
  if (w.length < 4) return ''
  return w.slice(0, w.length <= 5 ? 4 : 5)
}

function foldWord(s: string): string {
  return s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()
}

/** Short function words whose stem may sit inside a lemma by chance. */
export const STEM_TOKEN_IGNORE: ReadonlySet<string> = new Set([
  'para', 'pour', 'plus', 'over', 'uber', 'fino', 'antes', 'tras', 'cima', 'pres',
])

/**
 * Tokens of text that share a stem with the lemma (a transparent form, ADR 0023):
 * the token contains the lemma's stem, or the lemma contains the token's stem.
 */
export function stemSpoilerTokens(text: string, lemma: string): string[] {
  const w = foldWord(lemma)
  const stem = stemOf(lemma)
  return (foldWord(text).match(/\p{L}+/gu) ?? []).filter((t) => {
    if (STEM_TOKEN_IGNORE.has(t)) return false
    if (stem && t.includes(stem)) return true
    const ts = stemOf(t)
    return ts.length > 0 && w.includes(ts)
  })
}

/**
 * Grandfathered stem spoilers per pack (lemma words), from before #179. Shrink-only:
 * a listed lemma that no longer leaks fails too, so the entry gets deleted.
 * IT has no entries; every IT pack must be clean.
 */
export type StemBaseline = Record<string, readonly string[]>

export function stemSpoilerErrors(
  rel: string,
  lemmas: readonly { word: string; gloss?: string; synonyms?: readonly string[] }[],
  baseline: StemBaseline,
): string[] {
  const allowed = new Set(baseline[rel] ?? [])
  const errors: string[] = []
  const seen = new Set<string>()
  for (const L of lemmas) {
    const texts = [L.gloss ?? '', ...(L.synonyms ?? [])]
    const hits = texts.filter((t) => stemSpoilerTokens(t, L.word).length > 0)
    if (!hits.length) continue
    seen.add(L.word)
    if (!allowed.has(L.word)) {
      errors.push(`${rel}: stem spoiler (ADR 0023) — "${L.word}" shares a stem with "${hits[0]}"`)
    }
  }
  for (const w of allowed) {
    if (!seen.has(w)) errors.push(`${rel}: stale stem-spoiler baseline entry "${w}" — remove it`)
  }
  return errors
}
