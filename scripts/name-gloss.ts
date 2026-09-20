/** Detect learner glosses that treat the lemma as a person name. */

const PT = /nome\s+pr[oó]prio|\bsobrenome\b/i
const ES = /nombre\s+propio|\bapellidos?\b/i
const DE = /\bvornamen?\b|\bnachnamen?\b|\bfamiliennamen?\b/i
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
  if (code === 'en') {
    if (EN_NAME.test(g)) return true
    return EN_PROPER.test(g) && EN_PERSON.test(g)
  }
  return (
    PT.test(g) ||
    ES.test(g) ||
    DE.test(g) ||
    EN_NAME.test(g) ||
    (EN_PROPER.test(g) && EN_PERSON.test(g))
  )
}
