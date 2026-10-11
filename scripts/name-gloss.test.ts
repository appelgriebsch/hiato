import { describe, expect, test } from 'bun:test'
import { isFrPersonGloss, isItNameOrPlaceGloss, isPersonNameGloss } from './name-gloss'

describe('isFrPersonGloss (#175)', () => {
  test('flags one named person', () => {
    for (const g of [
      'nom propre d’un dirigeant soviétique',
      'personnage historique allemand du XXe siècle',
      'personnage de bande dessinée belge',
      'un prophète biblique',
      'une déesse nordique de l’amour et de la beauté.',
      'une personnalité américaine',
      'acteur américain',
      'chanteuse française',
      'peintre français',
      'écrivain russe',
      'roi de France',
      'un prophète hébreu',
      'un poète italien auteur de la Divine Comédie', // DANTE
      'poète latin',
      'reine d’Angleterre',
      'pharaon et roi égyptien',
      'déesse de l’amour',
      "déesse de l'amour",
      'homme politique américain',
      'empereur romain',
    ]) expect(isFrPersonGloss(g)).toBe(true)
  })
  test('keeps role-word lemmas', () => {
    for (const g of [
      'Personnage cruel qui dévore les humains.', // OGRE
      'chanteuse lyrique célèbre et exigeante', // DIVA
      'joueur qui frappe la balle au baseball.', // FRAPPEUR
      'petit oiseau chanteur des champs.', // ALOUETTE
      'partie consciente de la personnalité.', // EGO
      'grande ville dirigeant une région', // MÉTROPOLE
      'acteur de théâtre',
      'peintre de bâtiment',
      'reine de beauté',
      'chanteur d’opéra',
      'chanteur de rock',
    ]) expect(isFrPersonGloss(g)).toBe(false)
  })
})

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

describe('isItNameOrPlaceGloss (#178)', () => {
  test('flags named people and places', () => {
    for (const g of [
      'una donna che si chiama così', // SUZANNE, VALENTINA
      'Forma femminile del nome mago.', // MAGDA
      'un nome proprio di persona', // SIMO
      'un generale tedesco noto per le campagne in Africa', // ROMMEL
      'compositore austriaco di musica classica.', // SCHUBERT
      'filosofo tedesco del Settecento', // KANT
      're di Francia',
      'regina d’Inghilterra',
      'attrice americana',
      'Grande paese dell’Asia meridionale.', // INDIA
      'Stato dell’Europa occidentale con capitale Parigi.', // FRANCIA
      'la capitale della Turchia', // ANKARA
      'Città della Scozia situata sulle rive del fiume Clyde.', // GLASGOW
      'città brasiliana affacciata sull’oceano', // JANEIRO
      "isola dell'oceano Indiano nota per il tè", // LANKA
      'arcipelago dell’Asia sud-orientale', // FILIPPINE
      'uno stato del Caucaso', // GEORGIA
    ]) expect(isItNameOrPlaceGloss(g)).toBe(true)
  })
  test('keeps role-word and place-word common nouns', () => {
    for (const g of [
      'persona che vende fiori e piante', // FIORAIO
      'parte di una città', // QUARTIERE
      'centro grande con molte strade e case', // CITTÀ
      'piccolo centro con poche case', // PAESE
      'cantante d’opera',
      'attore di teatro',
      'regina di bellezza',
      'uno stato d’animo',
      'capo del comune', // SINDACO
      'lingua parlata a Londra e negli Stati Uniti', // INGLESE
      'relativo alla Germania o alla sua lingua', // TEDESCO
      'seguace di una chiesa protestante nata nel Settecento', // METODISTA
      'detto di lettera grande, come quella all’inizio della frase', // MAIUSCOLO
    ]) expect(isItNameOrPlaceGloss(g)).toBe(false)
  })
})

describe('IT gate widening (#179 W2, W3)', () => {
  test('period names after "di" are not people or places', () => {
    for (const g of [
      'pittore del Novecento',
      'poeta del Rinascimento',
      're del Medioevo',
      "scrittore dell'Ottocento",
      'filosofo del Settecento',
      'cantante del Duemila',
    ]) expect(isItNameOrPlaceGloss(g)).toBe(false)
  })
  test('nationalities and deities flag', () => {
    for (const g of [
      'pittore fiammingo',
      'scrittore olandese',
      'santo svizzero',
      're polacco',
      'dio della guerra',
      "dea dell'amore",
    ]) expect(isItNameOrPlaceGloss(g)).toBe(true)
  })
  test('dropped IT proper nouns are denylisted whatever the gloss', async () => {
    const { isDeniedLemma } = await import('./lemma-denylist')
    for (const w of ['FRANCIA', 'INDIA', 'ANKARA', 'SUZANNE', 'VALENTINA', 'VILMA', 'KANT'])
      expect(isDeniedLemma(w, undefined, 'it')).toBe(true)
    expect(isDeniedLemma('FRANCIA', undefined, 'es')).toBe(false)
    expect(isDeniedLemma('ROSA', undefined, 'it')).toBe(false)
  })
})
