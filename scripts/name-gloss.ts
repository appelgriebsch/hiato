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
  '(?:personnage|personnalité|détective|héros|héroïne|dirigeante?|prophète|déesse|acteur|actrice|chanteur|chanteuse|peintre|écrivaine?|roi|reine|poète|empereur|homme politique)s?'
const FR_PERSON_ORIGIN =
  '(?:historiques?|de bande dessinée|de fiction|fictif|fictive|fictifs|fictives|bibliques?|hébr(?:eu|eux|aïque)s?|nordiques?|grec(?:que)?s?|romaine?s?|latine?s?|soviétiques?|russes?|africaine?s?|asiatiques?|européen(?:ne)?s?|nationale?s?|nationaux|allemande?s?|américaine?s?|française?s?|belges?|italien(?:ne)?s?|anglaise?s?|britanniques?|espagnole?s?|égyptien(?:ne)?s?|perse?s?)'
const FR_ARTICLE = '(?:(?:un|une|le|la|l[’\'])\\s*)?'
const FR_PERSON = new RegExp(
  `(?<!\\p{L})${FR_ARTICLE}${FR_PERSON_ROLE} ${FR_PERSON_ORIGIN}(?!\\p{L})`,
  'iu',
)
// "roi de France": "de" + a capitalised place. Case-sensitive on purpose, so
// "reine de beauté" and "acteur de théâtre" stay common nouns.
const FR_PERSON_OF_PLACE = new RegExp(
  `(?<!\\p{L})${FR_ARTICLE}${FR_PERSON_ROLE} (?:de (?:roman|film|série|conte)s? )?(?:de |d[’'])\\p{Lu}`,
  'u',
)
// A deity "of" something names one figure ("déesse de l'amour").
const FR_DEITY = /(?<!\p{L})(?:déesses?|dieux?) (?:de|du|des|d[’'])(?!\p{L})/iu

// #184 W4: "prénom féminin" names one person, even off lemma-names.txt.
// Start-anchored: "diminutif d'un prénom" is the list-gated FR rule's job, not this one.
const FR_PRENOM = /^(?:un |le )?pr[eé]noms?(?!\p{L})/iu
// #180: "créé par Conan Doyle" credits one fictional figure to its author.
const FR_CREATED_BY = /(?<!\p{L})créée?s? par \p{Lu}/u
// #180 CUBA: the gloss is a named place, "grande île des Caraïbes", "ville de Belgique".
// Start-anchored so demonyms ("originaire de la région de Flandre") stay; case-sensitive
// on the name, so "île de sable" and "pays de cocagne" stay common nouns.
const FR_PLACE = new RegExp(
  `^${FR_ARTICLE}(?:(?:grande?|petite?|ancienne?|vieille|vieux) )?(?:île|ville|pays|région|capitale|fleuve|rivière|archipel|province|nation|lac|mont|montagne|continent|état)s? (?:(?:(?:du |de l[’'])?(?:nord|sud|est|ouest|centre) )?(?:de|du|des|d[’'])\\s*(?:la |l[’'])?\\p{Lu}|${FR_PERSON_ORIGIN}(?!\\p{L}))`,
  'u',
)

/** FR glosses that name one specific person or place, even off lemma-names.txt. */
export function isFrPersonGloss(gloss: string | undefined | null): boolean {
  if (!gloss) return false
  const g = gloss.normalize('NFC')
  // #184 W3: fold only the first letter, so "Île des Caraïbes" fails like "île des Caraïbes".
  const h = g.charAt(0).toLowerCase() + g.slice(1)
  return (
    FR_PERSON.test(g) || FR_PERSON_OF_PLACE.test(g) || FR_DEITY.test(g) ||
    FR_CREATED_BY.test(g) || FR_PLACE.test(h) || FR_PRENOM.test(g)
  )
}

// IT #178: a named individual or a named place, even off lemma-names.txt.
// Role/place word + origin adjective ("generale tedesco", "città brasiliana")
// or + "di/del/della <Capitalised>" ("capitale della Turchia"). Plain role
// glosses ("persona che vende fiori", "parte di una città") stay common nouns.
const IT_PERSON_ROLE =
  '(?:personaggio|attore|attrice|cantante|scrittore|scrittrice|poeta|poetessa|pittore|pittrice|compositore|filosofo|generale|re|regina|imperatore|imperatrice|principe|principessa|santo|santa|dio|dea|uomo politico|politico|presidente)'
const IT_PLACE =
  '(?:città|cittadina|paese|stato|regione|capitale|fiume|isola|arcipelago|provincia|nazione|lago|monte)'
const IT_ORIGIN =
  '(?:storic[oaie]|biblic[oaie]|greco|greca|grec[ih]e|romano|romana|roman[ie]|latino|latina|tedesc[oa]|tedeschi|tedesche|austriac[oa]|frances[ei]|ingles[ei]|britannic[oa]|american[oaie]|italian[oaie]|spagnol[oaie]|russ[oaie]|europe[oaie]|asiatic[oa]|african[oaie]|brasilian[oaie]|cines[ei]|giappones[ei]|indian[oaie]|turc[oa]|egizi[oa]|ebre[oa]|arab[oa]|scozzes[ei]|irlandes[ei]|ottoman[oa]|sovietic[oa]|fiamming(?:o|a|hi|he)|olandes[ei]|svizzer[oaie]|polacc(?:o|a|hi|he)|belg[aio]|portoghes[ei]|svedes[ei]|norveges[ei]|danes[ei]|ungheres[ei]|persian[oaie]|etrusc(?:o|a|hi|he))'
// Period names are capitalised but are not people or places (#179 W3).
const IT_PERIOD =
  '(?:Duecento|Trecento|Quattrocento|Cinquecento|Seicento|Settecento|Ottocento|Novecento|Duemila|Mille|Medioevo|Rinascimento|Risorgimento|Illuminismo|Romanticismo|Barocco|Rococò|Neolitico|Paleolitico)(?!\\p{L})'
const IT_OF = `(?:di|del|della|dello|dei|degli|delle|dell['’]|d['’])\\s*(?!${IT_PERIOD})\\p{Lu}`
// "dio della guerra", "dea dell'amore": one named deity (#179 W3).
const IT_DEITY = /(?<!\p{L})(?:dio|dea) (?:del|della|dello|dei|degli|delle|dell['’])\s*\p{L}/u
const IT_PERSON = new RegExp(
  `(?<!\\p{L})${IT_PERSON_ROLE} (?:${IT_ORIGIN}(?!\\p{L})|${IT_OF})`,
  'u',
)
const IT_PLACE_RE = new RegExp(
  `(?<!\\p{L})${IT_PLACE} (?:${IT_ORIGIN}(?!\\p{L})|${IT_OF}|dell['’]oceano)`,
  'u',
)
// "una donna che si chiama così", "forma femminile del nome mago".
const IT_BARE_NAME = /(?<!\p{L})si chiama così(?!\p{L})|(?<!\p{L})forma (?:femminile|maschile) del nome(?!\p{L})/iu

/** IT glosses that name one person or one place (#178). */
export function isItNameOrPlaceGloss(gloss: string | undefined | null): boolean {
  if (!gloss) return false
  const g = gloss.normalize('NFC')
  // Case-sensitive "di <Capitalised>"; only the gloss's first letter is folded.
  const h = g.charAt(0).toLowerCase() + g.slice(1)
  return IT.test(h) || IT_BARE_NAME.test(h) || IT_PERSON.test(h) || IT_PLACE_RE.test(h) || IT_DEITY.test(h)
}

// Tessa 69a77e4: ES/PT/DE glosses that name one place or one person, even off
// lemma-names.txt. Start-anchored like FR_PLACE; case-sensitive on the name, so
// "estado de proteção" and "Land, um das herum nur Meer ist" stay common nouns.
const IBERIAN_PLACE = new RegExp(
  `^(?:(?:una?|um|uma|el|la|o|a)\\s+)?(?:país|ciudad|cidade|capital|estado|región|região|isla|ilha|río|rio|provincia|província|reino)(?:\\s+\\p{Ll}+){0,4}?\\s+(?:de|del|da|do|dos|das|na|no|en|em)\\s+(?:(?:la|el|los|las|a|o|os|as)\\s+)?\\p{Lu}`,
  'u',
)
const ES_NAME = /nombre\s+propio|\bapellidos?\b/i
const PT_NAME = /nome\s+pr[oó]prio|\bsobrenome\b|\bapelido de família\b/i
const DE_NAME = /\bvornamen?\b|\bnachnamen?\b|\bfamiliennamen?\b|\beigennamen?\b/i
const DE_PLACE = new RegExp(
  `^(?:(?:eine?|die|der|das)\\s+)?(?:\\p{Ll}+(?:isch|iv)e[nrs]?\\s+(?:Stadt|Land|Insel|Welt|Region|Hauptstadt)|(?:Stadt|Land|Insel|Hauptstadt|Region|Fluss)\\s+(?:in|im|von|des|der|am)\\s+\\p{Lu})`,
  'u',
)

/** ES/PT/DE glosses that name one person or one place (Tessa 69a77e4). */
export function isNameOrPlaceGloss(gloss: string | undefined | null, lang: string): boolean {
  if (!gloss) return false
  const g = gloss.normalize('NFC')
  const h = g.charAt(0).toLowerCase() + g.slice(1)
  if (lang === 'es') return ES_NAME.test(h) || IBERIAN_PLACE.test(h)
  if (lang === 'pt') return PT_NAME.test(h) || IBERIAN_PLACE.test(h)
  if (lang === 'de') return DE_NAME.test(g) || DE_PLACE.test(h)
  return false
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
