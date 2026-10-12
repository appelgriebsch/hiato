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
 * #184 W4: lemma/token pairs (folded) that share letters but not a root.
 * shortcut: hand-kept list; extend it when a false pair is found in review.
 */
export const STEM_UNRELATED: ReadonlySet<string> = new Set([
  'contrat:contre', 'tempete:temps', 'carton:carte', 'pontife:pont',
  'perseverer:persister', // per-severus vs per-sistere
  'austere:stern', // #188: austerus vs sterne
  // #191 W4: shared Latin prefix, different roots
  'complex:complicated', 'commission:committee', 'compress:compact', 'splatter:splash', 'interject:interrupt',
  // #192: pre-sentire vs prae-sagire, com-patre vs com-panis, per-severus vs per-sistere
  'presentir:presagiar', 'compadre:companero', 'perseverar:persistir',
])

/**
 * Tokens of text that share a stem with the lemma (a transparent form, ADR 0023):
 * the token contains the lemma's stem, or the lemma contains the token's stem.
 */
export function stemSpoilerTokens(text: string, lemma: string): string[] {
  const w = foldWord(lemma)
  const stem = stemOf(lemma)
  return (foldWord(text).match(/\p{L}+/gu) ?? []).filter((t) => {
    // #184 W2: the ignore list never hides the lemma's own root (POURQUOI "pour", PRESQUE "près").
    if (STEM_TOKEN_IGNORE.has(t) && !w.startsWith(t)) return false
    if (STEM_UNRELATED.has(`${w}:${t}`)) return false
    // Tessa 69a77e4: an accent variant of a short lemma (FIO "fío", ATE "até") is the answer.
    if (t === w) return true
    if (stem && t.includes(stem)) return true
    // #184 W2: a 4-letter shared prefix gives 6+ letter lemmas away (MARIER "mariage").
    if (w.length >= 6 && t.length >= 4 && t.slice(0, 4) === w.slice(0, 4)) return true
    const ts = stemOf(t)
    return ts.length > 0 && w.includes(ts)
  })
}

/**
 * Grandfathered stem spoilers per pack, from before #179: lemma → the exact
 * leaking tokens (folded). Shrink-only: a new leaking token on a listed lemma
 * fails (#184 W3), and a listed token that no longer leaks fails as stale.
 * FR, IT, EN, ES, PT and DE have no entries (#181, #188, #185, #186, #187); every pack must be clean.
 */
export type StemBaseline = Record<string, Record<string, readonly string[]>>

/** Folded leaking tokens of one lemma across its gloss and chips, sorted and unique. */
export function stemSpoilerLeaks(L: { word: string; gloss?: string; synonyms?: readonly string[] }): string[] {
  const texts = [L.gloss ?? '', ...(L.synonyms ?? [])]
  return [...new Set(texts.flatMap((t) => stemSpoilerTokens(t, L.word)))].sort()
}

export function stemSpoilerErrors(
  rel: string,
  lemmas: readonly { word: string; gloss?: string; synonyms?: readonly string[] }[],
  baseline: StemBaseline,
): string[] {
  const allowed = baseline[rel] ?? {}
  const errors: string[] = []
  const live = new Map<string, Set<string>>()
  for (const L of lemmas) {
    const leaks = stemSpoilerLeaks(L)
    if (!leaks.length) continue
    live.set(L.word, new Set(leaks))
    const ok = new Set(allowed[L.word] ?? [])
    const fresh = leaks.filter((t) => !ok.has(t))
    if (fresh.length) {
      errors.push(`${rel}: stem spoiler (ADR 0023) — "${L.word}" leaks via "${fresh.join('", "')}"`)
    }
  }
  for (const [w, toks] of Object.entries(allowed)) {
    for (const t of toks) {
      if (!live.get(w)?.has(t)) errors.push(`${rel}: stale stem-spoiler baseline entry "${w}: ${t}" — remove it`)
    }
  }
  return errors
}
