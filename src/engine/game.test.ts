import { describe, expect, test } from 'bun:test'
import {
  applyGuess,
  buildInitialCells,
  correctKeysFromCells,
  dailySeedKey,
  graphemeKey,
  graphemes,
  hasDiacritic,
  hasUnrevealedDiacritic,
  isDiacriticHintMiss,
  hashString,
  isBaseAsciiVowel,
  isWon,
  localDateKey,
  normalizeNfc,
  pickDailyLemma,
  revealOneDiacritic,
  TOTAL_LIVES,
} from './index'

describe('NFC + graphemes', () => {
  test('normalizeNfc composes', () => {
    const decomposed = 'e\u0301' // e + combining acute
    expect(normalizeNfc(decomposed)).toBe('é')
  })

  test('graphemes splits café into 4 clusters', () => {
    expect(graphemes('café')).toEqual(['c', 'a', 'f', 'é'])
    expect(graphemes('CAFÉ')).toEqual(['C', 'A', 'F', 'É'])
  })

  test('graphemes handles family emoji as one cluster when Segmenter available', () => {
    const g = graphemes('👨‍👩‍👧')
    expect(g.length).toBeGreaterThanOrEqual(1)
    expect(g.join('')).toBe('👨‍👩‍👧')
  })
})

describe('letters / diacritics', () => {
  test('ASCII letters are not diacritics', () => {
    expect(hasDiacritic('A')).toBe(false)
    expect(hasDiacritic('z')).toBe(false)
  })

  test('accented and special letters are diacritics', () => {
    expect(hasDiacritic('É')).toBe(true)
    expect(hasDiacritic('á')).toBe(true)
    expect(hasDiacritic('ñ')).toBe(true)
    expect(hasDiacritic('ß')).toBe(true)
    expect(hasDiacritic('ç')).toBe(true)
  })

  test('isBaseAsciiVowel only plain AEIOU', () => {
    expect(isBaseAsciiVowel('A')).toBe(true)
    expect(isBaseAsciiVowel('e')).toBe(true)
    expect(isBaseAsciiVowel('Á')).toBe(false)
    expect(isBaseAsciiVowel('ü')).toBe(false)
    expect(isBaseAsciiVowel('B')).toBe(false)
  })
})

describe('ADR 0024 A1 vowel prefill', () => {
  test('prefills ASCII vowels only on A1', () => {
    const cells = buildInitialCells('AÇÃO', 'a1')
    const gs = graphemes('AÇÃO')
    expect(gs).toEqual(['A', 'Ç', 'Ã', 'O'])
    expect(cells[0]).toMatchObject({ revealed: true, helped: true, char: 'A' })
    expect(cells[1]).toMatchObject({ revealed: false, helped: false, char: null })
    expect(cells[2]).toMatchObject({ revealed: false, helped: false, char: null })
    expect(cells[3]).toMatchObject({ revealed: true, helped: true, char: 'O' })
  })

  test('B1 does not prefill vowels', () => {
    const cells = buildInitialCells('APPLE', 'b1')
    expect(cells.every((c) => !c.revealed)).toBe(true)
  })

  test('EN café keeps é hidden for hint path', () => {
    const cells = buildInitialCells('CAFÉ', 'a1')
    expect(cells[0]!.revealed).toBe(false) // C
    expect(cells[1]!.revealed).toBe(true) // A
    expect(cells[2]!.revealed).toBe(false) // F
    expect(cells[3]!.revealed).toBe(false) // É — diacritic
    expect(hasUnrevealedDiacritic(cells, 'CAFÉ')).toBe(true)
  })
})

describe('guess + lives', () => {
  test('TOTAL_LIVES is 6', () => {
    expect(TOTAL_LIVES).toBe(6)
  })

  test('hit reveals matching graphemes', () => {
    const word = 'APPLE'
    let cells = buildInitialCells(word, 'b1')
    const { cells: next, hit } = applyGuess(cells, word, 'p')
    expect(hit).toBe(true)
    expect(next[1]!.revealed).toBe(true)
    expect(next[2]!.revealed).toBe(true)
    expect(next[1]!.char).toBe('P')
  })

  test('miss returns hit false', () => {
    const word = 'APPLE'
    const cells = buildInitialCells(word, 'b1')
    const { hit } = applyGuess(cells, word, 'Z')
    expect(hit).toBe(false)
  })

  test('case-insensitive key match for accented', () => {
    const word = 'CAFÉ'
    const cells = buildInitialCells(word, 'b1')
    const { cells: next, hit } = applyGuess(cells, word, 'é')
    expect(hit).toBe(true)
    expect(next[3]!.char).toBe('É')
  })

  test('isWon when all revealed', () => {
    const word = 'AT'
    let cells = buildInitialCells(word, 'b1')
    cells = applyGuess(cells, word, 'A').cells
    expect(isWon(cells)).toBe(false)
    cells = applyGuess(cells, word, 'T').cells
    expect(isWon(cells)).toBe(true)
  })

  test('correctKeysFromCells tracks revealed keys', () => {
    const cells = buildInitialCells('APPLE', 'a1')
    const keys = correctKeysFromCells(cells)
    expect(keys.has('A')).toBe(true)
    expect(keys.has('E')).toBe(true)
    expect(keys.has('P')).toBe(false)
  })
})

describe('ADR 0015 diacritic hint', () => {
  test('revealOneDiacritic reveals first diacritic grapheme everywhere', () => {
    const word = 'AÇÃO'
    const cells = buildInitialCells(word, 'a1')
    const next = revealOneDiacritic(cells, word)
    // first diacritic is Ç
    expect(next[1]!.revealed).toBe(true)
    expect(next[1]!.char).toBe('Ç')
    expect(next[1]!.helped).toBe(true)
    // Ã still hidden
    expect(next[2]!.revealed).toBe(false)
  })

  test('second hint reveals next diacritic', () => {
    const word = 'AÇÃO'
    let cells = buildInitialCells(word, 'a1')
    cells = revealOneDiacritic(cells, word)
    cells = revealOneDiacritic(cells, word)
    expect(cells[2]!.revealed).toBe(true)
    expect(cells[2]!.char).toBe('Ã')
  })

  test('no-op when no diacritic left', () => {
    const word = 'APPLE'
    const cells = buildInitialCells(word, 'a1')
    expect(hasUnrevealedDiacritic(cells, word)).toBe(false)
    expect(revealOneDiacritic(cells, word)).toEqual(cells)
  })

  test('wrong ASCII that is not a diacritic base does not count toward the hint', () => {
    const word = 'CAFÉ'
    const cells = buildInitialCells(word, 'b1')
    expect(isDiacriticHintMiss(cells, word, 'X')).toBe(false)
    expect(isDiacriticHintMiss(cells, word, 'Z')).toBe(false)
    expect(isDiacriticHintMiss(cells, word, 'Q')).toBe(false)
  })

  test('guessing the ASCII base of a hidden diacritic counts (E vs É)', () => {
    const word = 'CAFÉ'
    const cells = buildInitialCells(word, 'b1')
    expect(isDiacriticHintMiss(cells, word, 'e')).toBe(true)
    expect(isDiacriticHintMiss(cells, word, 'E')).toBe(true)
  })

  test('guessing a wrong diacritic key counts as a diacritic-cell miss', () => {
    const word = 'CAFÉ'
    const cells = buildInitialCells(word, 'b1')
    expect(isDiacriticHintMiss(cells, word, 'á')).toBe(true)
    expect(isDiacriticHintMiss(cells, word, 'ç')).toBe(true)
  })

  test('does not count once every diacritic cell is revealed', () => {
    const word = 'CAFÉ'
    const cells = applyGuess(buildInitialCells(word, 'b1'), word, 'é').cells
    expect(hasUnrevealedDiacritic(cells, word)).toBe(false)
    expect(isDiacriticHintMiss(cells, word, 'X')).toBe(false)
    expect(isDiacriticHintMiss(cells, word, 'á')).toBe(false)
    expect(isDiacriticHintMiss(cells, word, 'e')).toBe(false)
  })

  test('AÇÃO: C counts (base of Ç); Q does not', () => {
    const word = 'AÇÃO'
    const cells = buildInitialCells(word, 'a1')
    expect(hasUnrevealedDiacritic(cells, word)).toBe(true)
    expect(isDiacriticHintMiss(cells, word, 'C')).toBe(true)
    expect(isDiacriticHintMiss(cells, word, 'Q')).toBe(false)
  })
})

describe('daily pick', () => {
  test('localDateKey format', () => {
    expect(localDateKey(new Date(2026, 8, 19))).toBe('2026-09-19')
  })

  test('hash is stable', () => {
    expect(hashString('2026-09-19|en|a1')).toBe(hashString('2026-09-19|en|a1'))
    expect(hashString('a')).not.toBe(hashString('b'))
  })

  test('pickDailyLemma is deterministic', () => {
    const lemmas = [
      { word: 'APPLE' },
      { word: 'HOUSE' },
      { word: 'WATER' },
      { word: 'BREAD' },
    ]
    const a = pickDailyLemma(lemmas, '2026-09-19', 'en', 'a1')
    const b = pickDailyLemma(lemmas, '2026-09-19', 'en', 'a1')
    expect(a.word).toBe(b.word)
    const c = pickDailyLemma(lemmas, '2026-09-20', 'en', 'a1')
    // different day may differ (almost always)
    expect(dailySeedKey('2026-09-19', 'en', 'a1')).toBe('2026-09-19|en|a1')
    expect(typeof c.word).toBe('string')
  })

  test('graphemeKey uppercases', () => {
    expect(graphemeKey('é')).toBe('É')
    expect(graphemeKey('ß')).toBe('ß')
    expect(graphemeKey('ẞ')).toBe('ß')
  })
})
