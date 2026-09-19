const EN_ROWS: string[][] = [
  ['Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P'],
  ['A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L'],
  ['Z', 'X', 'C', 'V', 'B', 'N', 'M'],
]

export function Keyboard({
  usedWrong,
  usedCorrect,
  disabled,
  onKey,
}: {
  usedWrong: Set<string>
  usedCorrect: Set<string>
  disabled?: boolean
  onKey: (letter: string) => void
}) {
  return (
    <div className="flex w-full flex-col gap-1.5" role="group" aria-label="Letter pad">
      {EN_ROWS.map((row, ri) => (
        <div key={ri} className="flex justify-center gap-1">
          {row.map((key) => {
            const k = key.toUpperCase()
            const wrong = usedWrong.has(k)
            const correct = usedCorrect.has(k)
            return (
              <button
                key={key}
                type="button"
                disabled={disabled || wrong || correct}
                onClick={() => onKey(key)}
                className={[
                  'min-h-11 min-w-[1.7rem] flex-1 rounded-lg text-sm font-semibold uppercase transition-all active:scale-95 sm:min-w-8',
                  wrong
                    ? 'bg-wrong text-white'
                    : correct
                      ? 'bg-accent text-white'
                      : 'bg-white border border-line text-ink hover:bg-cream-dark',
                ].join(' ')}
              >
                {key}
              </button>
            )
          })}
        </div>
      ))}
    </div>
  )
}
