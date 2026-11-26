import { describe, expect, test } from 'bun:test'
import { mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import type { WordPack } from '../src/packs/schema'
import { nfcUpper } from './lemma-denylist'
import {
  POS_GATE_VERSION,
  UPOS_TO_PACK_POS,
  checkLemmaPos,
  enCsvPosToPackPos,
  isCurrentPosPass,
  loadPosExemptions,
  loadPosGateLog,
  loadPosOverrides,
  pickPos,
  posGateKey,
  posSourceInfo,
  type PosGateLog,
} from './lemma-pos'

describe('lemma-pos mapping (ADR 0055, #315)', () => {
  test('enCsvPosToPackPos maps the content four and rejects function words', () => {
    expect(enCsvPosToPackPos('noun')).toBe('noun')
    expect(enCsvPosToPackPos('VERB')).toBe('verb')
    expect(enCsvPosToPackPos('adjective')).toBe('adjective')
    expect(enCsvPosToPackPos('Adverb')).toBe('adverb')
    expect(enCsvPosToPackPos('determiner')).toBeNull()
    expect(enCsvPosToPackPos('pronoun')).toBeNull()
    expect(enCsvPosToPackPos('')).toBeNull()
  })

  test('UPOS_TO_PACK_POS covers NOUN/VERB/ADJ/ADV only', () => {
    expect(UPOS_TO_PACK_POS.NOUN).toBe('noun')
    expect(UPOS_TO_PACK_POS.VERB).toBe('verb')
    expect(UPOS_TO_PACK_POS.ADJ).toBe('adjective')
    expect(UPOS_TO_PACK_POS.ADV).toBe('adverb')
    expect(UPOS_TO_PACK_POS.PRON).toBeUndefined()
    expect(UPOS_TO_PACK_POS.DET).toBeUndefined()
  })

  test('pickPos is deterministic by priority noun > verb > adjective > adverb', () => {
    expect(pickPos(['verb', 'noun'])).toBe('noun')
    expect(pickPos(['adverb', 'adjective'])).toBe('adjective')
    expect(pickPos(['adverb', 'verb'])).toBe('verb')
    expect(pickPos([])).toBeNull()
  })

  test('pt has no licensed pos source — always exempt with a reason', () => {
    const info = posSourceInfo('pt', 'a1', 'CASA')
    expect(info.pos).toBeNull()
    expect(info.reason).toContain('pt_50k')
  })

  test('#357 pos-overrides.txt wins over the raw source pos', () => {
    // wordhoard lists BLAU only as ADV; the committed override corrects it.
    const info = posSourceInfo('de', 'a1', 'BLAU')
    expect(info.pos).toBe('adjective')
    expect(info.reason).toContain('pos-overrides.txt')
    // checkLemmaPos accepts the override even when the map still has the old value.
    const errors = checkLemmaPos(
      'de/a1.json',
      { version: 1, lang: 'de', cefr: 'a1', license: 'x', attribution: ['t'], lemmas: [{ word: 'BLAU', gloss: 'Farbe zwischen Grün und Violett', pos: 'adjective' }] },
      { de: { BLAU: 'adverb' } },
      new Set(),
    )
    expect(errors).toEqual([])
  })

  test('#357/#358 every pos override is a shipped lemma with that pos (no stale entries)', () => {
    const root = path.join(import.meta.dir, '..', 'public', 'packs')
    const shipped = new Map<string, Map<string, string | undefined>>()
    for (const lang of readdirSync(root)) {
      const map = new Map<string, string | undefined>()
      for (const name of readdirSync(path.join(root, lang))) {
        if (!name.endsWith('.json')) continue
        const pack = JSON.parse(readFileSync(path.join(root, lang, name), 'utf8')) as WordPack
        for (const L of pack.lemmas) map.set(nfcUpper(L.word), L.pos)
      }
      shipped.set(lang, map)
    }
    for (const o of loadPosOverrides()) {
      const pos = shipped.get(o.lang)?.get(o.word)
      if (pos === undefined) {
        throw new Error(`override ${o.lang}|${o.word} is not a shipped lemma — remove it`)
      }
      if (pos !== o.pos) {
        throw new Error(`override ${o.lang}|${o.word}|${o.pos} but the pack ships pos ${pos} — sync them`)
      }
    }
  })
})

describe('checkLemmaPos (ADR 0055 / #315 source consistency)', () => {
  const pack = (lemmas: { word: string; pos?: 'noun' | 'verb' | 'adjective' | 'adverb' }[]): WordPack => ({
    version: 1,
    lang: 'en',
    cefr: 'a1',
    license: 'CEFR-J Wordlist terms',
    attribution: ['test'],
    lemmas,
  })

  test('source-matching pos passes; exempt lemma without pos passes', () => {
    const map = { en: { HOUSE: 'noun' as const } }
    const exempt = new Set(['en|FLY'])
    const errors = checkLemmaPos(
      'en/a1.json',
      pack([
        { word: 'HOUSE', pos: 'noun' },
        { word: 'FLY' },
      ]),
      map,
      exempt,
    )
    expect(errors).toEqual([])
  })

  test('a contradicting pos fails; a missing pos without exemption fails', () => {
    const map = { en: { HOUSE: 'noun' as const } }
    const exempt = new Set<string>()
    const errors = checkLemmaPos(
      'en/a1.json',
      pack([
        { word: 'HOUSE', pos: 'verb' },
        { word: 'RUN' },
      ]),
      map,
      exempt,
    )
    expect(errors.some((e) => e.includes('HOUSE') && e.includes('contradicts'))).toBe(true)
    expect(errors.some((e) => e.includes('RUN') && e.includes('no pos'))).toBe(true)
  })

  test('a pos with no source entry at all fails (map not rebuilt)', () => {
    const errors = checkLemmaPos('en/a1.json', pack([{ word: 'ZOOM', pos: 'noun' }]), {}, new Set())
    expect(errors.some((e) => e.includes('ZOOM') && e.includes('no source entry'))).toBe(true)
  })
})

describe('loadPosExemptions', () => {
  test('parses lang|WORD keys, skips comments and blanks, ignores the reason column', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'pos-exempt-'))
    const file = path.join(dir, 'pos-exempt.txt')
    writeFileSync(file, '# header\n\npt|CASA\tno pos column\nen|ICH\tPRON not content\n')
    expect([...loadPosExemptions(file)].sort()).toEqual(['en|ICH', 'pt|CASA'])
  })
})

describe('pos gate log (ADR 0055 amended, #339 Mistral fallback)', () => {
  test('posGateKey matches the lemma-extras-gate.json key shape', () => {
    expect(posGateKey('pt', 'Casa')).toBe('pt|CASA|pos')
    expect(posGateKey('de', 'Haus')).toBe('de|HAUS|pos')
  })

  test('isCurrentPosPass requires verdict pass + current gate version', () => {
    const entry = {
      value: 'noun' as const,
      source: 'mistral' as const,
      verdict: 'pass' as const,
      gate: POS_GATE_VERSION,
      at: '2026-11-20',
    }
    expect(isCurrentPosPass(entry)).toBe(true)
    expect(isCurrentPosPass({ ...entry, verdict: 'reject' })).toBe(false)
    expect(isCurrentPosPass({ ...entry, gate: 0 })).toBe(false)
    expect(isCurrentPosPass(undefined)).toBe(false)
  })

  test('loadPosGateLog keeps only |pos keys with a PackPos value', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'pos-gate-'))
    const file = path.join(dir, 'lemma-extras-gate.json')
    writeFileSync(
      file,
      JSON.stringify({
        'pt|CASA|pos': { value: 'noun', source: 'mistral', verdict: 'pass', gate: 1, at: 'x' },
        'pt|CASA|ipa': { value: '/x/', source: 'wiktextract', verdict: 'pass', gate: 1, at: 'x' },
        'pt|CASA|family': { value: ['casinha'], source: 'wiktextract', verdict: 'pass', gate: 1, at: 'x' },
        'pt|BAD|pos': { value: 'pronoun', source: 'mistral', verdict: 'pass', gate: 1, at: 'x' },
      }),
    )
    const log = loadPosGateLog(file)
    expect(Object.keys(log)).toEqual(['pt|CASA|pos'])
    expect(log['pt|CASA|pos']!.value).toBe('noun')
  })

  test('checkLemmaPos accepts a gate-logged pos; rejects stale, mismatched, or absent gate entries', () => {
    const gate: PosGateLog = {
      'pt|CASA|pos': {
        value: 'noun',
        source: 'mistral',
        verdict: 'pass',
        gate: POS_GATE_VERSION,
        at: '2026-11-20',
      },
    }
    const pack = (pos: 'noun' | 'verb'): WordPack => ({
      version: 1,
      lang: 'pt',
      cefr: 'a1',
      license: 'x',
      attribution: [],
      lemmas: [{ word: 'CASA', gloss: 'house', pos }],
    })
    // current passing gate entry + matching pack value → ok (no source, not exempt)
    expect(checkLemmaPos('pt/a1.json', pack('noun'), {}, new Set(), gate)).toEqual([])
    // without the gate log the same pos fails
    const noGate = checkLemmaPos('pt/a1.json', pack('noun'), {}, new Set())
    expect(noGate.length).toBe(1)
    expect(noGate[0]).toContain('no source entry')
    // pack value differs from the gate entry → tamper guard fails
    const mismatch = checkLemmaPos('pt/a1.json', pack('verb'), {}, new Set(), gate)
    expect(mismatch.length).toBe(1)
    // stale gate version fails
    const stale: PosGateLog = {
      'pt|CASA|pos': { ...gate['pt|CASA|pos']!, gate: 0 },
    }
    expect(checkLemmaPos('pt/a1.json', pack('noun'), {}, new Set(), stale).length).toBe(1)
    // a source-map contradiction still fails even with a gate entry present
    const map = { pt: { CASA: 'verb' as const } }
    const contra = checkLemmaPos('pt/a1.json', pack('noun'), map, new Set(), gate)
    expect(contra.some((e) => e.includes('contradicts'))).toBe(true)
  })
})
