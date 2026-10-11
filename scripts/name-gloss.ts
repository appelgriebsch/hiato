/** Detect learner glosses that treat the lemma as a person name. */

const PT = /nome\s+pr[oó]prio|\bsobrenome\b/i
const ES = /nombre\s+propio|\bapellidos?\b/i
const DE = /\bvornamen?\b|\bnachnamen?\b|\bfamiliennamen?\b/i
const FR =
  /\bpr[eé]noms?\b|\bnom de famille\b|\bnoms? propres?\b|\bdiminutifs?\b|\bsurnoms?\b|\bpetit nom\b|\bnom d['’](?:homme|femme)\b|\bnom (?:féminin|masculin)\b|\bforme (?:féminine|masculine|abrégée|familière|irlandaise)\b|\bvariante féminine\b|\bune jeune femme\b/i
// Case-sensitive: "variante de Stéphane" is a name; "variante de dialecte" is not.
const FR_VARIANT = /\bvariante de\s+\p{Lu}/u
// Bare identity glosses only. A longer gloss that mentions homme or fille
// (MARI, AMIE, AMOUR) stays a common noun.
const FR_BARE_PERSON =
  /^(?:un |une )?(?:garçon|jeune fille|jeune femme|homme(?: italien)?|femme(?: biblique)?)\.?$/i
const IT =
  /\bcognome\b|\bnome proprio\b|\bnomi propri\b|\bnome di battesimo\b|\bnome di persona\b|\bprenome\b/i
// A named individual: role word straight after an origin/genre qualifier
// ("un prophète biblique", "dirigeant soviétique"). Fails without the
// name list. Plain role glosses (OGRE, DIVA, FRAPPEUR) stay common nouns.
const FR_PERSON_ROLE =
  '(?:personnage|personnalité|dirigeante?|prophète|déesse|acteur|actrice|chanteur|chanteuse|peintre|écrivaine?|roi|reine|poète|empereur|homme politique)s?'
const FR_PERSON_ORIGIN =
  '(?:historiques?|de bande dessinée|de fiction|bibliques?|hébr(?:eu|eux|aïque)s?|nordiques?|grec(?:que)?s?|romaine?s?|latine?s?|soviétiques?|russes?|allemande?s?|américaine?s?|française?s?|belges?|italien(?:ne)?s?|anglaise?s?|britanniques?|espagnole?s?|égyptien(?:ne)?s?|perse?s?)'
const FR_ARTICLE = '(?:(?:un|une|le|la|l[’\'])\\s*)?'
const FR_PERSON = new RegExp(
  `(?<!\\p{L})${FR_ARTICLE}${FR_PERSON_ROLE} ${FR_PERSON_ORIGIN}(?!\\p{L})`,
  'iu',
)
// "roi de France": "de" + a capitalised place. Case-sensitive on purpose, so
// "reine de beauté" and "acteur de théâtre" stay common nouns.
const FR_PERSON_OF_PLACE = new RegExp(
  `(?<!\\p{L})${FR_ARTICLE}${FR_PERSON_ROLE} (?:de |d[’'])\\p{Lu}`,
  'u',
)
// A deity "of" something names one figure ("déesse de l'amour").
const FR_DEITY = /(?<!\p{L})(?:déesses?|dieux?) (?:de|du|des|d[’'])(?!\p{L})/iu

/** FR glosses that name one specific person, even off lemma-names.txt. */
export function isFrPersonGloss(gloss: string | undefined | null): boolean {
  if (!gloss) return false
  const g = gloss.normalize('NFC')
  return FR_PERSON.test(g) || FR_PERSON_OF_PLACE.test(g) || FR_DEITY.test(g)
}

const EN_NAME =
  /\b(?:given name|first name|surname|last name|family name)\b/i
const EN_PROPER = /\bproper names?\b/i
const EN_PERSON = /\bpersons?\b/i

export function isPersonNameGloss(
  gloss: string | undefined | null,
  lang: string,
): boolean {
  if (!gloss || !gloss.trim()) return false
  const g = gloss.normalize('NFC')
  const code = lang.trim().toLowerCase()
  if (code === 'pt') return PT.test(g)
  if (code === 'es') return ES.test(g)
  if (code === 'de') return DE.test(g)
  if (code === 'fr') {
    return FR.test(g) || FR_VARIANT.test(g) || FR_BARE_PERSON.test(g.trim())
  }
  if (code === 'it') return IT.test(g)
  if (code === 'en') {
    if (EN_NAME.test(g)) return true
    return EN_PROPER.test(g) && EN_PERSON.test(g)
  }
  return (
    PT.test(g) ||
    ES.test(g) ||
    DE.test(g) ||
    FR.test(g) ||
    IT.test(g) ||
    EN_NAME.test(g) ||
    (EN_PROPER.test(g) && EN_PERSON.test(g))
  )
}
