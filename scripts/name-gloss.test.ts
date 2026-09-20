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
  })
})
