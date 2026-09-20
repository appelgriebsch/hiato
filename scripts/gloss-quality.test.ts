import { describe, expect, test } from 'bun:test'
import {
  englishGlossByMembership,
  isEnglishShapedGloss,
  isTemplateGloss,
  isWrongLanguageGloss,
} from './gloss-quality'

describe('isEnglishShapedGloss', () => {
  test('flags English infinitive and article openers', () => {
    expect(isEnglishShapedGloss('to make sounds showing amusement')).toBe(true)
    expect(isEnglishShapedGloss('the highest quality option')).toBe(true)
    expect(isEnglishShapedGloss('an expression of gratitude')).toBe(true)
  })

  test('flags English someone/something frames', () => {
    expect(isEnglishShapedGloss('give something to someone')).toBe(true)
    expect(
      isEnglishShapedGloss('a manner or method of doing something'),
    ).toBe(true)
  })

  test('keeps PT/DE article-a glosses that are not English frames', () => {
    expect(isEnglishShapedGloss('a pequena distância.')).toBe(false)
    expect(isEnglishShapedGloss('a mais recente ou final.')).toBe(false)
    expect(isEnglishShapedGloss('An einem Ort verweilen.')).toBe(false)
    expect(isEnglishShapedGloss('An der Reihe.')).toBe(false)
    expect(isEnglishShapedGloss('An allen möglichen Orten.', 'de')).toBe(false)
    expect(isEnglishShapedGloss('Erwachsene weibliche Person.')).toBe(false)
    expect(isEnglishShapedGloss('Un lugar donde se duerme.')).toBe(false)
  })

  test('DE leading "a " is English (German does not use that article)', () => {
    expect(
      isEnglishShapedGloss('a solemn promise sworn before a court', 'de'),
    ).toBe(true)
    expect(isEnglishShapedGloss('a pequena distância.', 'pt')).toBe(false)
  })
})

describe('isWrongLanguageGloss', () => {
  test('never flags EN packs (English is the pack language)', () => {
    expect(isWrongLanguageGloss('en', 'to move fast on foot')).toBe(false)
  })

  test('flags English copy in DE/ES/PT', () => {
    expect(isWrongLanguageGloss('de', 'to feel or show happiness')).toBe(true)
    expect(isWrongLanguageGloss('es', 'to move fast on foot')).toBe(true)
    expect(isWrongLanguageGloss('pt', 'to stop activity and relax.')).toBe(
      true,
    )
  })

  test('keeps same-language learner copy', () => {
    expect(isWrongLanguageGloss('de', 'An einem Ort verweilen.')).toBe(false)
    expect(isWrongLanguageGloss('pt', 'A parte do corpo no fim do braço.')).toBe(
      false,
    )
  })
})

describe('englishGlossByMembership', () => {
  const en = new Set(['state', 'rest', 'when', 'eyes', 'closed', 'mind', 'awake'])
  const es = new Set(['lugar', 'donde', 'duerme'])
  const isWord = (lang: 'en' | 'de' | 'es' | 'pt', word: string) => {
    const w = word.toLowerCase()
    if (lang === 'en') return en.has(w)
    if (lang === 'es') return es.has(w)
    return false
  }

  test('flags English-majority tokens in an ES gloss', () => {
    expect(
      englishGlossByMembership(
        'es',
        'a state of rest when the eyes are closed',
        isWord,
      ),
    ).toBe(true)
  })

  test('keeps Spanish-majority tokens', () => {
    expect(
      englishGlossByMembership('es', 'Un lugar donde se duerme.', isWord),
    ).toBe(false)
  })
})

describe('isTemplateGloss', () => {
  test('still flags letter-count templates', () => {
    expect(isTemplateGloss('Classroom noun (5 letters)')).toBe(true)
    expect(isTemplateGloss('An einem Ort verweilen.')).toBe(false)
  })
})
