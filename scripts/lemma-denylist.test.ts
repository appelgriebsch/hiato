import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { profanityHits } from './profanity-guard.test'
import {
  isDeniedGlossToken,
  isDeniedLemma,
  letterTokens,
  loadDenylist,
  loadDenylistAllow,
  loadExactCategories,
  loadPatternDenylist,
  matchesDeniedPattern,
  nfcUpper,
  parseExactDenylist,
  parseExactEntries,
  parsePatternDenylist,
  staleAllowEntries,
} from './lemma-denylist'

describe('exact denylist categories', () => {
  test('rejects a bad category and tags violence apart from profanity', () => {
    expect(() => parseExactEntries('# category: junk\nDIE\n')).toThrow(/bad category/)
    const cats = loadExactCategories()
    expect(cats.get('SEX')).toBe('other')
    expect(cats.get('SEXO')).toBe('other')
    expect(cats.get('SEXUAL')).toBe('other')
    expect(isDeniedLemma('SEXO', undefined, 'es')).toBe(true)
    expect(cats.get('DIE')).toBe('violence')
    expect(cats.get('ARSCHLOCH')).toBe('profanity')
    expect(cats.get('fr SALAUD')).toBe('profanity')
    expect(cats.get('pt LONDRES')).toBe('name')
  })

  test('sexual-violence tags stay put', () => {
    const cats = loadExactCategories()
    for (const word of ['VIOLAR', 'VIOLACIÓN', 'VIOLACION']) {
      expect(cats.get(word)).toBe('violence')
      expect(isDeniedLemma(word)).toBe(true)
      expect(isDeniedGlossToken(word, 'es', 'LEY')).toBe(false)
      expect(isDeniedGlossToken(word, 'pt', 'REGRA')).toBe(false)
    }
    for (const word of ['VIOLADOR', 'ESTUPRO', 'ESTUPRAR']) {
      expect(cats.get(word)).toBe('profanity')
      expect(isDeniedGlossToken(word, 'es', 'LEY')).toBe(true)
    }
    for (const word of ['RAPE', 'RAPED', 'RAPES', 'RAPIST']) {
      expect(cats.get(word)).toBeUndefined()
      expect(cats.get(`en ${word}`)).toBe('profanity')
      expect(isDeniedLemma(word, undefined, 'en')).toBe(true)
      expect(isDeniedLemma(word, undefined, 'es')).toBe(false)
      expect(isDeniedGlossToken(word, 'en', 'FISH')).toBe(true)
      expect(isDeniedGlossToken(word, 'es', 'PESCADO')).toBe(false)
    }
    const profanity = [
      'HINTERN',
      'MOLEST',
      'PEDOPHILE',
      'VERGEWALTIGUNG',
      'VERGEWALTIGEN',
      'VERGEWALTIGER',
      'KINDERSCHÄNDER',
      'KINDERSCHAENDER',
      'PÄDOPHILER',
      'PAEDOPHILER',
      'PEDÓFILO',
      'PEDOFILO',
      'it STUPRO',
      'it STUPRARE',
    ]
    for (const key of profanity) {
      expect(cats.get(key)).toBe('profanity')
    }
  })

  test('masturbation family is denied and a clean control passes', () => {
    const denied = [
      'MASTURBATE',
      'MASTURBATION',
      'MASTURBARE',
      'MASTURBAZIONE',
      'MASTURBARSI',
      'MASTURBAR',
      'MASTURBACIÓN',
      'MASTURBAÇÃO',
      'MASTURBER',
      'MASTURBIEREN',
    ]
    for (const word of denied) {
      expect(isDeniedLemma(word, undefined, 'it')).toBe(true)
      expect(isDeniedGlossToken(word, 'it', 'POSTARE')).toBe(true)
    }
    expect(isDeniedLemma('POSTARE', undefined, 'it')).toBe(false)
    expect(isDeniedLemma('MAESTRA', undefined, 'it')).toBe(false)
    expect(isDeniedGlossToken('postare', 'it', 'RETE')).toBe(false)
  })

  test('MASTURBACION and MASTURBACAO stay on the exact list', () => {
    const text = readFileSync(path.join(import.meta.dir, 'data', 'lemma-denylist.txt'), 'utf8')
    const exact = parseExactDenylist(text)
    expect(exact.has('MASTURBACION')).toBe(true)
    expect(exact.has('MASTURBACAO')).toBe(true)
    expect(loadDenylist().has('MASTURBACION')).toBe(true)
    expect(loadDenylist().has('MASTURBACAO')).toBe(true)
  })

  test('masturb conjugations are denied as lemmas and gloss tokens', () => {
    const forms: [string, string][] = [
      ['masturbate', 'en'],
      ['masturbates', 'en'],
      ['masturbated', 'en'],
      ['masturbating', 'en'],
      ['masturbation', 'en'],
      ['masturbations', 'en'],
      ['masturbator', 'en'],
      ['masturbators', 'en'],
      ['masturbatory', 'en'],
      ['masturbieren', 'de'],
      ['masturbiert', 'de'],
      ['masturbierte', 'de'],
      ['masturbierten', 'de'],
      ['masturbierter', 'de'],
      ['masturbiertes', 'de'],
      ['masturbierst', 'de'],
      ['masturbiere', 'de'],
      ['masturbierend', 'de'],
      ['masturbierende', 'de'],
      ['masturbierenden', 'de'],
      ['masturbationen', 'de'],
      ['masturber', 'fr'],
      ['masturbe', 'fr'],
      ['masturbes', 'fr'],
      ['masturbent', 'fr'],
      ['masturbons', 'fr'],
      ['masturbez', 'fr'],
      ['masturbé', 'fr'],
      ['masturbée', 'fr'],
      ['masturbés', 'fr'],
      ['masturbées', 'fr'],
      ['masturbant', 'fr'],
      ['masturbait', 'fr'],
      ['masturbais', 'fr'],
      ['masturbations', 'fr'],
      ['masturbateur', 'fr'],
      ['masturbateurs', 'fr'],
      ['masturbatoire', 'fr'],
      ['masturbatrice', 'fr'],
      ['masturbar', 'es'],
      ['masturbo', 'es'],
      ['masturbas', 'es'],
      ['masturba', 'es'],
      ['masturbamos', 'es'],
      ['masturban', 'es'],
      ['masturbó', 'es'],
      ['masturbando', 'es'],
      ['masturbado', 'es'],
      ['masturbada', 'es'],
      ['masturbados', 'es'],
      ['masturbadas', 'es'],
      ['masturbarse', 'es'],
      ['masturbándose', 'es'],
      ['masturbaba', 'es'],
      ['masturbaron', 'es'],
      ['masturbación', 'es'],
      ['masturbaciones', 'es'],
      ['masturbacion', 'es'],
      ['masturbador', 'es'],
      ['masturbadora', 'es'],
      ['masturbare', 'it'],
      ['masturbarsi', 'it'],
      ['masturbato', 'it'],
      ['masturbata', 'it'],
      ['masturbati', 'it'],
      ['masturbando', 'it'],
      ['masturbandosi', 'it'],
      ['masturbazione', 'it'],
      ['masturbazioni', 'it'],
      ['masturbava', 'it'],
      ['masturbavano', 'it'],
      ['masturbano', 'it'],
      ['masturbi', 'it'],
      ['masturbiamo', 'it'],
      ['masturbatore', 'it'],
      ['masturbatori', 'it'],
      ['masturbatrice', 'it'],
      ['masturbar', 'pt'],
      ['masturbou', 'pt'],
      ['masturbando', 'pt'],
      ['masturbação', 'pt'],
      ['masturbações', 'pt'],
      ['masturbacao', 'pt'],
      ['masturbei', 'pt'],
      ['masturbada', 'pt'],
      ['masturbados', 'pt'],
      ['masturbadas', 'pt'],
      ['masturbarse', 'pt'],
      ['masturbaba', 'pt'],
      ['masturbam', 'pt'],
      ['masturbavam', 'pt'],
      ['masturbador', 'pt'],
      ['masturbadora', 'pt'],
      ['masturbadela', 'pt'],
      ['masturbatório', 'pt'],
      ['masturbável', 'pt'],
      ['masturbaçãozinha', 'pt'],
    ]
    expect(forms.length).toBeGreaterThanOrEqual(36)
    const missed = forms.filter(
      ([word, lang]) => !isDeniedLemma(word, undefined, lang) || !isDeniedGlossToken(word, lang, 'CASA'),
    )
    expect(missed.map(([word, lang]) => `${lang} ${word}`)).toEqual([])
    for (const [word, lang] of [
      ['MASTER', 'en'],
      ['MASTICAR', 'es'],
      ['MASTRO', 'it'],
      ['MUSTARD', 'en'],
      ['MOSTARDA', 'pt'],
      ['MASTODONTE', 'it'],
    ] as const) {
      expect(isDeniedLemma(word, undefined, lang)).toBe(false)
      expect(isDeniedGlossToken(word, lang, 'CASA')).toBe(false)
    }
  })

  test('the MASTURB rule denies no shipped token', () => {
    const rule = loadPatternDenylist().find((r) => r.stem === 'MASTURB')!
    const hits: string[] = []
    const see = (token: string, where: string) => {
      const w = nfcUpper(token)
      if (rule.re.test(w)) hits.push(`${where} ${w}`)
    }
    const root = path.join(import.meta.dir, '..')
    for (const lang of ['en', 'de', 'es', 'pt', 'fr', 'it']) {
      for (const cefr of ['a1', 'a2', 'b1', 'b2', 'c1', 'c2']) {
        const pack = JSON.parse(
          readFileSync(path.join(root, 'public/packs', lang, `${cefr}.json`), 'utf8'),
        ) as { lemmas: { word: string; gloss?: string; synonyms?: string[] }[] }
        for (const L of pack.lemmas) {
          see(L.word, `${lang}/${cefr} lemma`)
          for (const tok of letterTokens(L.gloss ?? '')) see(tok, `${lang}/${cefr} gloss`)
          for (const chip of L.synonyms ?? []) {
            for (const tok of letterTokens(chip)) see(tok, `${lang}/${cefr} chip`)
          }
        }
      }
      const gloss = JSON.parse(
        readFileSync(path.join(root, 'scripts/data/gloss-cache', `${lang}.json`), 'utf8'),
      ) as Record<string, string>
      for (const text of Object.values(gloss)) {
        for (const tok of letterTokens(text)) see(tok, `gloss-cache ${lang}`)
      }
      const syn = JSON.parse(
        readFileSync(path.join(root, 'scripts/data/synonym-cache', `${lang}.json`), 'utf8'),
      ) as Record<string, string[]>
      for (const chips of Object.values(syn)) {
        for (const chip of chips) {
          for (const tok of letterTokens(chip)) see(tok, `synonym-cache ${lang}`)
        }
      }
    }
    expect(hits).toEqual([])
  })

  test('a masturbando chip fails the profanity guard', () => {
    const errors = profanityHits(
      [{ lang: 'es', cefr: 'b2', lemmas: [{ word: 'CASA', synonyms: ['masturbando'] }] }],
      [],
    )
    expect(errors.some((e) => e.includes('chip') && e.includes('masturbando'))).toBe(true)
  })
})

describe('W3 probe', () => {
  test('plurals, slurs, and seed families are denied in their language', () => {
    const words: [string, string][] = [
      ['CABRONES', 'es'],
      ['CABRÕES', 'pt'],
      ['MARICONES', 'es'],
      ['PÉDÉS', 'fr'],
      ['FOTZEN', 'de'],
      ['BITES', 'fr'],
      ['NICHONS', 'fr'],
      ['NIBARDS', 'fr'],
      ['TWATS', 'en'],
      ['PRICKS', 'en'],
      ['PANELEIRO', 'pt'],
      ['ZIGEUNER', 'de'],
      ['CONA', 'pt'],
      ['FODÃO', 'pt'],
      ['PORRAS', 'pt'],
      ['BUCETAS', 'pt'],
      ['CACETES', 'pt'],
      ['PIROCAS', 'pt'],
      ['PINGA', 'es'],
      ['MAMÓN', 'es'],
      ['BOLUDO', 'es'],
      ['CACHONDO', 'es'],
      ['CULERO', 'es'],
      ['PUÑETA', 'es'],
      ['JODAMOS', 'es'],
      ['GARCE', 'fr'],
      ['NICHON', 'fr'],
      ['CHIASSE', 'fr'],
      ['CHIOTTES', 'fr'],
      ['CAGARE', 'it'],
      ['CAGATA', 'it'],
      ['PISCIARE', 'it'],
      ['POMPINO', 'it'],
      ['BOCCHINO', 'it'],
      ['SBORRA', 'it'],
      ['MINCHIONE', 'it'],
      ['MISTSTÜCK', 'de'],
      ['DRECKSAU', 'de'],
      ['BUMSEN', 'de'],
      ['GEBUMST', 'de'],
      ['BONER', 'en'],
      ['HOOKER', 'en'],
      ['TURD', 'en'],
    ]
    const missed = words.filter(([word, lang]) => !isDeniedLemma(word, undefined, lang))
    expect(missed.map(([word, lang]) => `${lang} ${word}`)).toEqual([])
  })
})

describe('pattern denylist parser', () => {
  test('rejects a bad line', () => {
    expect(() => parsePatternDenylist('not a pattern\n')).toThrow(/lemma-denylist-patterns:1/)
    expect(() => parsePatternDenylist('en WORD\n')).toThrow(/lemma-denylist-patterns:1/)
    expect(() => parsePatternDenylist('en WORD(\n')).toThrow(/lemma-denylist-patterns:1/)
    expect(() => parsePatternDenylist('en WORD()\n')).toThrow(/empty suffix group/)
    expect(() => parsePatternDenylist('en WORD(A|B) extra\n')).toThrow(/lemma-denylist-patterns:1/)
    expect(() => parsePatternDenylist('en WO RD(A)\n')).toThrow(/lemma-denylist-patterns:1/)
    expect(() => parsePatternDenylist('en FU2CK(ING)\n')).toThrow(/stem must be letters/)
  })

  test('anchors the whole lemma', () => {
    const rules = parsePatternDenylist('COCK(|S)\nfr BAIS(ER|ANT|É)\n')
    const cock = rules[0]!
    expect(cock.re.test('COCK')).toBe(true)
    expect(cock.re.test('COCKS')).toBe(true)
    expect(cock.re.test('COCKTAIL')).toBe(false)
    expect(cock.re.test('XCOCK')).toBe(false)
    const bais = rules[1]!
    expect(bais.re.test('BAISER')).toBe(true)
    expect(bais.re.test('BAISANT')).toBe(true)
    expect(bais.re.test('BAISSER')).toBe(false)
    expect(bais.re.test('BAISANTX')).toBe(false)
  })

  test('keeps ß via nfcUpper', () => {
    const rules = parsePatternDenylist('de scheiß(e|er)\n')
    expect(rules[0]!.stem).toBe('SCHEIß')
    expect(rules[0]!.re.source.includes('ß')).toBe(true)
    expect(rules[0]!.re.test('SCHEIßE')).toBe(true)
    expect(rules[0]!.re.test('SCHEISSE')).toBe(false)
    expect(matchesDeniedPattern('scheiße', 'de', rules)).toBe(true)
  })

  test('keeps scoped and global lines distinct', () => {
    const rules = parsePatternDenylist('FUCK(ING)\nfr BAIS(ANT)\n')
    expect(matchesDeniedPattern('FUCKING', 'en', rules)).toBe(true)
    expect(matchesDeniedPattern('FUCKING', 'pt', rules)).toBe(true)
    expect(matchesDeniedPattern('FUCKING', undefined, rules)).toBe(true)
    expect(matchesDeniedPattern('BAISANT', 'fr', rules)).toBe(true)
    expect(matchesDeniedPattern('BAISANT', 'it', rules)).toBe(false)
    expect(matchesDeniedPattern('BAISANT', undefined, rules)).toBe(false)
  })
})

describe('isDeniedLemma pattern table', () => {
  const yes: [string, string][] = [
    ['FODI', 'pt'],
    ['FODIDO', 'pt'],
    ['FODAM', 'pt'],
    ['CAGOU', 'pt'],
    ['CHINGADO', 'es'],
    ['JODIDA', 'es'],
    ['FOLLANDO', 'es'],
    ['ENCULÉ', 'fr'],
    ['BAISANT', 'fr'],
    ['NIQUÉ', 'fr'],
    ['FOUTU', 'fr'],
    ['CAZZATA', 'it'],
    ['SCOPATO', 'it'],
    ['FOTTUTO', 'it'],
    ['GEFICKT', 'de'],
    ['VÖGELN', 'de'],
    ['GEVÖGELT', 'de'],
    ['SCHEISSE', 'de'],
    ['SCHEIßE', 'de'],
    ['FUCKING', 'en'],
    ['FODEREI', 'pt'],
    ['CAGÃO', 'pt'],
    ['CARALHOS', 'pt'],
    ['BOCETA', 'pt'],
    ['VIADO', 'pt'],
    ['JODÍ', 'es'],
    ['FOLLÓ', 'es'],
    ['MIERDAS', 'es'],
    ['PENDEJO', 'es'],
    ['FOUTAIENT', 'fr'],
    ['CONNE', 'fr'],
    ['COUILLES', 'fr'],
    ['CHIANT', 'fr'],
    ['MERDOSO', 'it'],
    ['STRONZATA', 'it'],
    ['SCHEISSEN', 'de'],
    ['BESCHISSEN', 'de'],
    ['KACKE', 'de'],
    ['FUCKIN', 'en'],
    ['PUSSY', 'en'],
    ['WANK', 'en'],
    ['TITS', 'en'],
    ['DYKE', 'en'],
    ['BRANLER', 'fr'],
  ]
  for (const [word, lang] of yes) {
    test(`${lang} ${word} is denied`, () => {
      expect(isDeniedLemma(word, undefined, lang)).toBe(true)
    })
  }

  const no: [string, string | undefined][] = [
    ['SCOPO', 'it'],
    ['SCOPRIRE', 'it'],
    ['BAISSER', 'fr'],
    ['VEHÍCULO', 'es'],
    ['CONOCER', 'es'],
    ['CONNAÎTRE', 'fr'],
    ['REPUTAÇÃO', 'pt'],
    ['FOLLÓN', 'es'],
    ['VOGEL', 'de'],
    ['COCKTAIL', 'en'],
    ['PRETO', 'pt'],
    ['NEGRO', 'es'],
    ['NEGRO', 'pt'],
    ['SCOPA', 'it'],
    ['SCOPI', 'it'],
    ['SEGA', 'it'],
    ['PAJA', 'es'],
    ['POLLA', 'es'],
    ['PICA', 'pt'],
    ['BICHA', 'pt'],
    ['CORNO', 'pt'],
    ['PORCO', 'pt'],
    ['PORC', 'fr'],
    ['CHIEN', 'fr'],
    ['CHIOT', 'fr'],
    ['CABRA', 'es'],
    ['CASA', 'it'],
    ['PISCINA', 'it'],
    ['BOCCA', 'it'],
    ['CONTA', 'pt'],
    ['VEADO', 'pt'],
    ['BRANLE', 'fr'],
    ['DYKE', 'de'],
    ['TIT', 'de'],
    ['TITS', 'de'],
    ['PENDIENTE', 'es'],
    ['VERGÜENZA', 'es'],
    ['CHOCOLATE', 'es'],
    ['PÁJARO', 'es'],
    ['CONSEIL', 'fr'],
    ['CONTE', 'fr'],
    ['SALOPETTE', 'fr'],
    ['KACHEL', 'de'],
    ['PISTE', 'de'],
    ['SPASTIK', 'de'],
    ['KANAL', 'de'],
    ['SPICE', 'en'],
    ['TITLE', 'en'],
    ['TITAN', 'en'],
    ['WANKEL', 'de'],
    ['PUSSYCAT', 'en'],
    ['COCKPIT', 'en'],
    ['SCUNTHORPE', 'en'],
    ['MERENDA', 'it'],
  ]
  for (const [word, lang] of no) {
    test(`${lang ?? '—'} ${word} is not denied`, () => {
      expect(isDeniedLemma(word, undefined, lang)).toBe(false)
    })
  }

  test('FR BAISER and IT FIGA stay blocked', () => {
    expect(isDeniedLemma('BAISER', undefined, 'fr')).toBe(true)
    expect(isDeniedLemma('FIGA', undefined, 'it')).toBe(true)
    expect(isDeniedLemma('BAISER', undefined, 'en')).toBe(false)
    expect(isDeniedLemma('FIGA', undefined, 'en')).toBe(false)
  })
})

describe('pattern allowlist', () => {
  test('the shipped allowlist matches a pattern and is not stale', () => {
    const allow = loadDenylistAllow()
    expect(allow.map((e) => `${e.lang} ${e.word}`)).toEqual(['it SCOPO', 'it SCOPA', 'it SCOPI'])
    expect(staleAllowEntries()).toEqual([])
  })

  test('an allowlist entry does not override an exact hit', () => {
    const allow = [
      { lang: 'fr', word: 'BAISER', reason: 'must not override the exact list' },
      { lang: 'it', word: 'FIGA', reason: 'must not override the exact list' },
    ]
    expect(isDeniedLemma('BAISER', undefined, 'fr', allow)).toBe(true)
    expect(isDeniedLemma('FIGA', undefined, 'it', allow)).toBe(true)
  })

  test('allowlist entries are language-scoped', () => {
    const other = [{ lang: 'fr', word: 'SCOPO', reason: 'aim in another language' }]
    const same = [{ lang: 'it', word: 'SCOPO', reason: 'aim' }]
    expect(isDeniedLemma('SCOPO', undefined, 'it', other)).toBe(true)
    expect(isDeniedLemma('SCOPO', undefined, 'it', same)).toBe(false)
  })

  test('an allowlist entry that no pattern matches is stale', () => {
    const rules = loadPatternDenylist()
    const stale = staleAllowEntries(rules, [
      ...loadDenylistAllow(),
      { lang: 'it', word: 'CASA', reason: 'not a pattern hit' },
    ])
    expect(stale.map((e) => e.word)).toEqual(['CASA'])
  })
})
