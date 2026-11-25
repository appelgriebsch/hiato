import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, test } from 'bun:test'

/**
 * #369 W8: the name gate's three generation-side call sites in
 * `scripts/expand-packs.ts` (`okLemma`, `glossRejected`, the FR/IT `accept`
 * predicate) are load-bearing. `packs:check` still catches a listed name in a
 * shipped pack, but nothing else failed when any of the three was reverted, so
 * these tests pin the call sites by reading the source: deleting or bypassing
 * the `listedNameRejected` call in any one of them fails `bun test`.
 */
const SRC = readFileSync(path.join(import.meta.dir, 'expand-packs.ts'), 'utf8')

/** Source from `anchor` up to the next line that closes the block at column 0. */
function bodyOf(anchor: RegExp, maxChars = 1200): string {
  const m = anchor.exec(SRC)
  if (!m) throw new Error(`anchor ${anchor} missing from expand-packs.ts`)
  const rest = SRC.slice(m.index, m.index + maxChars)
  const end = rest.search(/^\}/m)
  return end >= 0 ? rest.slice(0, end) : rest
}

describe('#369 W8: name-gate call sites in expand-packs.ts', () => {
  test('okLemma rejects a listed name via listedNameRejected', () => {
    expect(bodyOf(/function okLemma\(/)).toContain('listedNameRejected(')
  })

  test('glossRejected rejects a listed name via listedNameRejected', () => {
    expect(bodyOf(/function glossRejected\(/)).toContain('listedNameRejected(')
  })

  test('the FR/IT selectFrBands accept predicate rejects a listed name', () => {
    const m = /accept: \(word\) =>/.exec(SRC)
    if (!m) throw new Error('accept predicate missing from expand-packs.ts')
    const window = SRC.slice(m.index, m.index + 300)
    expect(window).toContain('!listedNameRejected(')
  })

  test('at least three listedNameRejected call sites exist in the file', () => {
    expect(SRC.match(/listedNameRejected\(/g)?.length ?? 0).toBeGreaterThanOrEqual(3)
  })

  test('#369 S4: okLemma also applies the pt-scoped PT_EXPAND_EXCLUDE', () => {
    expect(bodyOf(/function okLemma\(/)).toContain('PT_EXPAND_EXCLUDE')
  })
})
