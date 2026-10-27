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
})
