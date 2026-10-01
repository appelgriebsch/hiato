import { describe, expect, test } from 'bun:test'
import { letterGridRowLengths } from './LetterGrid'

describe('letterGridRowLengths (#103)', () => {
  test('short words stay on one row (≤7)', () => {
    expect(letterGridRowLengths(0)).toEqual([])
    expect(letterGridRowLengths(1)).toEqual([1])
    expect(letterGridRowLengths(5)).toEqual([5])
    expect(letterGridRowLengths(7)).toEqual([7])
  })

  test('long words use intentional equal-ish rows (no orphan)', () => {
    expect(letterGridRowLengths(8)).toEqual([4, 4])
    expect(letterGridRowLengths(9)).toEqual([5, 4])
    expect(letterGridRowLengths(10)).toEqual([5, 5])
    expect(letterGridRowLengths(11)).toEqual([6, 5])
    expect(letterGridRowLengths(12)).toEqual([6, 6])
    expect(letterGridRowLengths(14)).toEqual([7, 7])
  })

  test('never leaves a single orphan on the last row when n > 1', () => {
    for (let n = 2; n <= 24; n++) {
      const rows = letterGridRowLengths(n)
      expect(rows.reduce((a, b) => a + b, 0)).toBe(n)
      expect(rows.at(-1)!).toBeGreaterThan(1)
      expect(rows.every((r) => r > 0)).toBe(true)
    }
  })

  test('explicit balanced splits for 13 and 17', () => {
    expect(letterGridRowLengths(13)).toEqual([7, 6])
    expect(letterGridRowLengths(17)).toEqual([6, 6, 5])
  })

  test('very long words use three balanced rows', () => {
    expect(letterGridRowLengths(15)).toEqual([5, 5, 5])
    expect(letterGridRowLengths(16)).toEqual([6, 5, 5])
  })
})
