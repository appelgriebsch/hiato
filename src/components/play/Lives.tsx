export function Lives({
  remaining,
  total = 6,
}: {
  remaining: number
  total?: number
}) {
  return (
    <div
      className="flex items-center gap-1.5"
      aria-label={`${remaining} of ${total} lives`}
    >
      {Array.from({ length: total }, (_, i) => (
        <span
          key={i}
          className={[
            'inline-flex h-5 w-5 items-center justify-center text-base leading-none transition-opacity',
            i < remaining ? 'opacity-100' : 'opacity-25 grayscale',
          ].join(' ')}
          aria-hidden
        >
          ♥
        </span>
      ))}
    </div>
  )
}
