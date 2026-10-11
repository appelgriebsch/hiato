import { describe, expect, test } from 'bun:test'
import { isPersonNameGloss } from './name-gloss'

describe('isPersonNameGloss', () => {
  test('drops person-name glosses', () => {
    expect(isPersonNameGloss('Nome próprio masculino.', 'pt')).toBe(true)
    expect(isPersonNameGloss('nome próprio ou sobrenome.', 'pt')).toBe(true)
    expect(isPersonNameGloss('nombre propio de persona', 'es')).toBe(true)
    expect(isPersonNameGloss('apellido de origen inglés.', 'es')).toBe(true)
    expect(isPersonNameGloss('männlicher Vorname.', 'de')).toBe(true)
    expect(isPersonNameGloss('Kleiner Ort oder Nachname.', 'de')).toBe(true)
    expect(isPersonNameGloss('a given name used in English', 'en')).toBe(true)
    expect(isPersonNameGloss('Un prénom masculin.', 'fr')).toBe(true)
    expect(isPersonNameGloss('nom de famille courant.', 'fr')).toBe(true)
    expect(isPersonNameGloss('Un nom propre de personne.', 'fr')).toBe(true)
    expect(isPersonNameGloss('un diminutif masculin familier', 'fr')).toBe(true)
    expect(isPersonNameGloss('un surnom masculin courant', 'fr')).toBe(true)
    expect(isPersonNameGloss("un petit nom d'homme", 'fr')).toBe(true)
    expect(isPersonNameGloss('nom féminin d’origine latine', 'fr')).toBe(true)
    expect(isPersonNameGloss('forme féminine familière de Catherine', 'fr')).toBe(
      true,
    )
    expect(isPersonNameGloss('variante de Stéphane', 'fr')).toBe(true)
    expect(isPersonNameGloss('un garçon', 'fr')).toBe(true)
    expect(isPersonNameGloss('une jeune fille', 'fr')).toBe(true)
    expect(isPersonNameGloss('un homme', 'fr')).toBe(true)
    expect(isPersonNameGloss('homme', 'fr')).toBe(true)
    expect(isPersonNameGloss('femme', 'fr')).toBe(true)
    expect(isPersonNameGloss('une femme', 'fr')).toBe(true)
    expect(isPersonNameGloss('un homme italien', 'fr')).toBe(true)
    expect(isPersonNameGloss('une jeune femme', 'fr')).toBe(true)
    expect(
      isPersonNameGloss(
        'une jeune femme souvent présente dans des récits',
        'fr',
      ),
    ).toBe(true)
    expect(isPersonNameGloss('Un nome proprio maschile.', 'it')).toBe(true)
    expect(isPersonNameGloss('Un cognome italiano.', 'it')).toBe(true)
    expect(isPersonNameGloss('Nome di persona.', 'it')).toBe(true)
    expect(isPersonNameGloss('proper name of a person', 'en')).toBe(true)
  })

  test('keeps common-noun glosses (vontade / marca)', () => {
    expect(isPersonNameGloss('vontade', 'pt')).toBe(false)
    expect(isPersonNameGloss('marca', 'pt')).toBe(false)
    expect(isPersonNameGloss('Frühere deutsche Währungseinheit.', 'de')).toBe(
      false,
    )
    expect(isPersonNameGloss('written request for payment', 'en')).toBe(false)
    expect(isPersonNameGloss('flor perfumada de cores variadas.', 'pt')).toBe(
      false,
    )
    expect(isPersonNameGloss('Un fruit à noyau.', 'fr')).toBe(false)
    expect(isPersonNameGloss('Une pierre, un caillou.', 'fr')).toBe(false)
    expect(isPersonNameGloss('un homme aime une femme', 'fr')).toBe(false)
    expect(isPersonNameGloss("une fille que l'on aime bien", 'fr')).toBe(false)
    expect(isPersonNameGloss('femme qui règne sur un royaume.', 'fr')).toBe(false)
    expect(
      isPersonNameGloss('Jeune femme, dans un registre familier.', 'fr'),
    ).toBe(false)
    expect(isPersonNameGloss('variante de dialecte chinois', 'fr')).toBe(false)
    expect(isPersonNameGloss('Un frutto con il nocciolo.', 'it')).toBe(false)
    expect(isPersonNameGloss('Il nome della città.', 'it')).toBe(false)
  })
})
