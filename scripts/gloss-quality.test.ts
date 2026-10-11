import { describe, expect, test } from 'bun:test'
import {
  BOILERPLATE_MIN,
  boilerplateGlossErrors,
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

  test('narrows short English frames without rejecting romance articles', () => {
    expect(isEnglishShapedGloss('a mistake', 'pt')).toBe(true)
    expect(isEnglishShapedGloss('a bullfighter', 'es')).toBe(false)
    expect(isEnglishShapedGloss('a pequena distância.', 'pt')).toBe(false)
    expect(isEnglishShapedGloss('ready for use', 'pt')).toBe(true)
    expect(isEnglishShapedGloss('official in charge', 'pt')).toBe(true)
    expect(isEnglishShapedGloss('father', 'pt')).toBe(true)
    expect(isEnglishShapedGloss('usual or regular', 'pt')).toBe(true)
  })

  test('keeps PT/DE article-a glosses that are not English frames', () => {
    expect(isEnglishShapedGloss('a pequena distância.')).toBe(false)
    expect(isEnglishShapedGloss('a mais recente ou final.')).toBe(false)
    expect(isEnglishShapedGloss('An einem Ort verweilen.')).toBe(false)
    expect(isEnglishShapedGloss('An der Reihe.')).toBe(false)
    expect(isEnglishShapedGloss('An allen möglichen Orten.', 'de')).toBe(false)
    expect(isEnglishShapedGloss('an diesen Ort oder diese Stelle.')).toBe(false)
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
    expect(isWrongLanguageGloss('fr', 'to move fast on foot')).toBe(true)
    expect(isWrongLanguageGloss('fr', 'Un lieu où l’on dort.')).toBe(false)
    expect(isWrongLanguageGloss('it', 'to move fast on foot')).toBe(true)
    expect(isWrongLanguageGloss('it', 'Un luogo dove si dorme.')).toBe(false)
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
  const isWord = (lang: 'en' | 'de' | 'es' | 'pt' | 'fr' | 'it', word: string) => {
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

describe('boilerplateGlossErrors (#178)', () => {
  const L = (word: string, gloss: string) => ({ word, gloss })
  test('fails a placeholder gloss even once', () => {
    expect(boilerplateGlossErrors('it/a1.json', [L('DARE', 'lo si fa'), L('FARE', 'compiere')], {})).toHaveLength(1)
    expect(boilerplateGlossErrors('it/a1.json', [L('DOMANDA', 'un uomo parla.')], {})).toHaveLength(1)
    expect(boilerplateGlossErrors('es/a1.json', [L('HACER', 'La gente lo hace')], {})).toHaveLength(1)
  })
  test('fails one text reused on BOILERPLATE_MIN lemmas', () => {
    const many = ['A', 'B', 'C', 'D'].map((w) => L(`${w}AA`, 'una donna che si chiama così'))
    expect(BOILERPLATE_MIN).toBe(4)
    expect(boilerplateGlossErrors('it/b2.json', many, {})).toHaveLength(1)
    expect(boilerplateGlossErrors('it/b2.json', many.slice(0, 3), {})).toHaveLength(0)
  })
  test('baseline caps grandfathered boilerplate at its count', () => {
    const base = { 'de/a1.json': { 'ein adjektiv': 2 } }
    expect(boilerplateGlossErrors('de/a1.json', [L('ROT', 'Ein Adjektiv.'), L('BLAU', 'ein adjektiv')], base)).toHaveLength(0)
    expect(boilerplateGlossErrors('de/a1.json', [L('ROT', 'ein adjektiv'), L('BLAU', 'ein adjektiv'), L('GRÜN', 'ein adjektiv')], base)).toHaveLength(0)
    const four = ['ROT', 'BLAU', 'GRÜN', 'GELB'].map((w) => L(w, 'ein adjektiv'))
    expect(boilerplateGlossErrors('de/a1.json', four, base)).toHaveLength(1)
  })
  test('every shipped pack passes', async () => {
    const { readdirSync, readFileSync } = await import('node:fs')
    const root = `${import.meta.dir}/../public/packs`
    for (const lang of readdirSync(root)) for (const f of readdirSync(`${root}/${lang}`)) {
      const pack = JSON.parse(readFileSync(`${root}/${lang}/${f}`, 'utf8'))
      expect(boilerplateGlossErrors(`${lang}/${f}`, pack.lemmas)).toEqual([])
    }
  })
})
