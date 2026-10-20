import { describe, expect, test } from 'bun:test'
import {
  isDeniedLemma,
  loadDenylistAllow,
  loadExactCategories,
  loadPatternDenylist,
  matchesDeniedPattern,
  parseExactEntries,
  parsePatternDenylist,
  staleAllowEntries,
} from './lemma-denylist'

describe('exact denylist categories', () => {
  test('rejects a bad category and tags violence apart from profanity', () => {
    expect(() => parseExactEntries('# category: junk\nDIE\n')).toThrow(/bad category/)
    const cats = loadExactCategories()
    expect(cats.get('DIE')).toBe('violence')
    expect(cats.get('ARSCHLOCH')).toBe('profanity')
    expect(cats.get('fr SALAUD')).toBe('profanity')
    expect(cats.get('pt LONDRES')).toBe('name')
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
    ['MASTURBARE', 'it'],
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
