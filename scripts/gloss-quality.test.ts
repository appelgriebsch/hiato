import { describe, expect, test } from 'bun:test'
import {
  BOILERPLATE_MIN,
  boilerplateGlossErrors,
  englishGlossByMembership,
  isEnglishShapedGloss,
  isPlaceholderGloss,
  stemOf,
  familyLeakErrors,
  familyLeakTokens,
  stemSpoilerErrors,
  stemSpoilerTokens,
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
    expect(boilerplateGlossErrors('it/a1.json', [L('DARE', 'lo si fa'), L('FARE', 'compiere')], {}).length).toBe(1)
    expect(boilerplateGlossErrors('it/a1.json', [L('DOMANDA', 'un uomo parla.')], {}).length).toBe(1)
    expect(boilerplateGlossErrors('es/a1.json', [L('HACER', 'La gente lo hace')], {}).length).toBe(1)
  })
  test('fails one text reused on BOILERPLATE_MIN lemmas', () => {
    const many = ['A', 'B', 'C', 'D'].map((w) => L(`${w}AA`, 'una donna che si chiama così'))
    expect(BOILERPLATE_MIN).toBe(4)
    expect(boilerplateGlossErrors('it/b2.json', many, {}).length).toBe(1)
    expect(boilerplateGlossErrors('it/b2.json', many.slice(0, 3), {}).length).toBe(0)
  })
  test('baseline caps grandfathered boilerplate at its count', () => {
    const base = { 'de/a1.json': { 'ein adjektiv': 2 } }
    expect(boilerplateGlossErrors('de/a1.json', [L('ROT', 'Ein Adjektiv.'), L('BLAU', 'ein adjektiv')], base).length).toBe(0)
    expect(boilerplateGlossErrors('de/a1.json', [L('ROT', 'ein adjektiv'), L('BLAU', 'ein adjektiv'), L('GRÜN', 'ein adjektiv')], base).length).toBe(0)
    const four = ['ROT', 'BLAU', 'GRÜN', 'GELB'].map((w) => L(w, 'ein adjektiv'))
    expect(boilerplateGlossErrors('de/a1.json', four, base).length).toBe(1)
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

describe('isPlaceholderGloss (#179 W1)', () => {
  test('start-anchored: extra words after a placeholder still fail', () => {
    for (const g of ['lo si fa spesso', 'Lo si fa con la mano.', 'un uomo parla forte', 'la gente lo hace mucho'])
      expect(isPlaceholderGloss(g)).toBe(true)
  })
  test('real glosses that merely contain the words pass', () => {
    for (const g of ['ciò che lo si fa notare', 'un uomo parlante', 'lo sifone'])
      expect(isPlaceholderGloss(g)).toBe(false)
  })
})

describe('stem spoiler gate (#179 C1)', () => {
  test('stem is 5 letters, 4 for lemmas of 5 or fewer, none under 4', () => {
    expect(stemOf('ATTENTO')).toBe('atten')
    expect(stemOf('CERTO')).toBe('cert')
    expect(stemOf('FOTO')).toBe('foto')
    expect(stemOf('RE')).toBe('')
  })
  test('flags transparent forms both ways', () => {
    expect(stemSpoilerTokens('che fa molta attenzione', 'ATTENTO')).toEqual(['attenzione'])
    expect(stemSpoilerTokens('senza nessuna incertezza', 'CERTO')).toEqual(['incertezza'])
    expect(stemSpoilerTokens('tempo della sera', 'SERATA')).toEqual(['sera'])
    expect(stemSpoilerTokens('vedere di nuovo', 'RIVEDERE')).toEqual(['vedere'])
    expect(stemSpoilerTokens('figura fatta con la fotografia', 'FOTO')).toEqual(['fotografia'])
    expect(stemSpoilerTokens('Città', 'CITTÀ')).toEqual(['citta'])
  })
  test('accent variants of short lemmas leak (Tessa 69a77e4)', () => {
    expect(stemSpoilerTokens('fío', 'FIO')).toEqual(['fio'])
    expect(stemSpoilerTokens('ves', 'VÊS')).toEqual(['ves'])
    expect(stemSpoilerTokens('até', 'ATE')).toEqual(['ate'])
    expect(stemSpoilerErrors('es/c2.json', [{ word: 'FIO', gloss: 'hilo', synonyms: ['fío'] }], {}).length).toBe(1)
    // An ignore-list function word that is the lemma still leaks (#200 review).
    expect(stemSpoilerTokens('pára', 'PARA')).toEqual(['para'])
    // A short lemma inside a longer word is not the answer.
    expect(stemSpoilerTokens('un tomate maduro', 'ATE')).toEqual([])
  })
  test('passes unrelated glosses and ignored function words', () => {
    expect(stemSpoilerTokens('le ore dopo cena', 'SERATA')).toEqual([])
    expect(stemSpoilerTokens('chiamare qualcuno con il cellulare', 'TELEFONARE')).toEqual([])
    expect(stemSpoilerTokens('para todos', 'SEPARAR')).toEqual([])
    expect(stemSpoilerTokens('para todos', 'PARAGUAS')).toEqual(['para']) // #184 W2: its own root
  })
  test('baseline is per pack and shrink-only', () => {
    const L = [{ word: 'SERATA', gloss: 'tempo della sera' }, { word: 'CASA', gloss: 'dove si abita' }]
    expect(stemSpoilerErrors('it/a2.json', L, {}).length).toBe(1)
    expect(stemSpoilerErrors('de/a2.json', L, { 'de/a2.json': { SERATA: ['sera'] } })).toEqual([])
    expect(stemSpoilerErrors('de/a2.json', L, { 'de/a2.json': { SERATA: ['sera'], CASA: ['casa'] } })[0]).toContain('stale')
  })
  test('#184 W3: a new leak on an exempted lemma still fails', () => {
    // #187: synthetic baseline, the shipped one no longer exempts DE.
    const L = [{ word: 'FAHREN', gloss: 'der Fahrer lenkt' }]
    const base = { 'de/a1.json': { FAHREN: ['fahrer'] } }
    expect(stemSpoilerErrors('de/a1.json', L, base)).toEqual([])
    const errs = stemSpoilerErrors('de/a1.json', [{ ...L[0], gloss: 'der Fahrer lenkt die Fahrt' }], base)
    expect(errs.length).toBe(1)
    expect(errs[0]).toContain('fahrt')
  })
  test('#192: an injected ES stem leak is caught', async () => {
    const { readFileSync } = await import('node:fs')
    const base = JSON.parse(readFileSync(`${import.meta.dir}/data/stem-spoiler-baseline.json`, 'utf8'))
    const pack = JSON.parse(readFileSync(`${import.meta.dir}/../public/packs/es/b1.json`, 'utf8'))
    expect(stemSpoilerErrors('es/b1.json', pack.lemmas, base)).toEqual([])
    const mutated = pack.lemmas.map((x: { word: string; gloss: string }) =>
      x.word === 'ABRAZAR' ? { ...x, gloss: 'dar un abrazo' } : x)
    const errs = stemSpoilerErrors('es/b1.json', mutated, base)
    expect(errs.length).toBe(1)
    expect(errs[0]).toContain('abrazo')
  })
  test('every shipped pack passes; no language has a baseline (#181, #188, #185, #186, #187)', async () => {
    const { readdirSync, readFileSync } = await import('node:fs')
    const base = JSON.parse(readFileSync(`${import.meta.dir}/data/stem-spoiler-baseline.json`, 'utf8'))
    expect(base).toEqual({})
    const root = `${import.meta.dir}/../public/packs`
    for (const lang of readdirSync(root)) for (const f of readdirSync(`${root}/${lang}`)) {
      const pack = JSON.parse(readFileSync(`${root}/${lang}/${f}`, 'utf8'))
      expect(stemSpoilerErrors(`${lang}/${f}`, pack.lemmas, base)).toEqual([])
    }
  })
})

describe('stem gate widening (#184 W2)', () => {
  test('#191: EN unrelated pairs pass, related ones still fail', () => {
    for (const [w, t] of [['COMPLEX', 'complicated'], ['COMMISSION', 'committee'], ['COMPRESS', 'compact'], ['SPLATTER', 'splash'], ['INTERJECT', 'interrupt']])
      expect(stemSpoilerTokens(t, w)).toEqual([])
    expect(stemSpoilerTokens('able', 'CAPABLE')).toEqual(['able'])
  })
  test('#184 W4: unrelated roots pass, real give-aways still fail', () => {
    for (const [lemma, text] of [['CONTRAT', 'contre'], ['TEMPÊTE', 'temps'], ['CARTON', 'carte'], ['PONTIFE', 'pont']]) {
      expect(stemSpoilerTokens(text!, lemma!)).toEqual([])
    }
    for (const [lemma, text] of [
      ['MARIER', 'mariage'], ['SOUVENIR', 'souvient'], ['SÉCHOIR', 'sécher'], ['COLLAGE', 'coller'],
      ['SEXUEL', 'sexualité'], ['POURQUOI', 'pour'], ['PRESQUE', 'près'], ['PLUSIEURS', 'plus'],
      ['LONGTEMPS', 'longuement'], ['VERRAIENT', 'verront'], ['OUVRAI', 'ouvris'],
    ]) expect(stemSpoilerTokens(text!, lemma!).length).toBe(1)
  })
  test('4-letter shared prefix flags 6+ letter lemmas', () => {
    expect(stemSpoilerTokens('unir par le mariage', 'MARIER')).toEqual(['mariage'])
    expect(stemSpoilerTokens('un homme se souvient', 'SOUVENIR')).toEqual(['souvient'])
    expect(stemSpoilerTokens('faire sécher', 'SÉCHOIR')).toEqual(['secher'])
    expect(stemSpoilerTokens('un gros chat', 'GROTTE')).toEqual([])
  })
  test('ignore list never hides the lemma’s own root', () => {
    expect(stemSpoilerTokens('pour quelle raison', 'POURQUOI')).toEqual(['pour'])
    expect(stemSpoilerTokens('à peu près', 'PRESQUE')).toEqual(['pres'])
    expect(stemSpoilerTokens('un objet pour écrire', 'STYLO')).toEqual([])
  })
})

describe('word-family gate (#193)', () => {
  test('catches short roots, word families and DE compound parts', () => {
    for (const [w, t, lang] of [
      ['DEZOITO', 'dez mais oito', 'pt'], ['ALTO', 'a altura', 'pt'], ['JOGAR', 'um jogo', 'pt'],
      ['COMIDA', 'lo que se come', 'es'], ['PESO', 'lo que pesa', 'es'], ['MAL', 'malo', 'es'],
      ['FREITAG', 'ein Tag', 'de'], ['TAG', 'Geburtstag', 'de'], ['TAG', 'Tageslicht', 'de'],
      ['EISBÄR', 'ein weißer Bär', 'de'], ['HAUSTÜR', 'Tür', 'de'], ['UMWEG', 'ein langer Weg', 'de'], ['DAHIN', 'hin', 'de'],
    ]) expect(familyLeakTokens(t!, w!, lang!).length).toBe(1)
  })
  test('no false positives on function words, shared 3-letter starts or chance tails', () => {
    for (const [w, t, lang] of [
      ['CONTAR', 'decir con números', 'es'], ['COMPRAR', 'comer algo', 'es'], ['PARTIR', 'para longe', 'pt'],
      ['BRUDER', 'der Sohn', 'de'], ['EINSAM', 'ganz ein Mensch allein', 'de'], ['MONDSTEIN', 'ein heller Schmuck', 'de'],
      ['ROCK', 'roca', 'es'], ['SONHA', 'tem sono', 'pt'], ['ATE', 'um tomate', 'pt'], ['HAUS', 'die Maus', 'de'],
      // #204 review: chance tails and starts
      ['ARM', 'warm', 'de'], ['ARM', 'Darm', 'de'], ['EIS', 'Reis', 'de'], ['OHR', 'Rohr', 'de'], ['RAD', 'grad', 'de'],
      ['ESEL', 'Wiesel', 'de'], ['SPIEL', 'zum Beispiel', 'de'], ['MAR', 'marido', 'es'], ['PAN', 'pantalón', 'es'],
      ['SOL', 'solo', 'es'], ['MES', 'mesa', 'es'], ['CASA', 'casi', 'es'], ['MADRUGAR', 'madre', 'es'],
    ]) expect(familyLeakTokens(t!, w!, lang!)).toEqual([])
  })
  test('only ES/PT/DE are gated for now', () => {
    expect(familyLeakTokens('un acte', 'ACTION', 'fr')).toEqual([])
  })
  test('baseline is shrink-only', () => {
    const L = [{ word: 'FREITAG', gloss: 'ein Tag' }]
    expect(familyLeakErrors('de/a2.json', L, {})[0]).toContain('word-family')
    expect(familyLeakErrors('de/a2.json', L, { 'de/a2.json': { FREITAG: ['tag'] } })).toEqual([])
    expect(familyLeakErrors('de/a2.json', [{ word: 'FREITAG', gloss: 'vor Samstag' }], { 'de/a2.json': { FREITAG: ['tag'] } })[0]).toContain('stale')
  })
  test('every shipped pack passes against the committed family baseline', async () => {
    const { readdirSync, readFileSync } = await import('node:fs')
    const base = JSON.parse(readFileSync(`${import.meta.dir}/data/family-leak-baseline.json`, 'utf8'))
    const root = `${import.meta.dir}/../public/packs`
    for (const lang of readdirSync(root)) for (const f of readdirSync(`${root}/${lang}`)) {
      const pack = JSON.parse(readFileSync(`${root}/${lang}/${f}`, 'utf8'))
      expect(familyLeakErrors(`${lang}/${f}`, pack.lemmas, base)).toEqual([])
    }
  })
})
