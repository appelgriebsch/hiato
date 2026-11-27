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
  loadViolencePatterns,
  matchesDeniedPattern,
  nfcUpper,
  parseExactDenylist,
  parseExactEntries,
  parsePatternDenylist,
  spellingKey,
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

  test('folds ß/ẞ to SS so both spellings match (#363)', () => {
    const rules = parsePatternDenylist('de scheiß(e|er)\n')
    expect(rules[0]!.stem).toBe('SCHEISS')
    expect(rules[0]!.re.test('SCHEISSE')).toBe(true)
    expect(rules[0]!.re.test('SCHEISSER')).toBe(true)
    // The raw rule regex is unfolded; matching folds via spellingKey.
    expect(matchesDeniedPattern('scheiße', 'de', rules)).toBe(true)
    expect(matchesDeniedPattern('scheiẞe', 'de', rules)).toBe(true)
    expect(matchesDeniedPattern('scheisse', 'de', rules)).toBe(true)
    expect(matchesDeniedPattern('scheiße', 'en', rules)).toBe(false)
  })

  test('spellingKey folds ß and ẞ to SS so spelling variants compare equal (#346)', () => {
    expect(spellingKey('GEWIß')).toBe('GEWISS')
    expect(spellingKey('gewiss')).toBe('GEWISS')
    expect(spellingKey('GEWIẞ')).toBe('GEWISS')
    expect(spellingKey('GEWIß')).toBe(spellingKey('GEWISS'))
    expect(spellingKey('Straße')).toBe(spellingKey('STRASSE'))
    expect(spellingKey('HAUS')).toBe('HAUS')
  })

  test('every exact denylist entry also denies its ß/SS variant and vice versa (#363)', () => {
    const text = readFileSync(path.join(import.meta.dir, 'data', 'lemma-denylist.txt'), 'utf8')
    const ssToSharp = (w: string) => w.replaceAll('SS', 'ß')
    const sharpToSS = (w: string) => w.replaceAll('ß', 'SS').replaceAll('ẞ', 'SS')
    const entries = parseExactEntries(text)
    let checked = 0
    for (const e of entries) {
      for (const k of [e.key, ssToSharp(e.key), sharpToSS(e.key)]) {
        const lang = k.includes(' ') ? k.split(' ')[0] : undefined
        const word = k.includes(' ') ? k.split(' ').slice(1).join(' ') : k
        expect(isDeniedLemma(word, undefined, lang)).toBe(true)
        checked++
      }
    }
    expect(checked).toBe(3 * entries.length)
  })

  test('every pattern line with an SS stem also matches its ß variant (#363)', () => {
    const rules = loadPatternDenylist()
    for (const rule of rules) expect(/[ßẞ]/.test(rule.stem)).toBe(false)
    const raw = readFileSync(path.join(import.meta.dir, 'data', 'lemma-denylist-patterns.txt'), 'utf8')
    let checked = 0
    for (const line of raw.split('\n')) {
      const m = /^(?:([A-Za-z]{2})\s+)?(\S+)\(([^)]*)\)$/.exec(line.split('#')[0]!.trim())
      if (!m || !m[2]!.toUpperCase().includes('SS')) continue
      const lang = m[1]?.toLowerCase()
      const stem = m[2]!.replaceAll('ß', 'SS').toUpperCase()
      const suffix = (m[3]!.split('|')[0] ?? '').toUpperCase()
      const sharpWord = stem.replaceAll('SS', 'ß') + suffix.replaceAll('SS', 'ß')
      expect(matchesDeniedPattern(sharpWord, lang, rules)).toBe(true)
      expect(matchesDeniedPattern(stem + suffix, lang, rules)).toBe(true)
      checked++
    }
    expect(checked).toBeGreaterThanOrEqual(2)
  })

  test('the #363 DE lemmas are denied in every spelling', () => {
    for (const w of ['ERSCHIEßEN', 'ERSCHIEẞEN', 'ERSCHIESSEN', 'erschießen']) {
      expect(isDeniedLemma(w, undefined, 'de')).toBe(true)
    }
    for (const w of ['SCHEIßKERL', 'SCHEISSKERL', 'scheißkerl']) {
      expect(isDeniedLemma(w, undefined, 'de')).toBe(true)
    }
    for (const w of ['SCHEIßHAUS', 'SCHEISSHAUS', 'scheißhaus']) {
      expect(isDeniedLemma(w, undefined, 'de')).toBe(true)
    }
    for (const w of ['SCHEIßBULL', 'SCHEISSBULL']) {
      expect(isDeniedLemma(w, undefined, 'de')).toBe(true)
    }
    // Scoped pattern: the SS/ß family stays playable in other languages.
    expect(isDeniedLemma('SCHEISSHAUS', undefined, 'en')).toBe(false)
    // Gloss tokens follow the same fold; the exempt list still wins.
    expect(isDeniedGlossToken('scheiße', 'de', 'HAUS')).toBe(true)
    expect(isDeniedGlossToken('schwanz', 'de', 'HUND')).toBe(false)
    expect(isDeniedGlossToken('schwanz', 'en', 'HUND')).toBe(true)
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
    expect(allow.map((e) => `${e.lang} ${e.word}`)).toEqual([
      'it SCOPO',
      'it SCOPA',
      'it SCOPI',
      'de WAFFEL',
      'de KRIEGEN',
      'de GEWALTIG',
      'pt BOMBEIROS',
      'pt BOMBEIRO',
      'pt BOMBEAR',
      'it BOMBOLA',
    ])
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

describe('ADR 0065 violence stem patterns (#381)', () => {
  test('deny stem-initial compounds and curated compound heads, anchored', () => {
    const denied: [string, string][] = [
      ['MORDE', 'de'],
      ['MORDENDER', 'de'],
      ['MORDWAFFE', 'de'],
      ['SPRENGEN', 'de'],
      ['SPRENGSATZ', 'de'],
      ['SPRENGKRAFT', 'de'],
      ['ATOMBOMBE', 'de'],
      ['RAUCHBOMBE', 'de'],
      ['ZERBOMBEN', 'de'],
      ['STINKBOMBE', 'de'],
      ['ERMORDUNG', 'de'],
      ['VÖLKERMORD', 'de'],
      ['VÖLKERMORDE', 'de'],
      ['ATOMWAFFE', 'de'],
      ['FEUERWAFFE', 'de'],
      ['TÖTUNG', 'de'],
      ['TÖTUNGSDELIKT', 'de'],
      ['ÜBERFALLE', 'de'],
      ['ANGRIFFE', 'de'],
      ['KRIEGE', 'de'],
      ['ANGRIFFSWELLE', 'de'],
      ['TERRORIST', 'de'],
      ['AMOKLÄUFER', 'de'],
      ['ATTENTAT', 'de'],
      ['TORTUR', 'de'],
      ['KRIEGER', 'de'], // warrior: replaced in-slot, no allowlist entry
      ['MORDER', 'es'],
      ['MORDISCO', 'es'],
      ['AMORDAZAR', 'es'],
      ['BOMBARDEO', 'es'],
      ['TORTURADO', 'es'],
      ['ATENTADO', 'es'],
      ['MORDER', 'pt'],
      ['TORTUROU', 'pt'],
      ['MORDRE', 'fr'],
      ['REMORD', 'fr'],
      ['TERRORISTE', 'fr'],
      ['TERRORISME', 'fr'],
      ['MORDERE', 'it'],
      ['TORTURARE', 'it'],
      ['TERRORE', 'it'],
      ['BOMBARD', 'en'],
      ['BOMBARDS', 'en'],
      ['BOMBING', 'en'],
      ['TORTUROUS', 'en'],
      ['TORTURER', 'en'],
      ['MURDEROUS', 'en'],
      ['TERRORIZE', 'en'],
      ['TERRORISTS', 'en'],
    ]
    for (const [word, lang] of denied) {
      expect(isDeniedLemma(word, undefined, lang)).toBe(true)
    }
  })

  test('never substring-matches and keeps homographs playable via the allowlist', () => {
    const clean: [string, string][] = [
      ['WAFFEL', 'de'], // allowlisted homograph (waffle)
      ['KRIEGEN', 'de'], // allowlisted homograph (to get)
      ['GEWALTIG', 'de'], // allowlisted homograph (enormous)
      ['ABKRIEGEN', 'de'], // KRIEG is not stem-initial here
      ['AUFKRIEGEN', 'de'],
      ['HERKRIEGEN', 'de'],
      ['SCHLEICHEN', 'de'], // LEICH is not a violence stem
      ['BEGLEICHEN', 'de'],
      ['LEICHT', 'de'],
      ['GLEICH', 'de'],
      ['TOTAL', 'de'], // TOT is never a stem
      ['TOTALE', 'de'],
      ['PROTOTYP', 'es'],
      ['PRIMORDIAL', 'es'], // MORD is not stem-initial here
      ['ARMARIO', 'es'], // ARMA is not a violence stem
      ['GUERRA', 'es'],
      ['MORDWAFFE', 'en'], // scoped: the de pattern does not leak into en
      ['BOMBARD', 'fr'], // scoped: the en/de BOMB rules do not leak into fr
      ['TERROR', 'en'], // bare stem stays on the exact list
      ['BOMBER', 'en'], // ER is not in the BOMB suffix set
      ['BOMBEIROS', 'pt'], // allowlisted homograph (firefighters)
      ['BOMBEAR', 'pt'], // allowlisted homograph (to pump)
    ]
    for (const [word, lang] of clean) {
      expect(isDeniedLemma(word, undefined, lang)).toBe(false)
    }
  })

  test('the violence section loads and is anchored per language', () => {
    const rules = loadViolencePatterns()
    expect(rules.length).toBeGreaterThan(10)
    for (const rule of rules) expect(rule.re.source.startsWith('^')).toBe(true)
    // stage 2 (#388): prefix rules are part of the violence section
    expect(rules.some((r) => r.kind === 'prefix' && r.lang === 'de' && r.stem === 'SPRENG')).toBe(true)
    const mord = rules.find((r) => r.lang === 'de' && r.stem === 'MORD')!
    expect(mord.re.test('MORDE')).toBe(true)
    expect(mord.re.test('MORD')).toBe(false) // bare stem stays on the exact list
    expect(mord.re.test('ABMORDEN')).toBe(false) // anchored, never substring
    expect(mord.re.test('MORDEX')).toBe(false)
  })

  test('ß/SS fold applies to violence stems like any pattern (#363)', () => {
    const rules = parsePatternDenylist('de GEWALTß(IG)\n')
    // the stem folds to GEWALTSS; both spellings of the word match
    expect(rules[0]!.stem).toBe('GEWALTSS')
    expect(matchesDeniedPattern('GEWALTSSIG', 'de', rules)).toBe(true)
    expect(matchesDeniedPattern('GEWALTßIG', 'de', rules)).toBe(true)
    expect(matchesDeniedPattern('GEWALTSSIGX', 'de', rules)).toBe(false)
    expect(matchesDeniedPattern('XGEWALTSSIG', 'de', rules)).toBe(false)
  })

  test('allowlist entries are required to match a violence pattern (stale guard)', () => {
    const rules = loadPatternDenylist()
    const stale = staleAllowEntries(rules, [
      ...loadDenylistAllow(),
      { lang: 'de', word: 'SCHLEICHEN', reason: 'no ADR 0065 stem is stem-initial here' },
    ])
    expect(stale.map((e) => `${e.lang} ${e.word}`)).toEqual(['de SCHLEICHEN'])
    // every shipped allow entry has a reason and matches a pattern
    for (const e of loadDenylistAllow()) expect(e.reason.length).toBeGreaterThan(10)
    expect(staleAllowEntries()).toEqual([])
  })

  test('gloss tokens follow the same anchored pattern rules (ADR 0066)', () => {
    expect(isDeniedGlossToken('MORDWAFFE', 'de', 'HAUS')).toBe(true)
    expect(isDeniedGlossToken('TÖTUNG', 'de', 'HAUS')).toBe(true)
    expect(isDeniedGlossToken('mordwaffe', 'en', 'HOUSE')).toBe(false) // scoped
    expect(isDeniedGlossToken('Waffe', 'de', 'HAUS')).toBe(false) // exact violence word: allowed in glosses
    expect(isDeniedGlossToken('GEWALT', 'de', 'HAUS')).toBe(false)
    expect(isDeniedGlossToken('GEWALTIG', 'de', 'HAUS')).toBe(false) // allowlisted homograph
    expect(isDeniedGlossToken('Sprengstoff', 'de', 'HAUS')).toBe(true) // compound in a gloss is denied
    expect(isDeniedGlossToken('BOMBARDING', 'en', 'HOUSE')).toBe(true)
    expect(isDeniedGlossToken('bombs', 'en', 'HOUSE')).toBe(false) // exact violence word: allowed in glosses
    expect(isDeniedGlossToken('BOMBARD', 'fr', 'MAISON')).toBe(false) // scoped
    expect(isDeniedGlossToken('GEWALTSUCHT', 'de', 'HAUS')).toBe(true) // stage-2 prefix hit in a gloss
  })

  test('stage 2 prefix rules (#388) deny stem + word-like tail, never substring', () => {
    // open compounds with uncurated tails — no suffix line covers these
    expect(isDeniedLemma('BOMBARDARE', undefined, 'it')).toBe(true) // no it BOMB(…) suffix line
    expect(isDeniedLemma('GEWALTSUCHT', undefined, 'de')).toBe(true) // SUCHT not in the GEWALT suffix list
    expect(isDeniedLemma('SPRENGKAPSEL', undefined, 'de')).toBe(true) // KAPSEL uncurated
    // tail rule: 1–2 letter tails are not prefix hits (curated-suffix territory)
    expect(isDeniedLemma('SPRENGA', undefined, 'de')).toBe(false)
    expect(isDeniedLemma('BOMBOM', undefined, 'pt')).toBe(false) // pt candy, tail OM; not exact-listed
    // bare stem stays on the exact list only
    expect(isDeniedLemma('SPRENG', undefined, 'de')).toBe(false)
    // anchored at the start, never a substring
    expect(isDeniedLemma('ABSPRENGKAPSEL', undefined, 'de')).toBe(false)
    expect(isDeniedLemma('XGEWALTSUCHT', undefined, 'de')).toBe(false)
    // language-scoped
    expect(isDeniedLemma('GEWALTSUCHT', undefined, 'en')).toBe(false)
    // allowlist exemption applies to prefix hits too
    expect(isDeniedLemma('BOMBOLA', undefined, 'it')).toBe(false) // allowlisted gas cylinder
    expect(isDeniedLemma('BOMBOLA', undefined, 'pt')).toBe(true) // not allowlisted in pt
    // gloss tokens follow the same prefix rule
    expect(isDeniedGlossToken('sprengcapsel', 'de', 'HAUS')).toBe(true)
    expect(isDeniedGlossToken('bombola', 'it', 'CASA')).toBe(false) // allowlisted
  })

  test('stage 2 prefix stems must be word-like heads and fold ß/SS (#388)', () => {
    expect(() => parsePatternDenylist('de#prefix A\n')).toThrow(/word-like head/)
    expect(() => parsePatternDenylist('de#prefix AB\n')).not.toThrow() // short heads are word-like
    expect(() => parsePatternDenylist('de#prefix FU2\n')).toThrow(/stem must be letters/)
    const rules = parsePatternDenylist('de#prefix SCHEIß\n')
    expect(rules[0]!.kind).toBe('prefix')
    expect(rules[0]!.stem).toBe('SCHEISS')
    expect(matchesDeniedPattern('SCHEISSKOPF', 'de', rules)).toBe(true)
    expect(matchesDeniedPattern('SCHEIßKOPF', 'de', rules)).toBe(true) // ß/SS fold
    expect(matchesDeniedPattern('SCHEISS', 'de', rules)).toBe(false) // bare stem not matched
    expect(matchesDeniedPattern('SCHEISSAB', 'de', rules)).toBe(true) // short-head tail is word-like
    expect(matchesDeniedPattern('SCHEISSXY', 'de', rules)).toBe(false) // 2-letter non-short-head tail
    expect(matchesDeniedPattern('SCHEISSKOPF', 'en', rules)).toBe(false) // scoped
  })

  test('an allowlist entry matching only a prefix rule is not stale (#388)', () => {
    const rules = loadPatternDenylist()
    const stale = staleAllowEntries(rules, [{ lang: 'it', word: 'BOMBOLA', reason: 'gas cylinder, prefix-rule homograph' }])
    expect(stale).toEqual([])
  })
})

test('#366 slurs and vulgar insults are language-scoped exact hits', () => {
  expect(isDeniedLemma('GOOK', undefined, 'en')).toBe(true)
  expect(isDeniedLemma('gook', undefined, 'en')).toBe(true)
  expect(isDeniedLemma('GOOK', undefined, 'de')).toBe(false)
  for (const [lang, word] of [
    ['pt', 'BOCHES'],
    ['fr', 'POUFFIASSE'],
    ['it', 'INVERTITO'],
    ['it', 'BATTONA'],
    ['de', 'FLITTCHEN'],
    ['de', 'FETTSACK'],
    ['es', 'FOLLADOR'],
    ['es', 'LAMECULOS'],
    ['de', 'DRECKSACK'],
    ['es', 'SUBNORMAL'],
    ['es', 'FURCIA'],
    ['fr', 'GROGNASSE'],
    ['pt', 'RAMEIRA'],
    ['fr', 'PISSER'],
    ['fr', 'BANDER'],
    ['it', 'CHIAPPA'],
    ['it', 'POMICIARE'],
    ['it', 'PIRLA'],
    ['it', 'DITALINO'],
  ] as const) {
    expect(isDeniedLemma(word, undefined, lang)).toBe(true)
    expect(isDeniedLemma(word, undefined, 'en')).toBe(false)
  }
})
