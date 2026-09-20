import { NO_HINT_COPY } from '@/packs/labels'
import type { PackLang, PackLemma } from '@/packs/schema'

function hasLearnerContent(entry: PackLemma): boolean {
  const gloss = entry.gloss?.trim() ?? ''
  const syns = (entry.synonyms ?? []).filter((s) => s.trim().length > 0)
  return gloss.length > 0 || syns.length > 0
}

/** Compact dictionary + synonym chips under the gap word. Never shows the lemma. */
export function LearnerHint({
  entry,
  lang = 'en',
}: {
  entry: PackLemma
  lang?: PackLang
}) {
  const gloss = entry.gloss?.trim() ?? ''
  const synonyms = (entry.synonyms ?? [])
    .filter((s) => s.trim().length > 0)
    .slice(0, 3)

  if (!hasLearnerContent(entry)) {
    const empty = NO_HINT_COPY[lang]
    return (
      <div
        className="mx-auto mt-4 w-full max-w-sm rounded-xl border border-dashed border-line bg-white/50 px-3 py-2.5 text-center"
        aria-label={empty}
      >
        <p className="text-[11px] text-ink-faint">{empty}</p>
      </div>
    )
  }

  return (
    <div className="mx-auto mt-4 w-full max-w-sm rounded-xl border border-line/80 bg-white/80 px-3.5 py-3 text-center shadow-[0_1px_0_rgba(28,27,25,0.03)]">
      {gloss ? (
        <p className="text-[13px] leading-snug text-ink-muted">{gloss}</p>
      ) : null}
      {synonyms.length > 0 && (
        <div
          className={['flex flex-wrap justify-center gap-1.5', gloss ? 'mt-2.5' : ''].join(
            ' ',
          )}
        >
          {synonyms.map((s) => (
            <span
              key={s}
              className="inline-flex items-center rounded-full bg-cream-dark/90 px-2.5 py-1 text-[11px] font-medium text-ink-muted"
            >
              {s}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}
