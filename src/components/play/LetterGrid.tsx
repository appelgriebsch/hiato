import { useEffect, useRef, useState } from 'react'
import type { CellState } from '@/engine'

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

  return (
    <div
      className="flex flex-wrap justify-center gap-2 sm:gap-2.5"
      role="group"
      aria-label="Word letters"
    >
      {cells.map((cell, i) => (
        <div
          key={i}
          className={[
            'flex h-12 w-10 items-center justify-center rounded-lg border-2 text-xl font-semibold uppercase sm:h-14 sm:w-11',
            'transition-[border-color,background-color,color] duration-200',
            cell.revealed
              ? cell.helped
                ? 'border-accent/40 bg-helped text-accent-fg'
                : 'border-accent bg-accent-soft text-ink'
              : 'border-line bg-raised text-ink-faint',
            justRevealed.has(i) ? 'motion-letter-reveal' : '',
          ].join(' ')}
        >
          {cell.revealed ? cell.char : '·'}
        </div>
      ))}
    </div>
  )
}
