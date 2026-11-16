import { describe, expect, test } from 'bun:test'
import {
  ACCENT_TEACH,
  accentMissTarget,
  accentTeachLine,
  applyGuess,
  buildInitialCells,
  isDiacriticHintMiss,
  isForgivenAccentMiss,
  revealOneDiacritic,
} from './index'

describe('isForgivenAccentMiss (ADR 0053)', () => {
  test('A1/A2 forgiven for non-EN packs', () => {
    expect(isForgivenAccentMiss('de', 'a1')).toBe(true)
    expect(isForgivenAccentMiss('es', 'a2')).toBe(true)
    expect(isForgivenAccentMiss('pt', 'a1')).toBe(true)
    expect(isForgivenAccentMiss('fr', 'a2')).toBe(true)
    expect(isForgivenAccentMiss('it', 'a1')).toBe(true)
  })

  test('counted as a miss from B1', () => {
    for (const cefr of ['b1', 'b2', 'c1', 'c2'] as const) {
      expect(isForgivenAccentMiss('de', cefr)).toBe(false)
      expect(isForgivenAccentMiss('es', cefr)).toBe(false)
    }
  })

  test('English packs unchanged, even at A1/A2', () => {
    expect(isForgivenAccentMiss('en', 'a1')).toBe(false)
    expect(isForgivenAccentMiss('en', 'a2')).toBe(false)
    expect(isForgivenAccentMiss('en', 'b1')).toBe(false)
  })
})

describe('accentMissTarget (ADR 0053)', () => {
  // UÑA has no plain N, so pressing N is a miss that points at Ñ.
  const word = 'UÑA'

  test('base of a hidden diacritic points at it (N → Ñ)', () => {
    const cells = buildInitialCells(word, 'b1')
    expect(accentMissTarget(cells, word, 'N')).toBe('Ñ')
    expect(isDiacriticHintMiss(cells, word, 'N')).toBe(true)
  })

  test('wrong diacritic key points at the first unrevealed diacritic (Á while Ñ hidden)', () => {
    const cells = buildInitialCells(word, 'b1')
    expect(accentMissTarget(cells, word, 'Á')).toBe('Ñ')
  })

  test('unrelated ASCII is not an accent miss', () => {
    const cells = buildInitialCells(word, 'b1')
    expect(accentMissTarget(cells, word, 'X')).toBeNull()
    expect(isDiacriticHintMiss(cells, word, 'X')).toBe(false)
  })

  test('a hit (exact hidden diacritic) is not a miss', () => {
    const cells = buildInitialCells(word, 'b1')
    expect(accentMissTarget(cells, word, 'Ñ')).toBeNull()
  })

  test('a plain letter that is in the word is a hit, not an accent miss', () => {
    const cells = buildInitialCells('NIÑO', 'b1')
    expect(accentMissTarget(cells, 'NIÑO', 'N')).toBeNull()
    expect(isDiacriticHintMiss(cells, 'NIÑO', 'N')).toBe(false)
  })

  test('no hidden diacritic left → null', () => {
    let cells = buildInitialCells(word, 'b1')
    cells = revealOneDiacritic(cells, word)
    expect(accentMissTarget(cells, word, 'N')).toBeNull()
  })

  test('word without diacritics → null', () => {
    const cells = buildInitialCells('CAFE', 'b1')
    expect(accentMissTarget(cells, 'CAFE', 'N')).toBeNull()
  })

  test('base match picks the matching hidden diacritic among several', () => {
    const pt = 'ÃÕ' // Ã and Õ hidden, no plain A/O
    const cells = buildInitialCells(pt, 'b1')
    expect(accentMissTarget(cells, pt, 'A')).toBe('Ã')
    expect(accentMissTarget(cells, pt, 'O')).toBe('Õ')
  })

  test('already-revealed cells do not count: reveal Ç first, C is then unrelated', () => {
    const pt = 'ÃÇ'
    let cells = buildInitialCells(pt, 'b1')
    expect(accentMissTarget(cells, pt, 'C')).toBe('Ç')
    const hit = applyGuess(cells, pt, 'Ç')
    expect(hit.hit).toBe(true)
    cells = hit.cells
    expect(accentMissTarget(cells, pt, 'C')).toBeNull()
    expect(accentMissTarget(cells, pt, 'A')).toBe('Ã')
  })

  test('agrees with isDiacriticHintMiss on every letter of the pad', () => {
    const word = 'CAÑÓN'
    const cells = buildInitialCells(word, 'a1')
    for (const letter of ['A', 'B', 'C', 'N', 'O', 'X', 'Ñ', 'Á', 'Ç', 'ß']) {
      const miss = isDiacriticHintMiss(cells, word, letter)
      expect(accentMissTarget(cells, word, letter) !== null).toBe(miss)
    }
  })
})

describe('accentTeachLine (ADR 0053)', () => {
  test('known graphemes produce their one-liner', () => {
    expect(accentTeachLine('Ñ')).toBe('Ñ: N with a tilde, sounds like "ny"')
    expect(accentTeachLine('ß')).toBe('ß: the German sharp s, sounds like "ss"')
    expect(accentTeachLine('Ç')).toContain('cedilla')
  })

  test('lowercase and decomposed input map to the same uppercase key', () => {
    expect(accentTeachLine('ñ')).toBe(accentTeachLine('Ñ'))
    expect(accentTeachLine('ñ')).toBe(accentTeachLine('Ñ')) // n + combining tilde
  })

  test('unmapped grapheme gets the generic fallback', () => {
    expect(accentTeachLine('Å')).toBe(
      'Å: this letter carries a special mark that changes its sound',
    )
  })

  test('every diacritic grapheme shipped in the packs has a real entry', () => {
    const packGraphemes = [
      'À', 'Á', 'Â', 'Ã', 'Ä', 'Ç', 'È', 'É', 'Ê', 'Ì', 'Í', 'Î', 'Ï',
      'Ñ', 'Ò', 'Ó', 'Ô', 'Õ', 'Ö', 'Ù', 'Ú', 'Û', 'Ü', 'Œ', 'ß',
    ]
    expect(Object.keys(ACCENT_TEACH).sort()).toEqual([...packGraphemes].sort())
    for (const g of packGraphemes) {
      expect(accentTeachLine(g)).not.toContain('special mark that changes')
    }
  })
})
