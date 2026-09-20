/** Detect junk template glosses that must not ship (Ask Avery C2). */
export const TEMPLATE_GLOSS_RE =
  /Lernnomen|Anfängerunterricht|buchstabig|N-letter naming|sustantivo de \d+ letras|substantivo de \d+ letras|Classroom noun\s*\(|Nombre de clase|Nome de aula|\d+-letter (?:naming|action|describing) word|A concrete noun learners meet|Learner verb for simple|An adjective used in basic learner|A descriptive word for people, places|A small modifier learners practise|Ein anschauliches Hauptwort aus dem Anfänger|Ein häufiges Tun-Wort|Lernverb für kurze|Ein beschreibendes Wort aus dem Grundwortschatz|Ein kleines Wiewort|Un sustantivo concreto del nivel inicial|Verbo de aprendiz para|Una palabra descriptiva en oraciones básicas|Un modificador breve practicado|Um substantivo concreto do nível inicial|Verbo de aprendiz para diálogos|Uma palavra descritiva em frases básicas|Um modificador curto praticado|A useful word for everyday learner|Ein nützliches Wort für die tägliche|Una palabra útil para la práctica|Uma palavra útil para a prática/i

export function isTemplateGloss(gloss: string | undefined | null): boolean {
  if (!gloss || !gloss.trim()) return false
  return TEMPLATE_GLOSS_RE.test(gloss)
}
