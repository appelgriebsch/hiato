import { useEffect, useMemo, useRef, useState } from 'react'
import type { CellState } from '@/engine'

/**
 * Intentional equal-ish row lengths for letter tiles.
 * Words longer than 7 never leave a single orphan on the last row
 * (e.g. 8 → 4+4, 9 → 5+4).
 */
export function letterGridRowLengths(n: number): number[] {
  if (n <= 0) return []
  if (n <= 7) return [n]
  if (n <= 14) {
    const top = Math.ceil(n / 2)
    return [top, n - top]
  }
  // Three balanced rows for very long words
  const base = Math.floor(n / 3)
  const rem = n % 3
  const rows = [base + (rem > 0 ? 1 : 0), base + (rem > 1 ? 1 : 0), base]
  return rows.filter((r) => r > 0)
}

export function LetterGrid({ cells }: { cells: CellState[] }) {
  const prevRevealed = useRef<boolean[]>([])
  const [justRevealed, setJustRevealed] = useState<Set<number>>(new Set())

  useEffect(() => {
    const newly = new Set<number>()
    cells.forEach((cell, i) => {
      const was = prevRevealed.current[i] ?? false
      if (cell.revealed && !was) newly.add(i)
    })
    prevRevealed.current = cells.map((c) => c.revealed)
    if (newly.size === 0) return
    setJustRevealed(newly)
    const t = window.setTimeout(() => setJustRevealed(new Set()), 320)
    return () => clearTimeout(t)
  }, [cells])

  const rows = useMemo(() => {
    const lengths = letterGridRowLengths(cells.length)
    const out: { cell: CellState; index: number }[][] = []
    let offset = 0
    for (const len of lengths) {
      out.push(
        cells.slice(offset, offset + len).map((cell, j) => ({
          cell,
          index: offset + j,
        })),
      )
      offset += len
    }
    return out
  }, [cells])

  const maxCols = Math.max(1, ...rows.map((r) => r.length))

  return (
    <div
      className="mx-auto flex w-full max-w-sm flex-col items-center gap-2"
      role="group"
      aria-label="Word letters"
      data-letter-grid
      data-cols={maxCols}
    >
      {rows.map((row, ri) => (
        <div
          key={ri}
          className="grid w-full justify-items-center gap-2 sm:gap-2.5"
          style={{
            gridTemplateColumns: `repeat(${row.length}, minmax(0, 1fr))`,
            maxWidth: row.length <= 4 ? '14rem' : row.length <= 6 ? '20rem' : '100%',
          }}
          data-letter-row={ri}
          data-row-len={row.length}
        >
          {row.map(({ cell, index: i }) => (
            <div
              key={i}
              className={[
                'flex aspect-square w-full max-w-11 items-center justify-center rounded-lg border-2 text-xl font-semibold uppercase sm:max-w-12',
                'transition-[border-color,background-color,color] duration-200',
                cell.revealed
                  ? cell.helped
                    ? 'border-accent-fg bg-helped text-accent-fg'
                    : 'border-accent-fg bg-accent-soft text-ink'
                  : 'border-line bg-raised text-ink-faint',
                justRevealed.has(i) ? 'motion-letter-reveal' : '',
              ].join(' ')}
            >
              {cell.revealed ? cell.char : '·'}
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}
