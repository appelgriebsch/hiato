import type { CellState } from '@/engine'

export function LetterGrid({ cells }: { cells: CellState[] }) {
  return (
    <div
      className="flex flex-wrap justify-center gap-1.5 sm:gap-2"
      role="group"
      aria-label="Word letters"
    >
      {cells.map((cell, i) => (
        <div
          key={i}
          className={[
            'flex h-12 w-10 items-center justify-center rounded-lg border-2 text-xl font-semibold uppercase sm:h-14 sm:w-11',
            cell.revealed
              ? cell.helped
                ? 'border-accent/40 bg-helped text-accent'
                : 'border-accent bg-accent-soft text-ink'
              : 'border-line bg-white text-ink-faint',
          ].join(' ')}
        >
          {cell.revealed ? cell.char : '·'}
        </div>
      ))}
    </div>
  )
}
