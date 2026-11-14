import { describe, expect, test } from 'bun:test'
import { cn } from './utils'

describe('cn', () => {
  test('merges class names', () => {
    expect(cn('px-2', 'px-4')).toBe('px-4')
    const hidden = false
    expect(cn('text-ink', hidden && 'hidden', 'font-medium')).toBe(
      'text-ink font-medium',
    )
  })

  test('keeps text-pixel-* next to a text colour', () => {
    expect(cn('text-pixel-title bg-accent text-white')).toBe(
      'text-pixel-title bg-accent text-white',
    )
    expect(cn('text-pixel-label text-ink', 'text-accent-fg')).toBe(
      'text-pixel-label text-accent-fg',
    )
    expect(cn('text-lg', 'text-pixel-title')).toBe('text-pixel-title')
  })
})
