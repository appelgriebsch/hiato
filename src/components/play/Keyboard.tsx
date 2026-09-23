import { graphemeKey } from '@/engine'
import { KEYBOARDS } from '@/lib/keyboards'
import type { PackLang } from '@/packs/schema'

export function Keyboard({
  lang,
  usedWrong,
  usedCorrect,
  disabled,
  onKey,
  shakeKey,
}: {
  lang: PackLang
  usedWrong: Set<string>
  usedCorrect: Set<string>
  disabled?: boolean
  onKey: (letter: string) => void
  /** Grapheme key currently shaking (wrong guess feedback) */
  shakeKey?: string | null
}) {
  const rows = KEYBOARDS[lang]
  return (
    <div className="flex w-full flex-col gap-1.5" role="group" aria-label="Letter pad">
      {rows.map((row, ri) => (
        <div key={ri} className="flex justify-center gap-1">
          {row.map((key) => {
            const k = graphemeKey(key)
            const wrong = usedWrong.has(k)
            const correct = usedCorrect.has(k)
            const shaking = shakeKey === k
            return (
              <button
                key={key}
                type="button"
                disabled={disabled || wrong || correct}
                onClick={() => onKey(key)}
                className={[
                  'min-h-11 min-w-[1.7rem] flex-1 rounded-lg text-sm font-semibold uppercase motion-key-wrong-dim motion-press sm:min-w-8',
                  wrong
                    ? 'bg-wrong text-ink opacity-70'
                    : correct
                      ? 'bg-accent text-white'
                      : 'bg-raised border border-line text-ink hover:bg-cream-dark',
                  shaking ? 'motion-key-shake' : '',
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
