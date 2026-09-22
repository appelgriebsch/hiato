/** Detect junk template glosses that must not ship (Ask Avery C2). */
export const TEMPLATE_GLOSS_RE =
  /Lernnomen|Anfängerunterricht|buchstabig|N-letter naming|sustantivo de \d+ letras|substantivo de \d+ letras|Classroom noun\s*\(|Nombre de clase|Nome de aula|\d+-letter (?:naming|action|describing) word|A concrete noun learners meet|Learner verb for simple|An adjective used in basic learner|A descriptive word for people, places|A small modifier learners practise|Ein anschauliches Hauptwort aus dem Anfänger|Ein häufiges Tun-Wort|Lernverb für kurze|Ein beschreibendes Wort aus dem Grundwortschatz|Ein kleines Wiewort|Un sustantivo concreto del nivel inicial|Verbo de aprendiz para|Una palabra descriptiva en oraciones básicas|Un modificador breve practicado|Um substantivo concreto do nível inicial|Verbo de aprendiz para diálogos|Uma palavra descritiva em frases básicas|Um modificador curto praticado|A useful word for everyday learner|Ein nützliches Wort für die tägliche|Una palabra útil para la práctica|Uma palavra útil para a prática/i

export function isTemplateGloss(gloss: string | undefined | null): boolean {
  if (!gloss || !gloss.trim()) return false
  return TEMPLATE_GLOSS_RE.test(gloss)
}

export type GlossLang = 'en' | 'de' | 'es' | 'pt'

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
  if (lang !== 'de' && lang !== 'es' && lang !== 'pt') return false
  if (isEnglishShapedGloss(gloss, lang)) return true
  if (isWordOfLang && englishGlossByMembership(lang, gloss, isWordOfLang)) {
    return true
  }
  return false
}
