import { describe, expect, test } from 'bun:test'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import type { WordPack } from '../src/packs/schema'
import {
  UPOS_TO_PACK_POS,
  checkLemmaPos,
  enCsvPosToPackPos,
  loadPosExemptions,
  pickPos,
  posSourceInfo,
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
