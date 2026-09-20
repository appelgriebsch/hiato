import type { ReactNode } from 'react'

export function Layout({
  children,
  footer,
}: {
  children: ReactNode
  footer?: ReactNode
}) {
  return (
    <div
      className={[
        'mx-auto flex h-dvh w-full max-w-md flex-col bg-cream px-4',
        'pt-[env(safe-area-inset-top)]',
        footer ? '' : 'pb-[env(safe-area-inset-bottom)]',
      ].join(' ')}
    >
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto py-4">
        {children}
      </div>
      {footer ? (
        <div className="sticky bottom-0 z-10 shrink-0 bg-cream pb-[env(safe-area-inset-bottom)]">
          {footer}
        </div>
      ) : null}
    </div>
  )
}

export function TopBar({
  left,
  center,
  right,
}: {
  left?: ReactNode
  center?: ReactNode
  right?: ReactNode
}) {
  return (
    <header className="mb-4 flex min-h-11 items-center justify-between gap-2">
      <div className="flex min-w-0 flex-1 items-center justify-start">
        {left}
      </div>
      <div className="shrink-0 text-center">
        {center}
      </div>
      <div className="flex min-w-0 flex-1 items-center justify-end">
        {right}
      </div>
    </header>
  )
}
