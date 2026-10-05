import type { ReactNode } from 'react'

export function Layout({
  children,
  footer,
  footerBleed = false,
}: {
  children: ReactNode
  footer?: ReactNode
  /**
   * Footer spans the full column edge-to-edge (breaks out of `px-4`), e.g.
   * the pinned Play letter pad in the bottom thumb zone (#138).
   */
  footerBleed?: boolean
}) {
  return (
    <div
      className={[
        'mx-auto flex h-dvh w-full max-w-md flex-col bg-cream px-4',
        'pt-[env(safe-area-inset-top)]',
        footer ? '' : 'pb-[env(safe-area-inset-bottom)]',
      ].join(' ')}
    >
      <div
        className={[
          'flex min-h-0 flex-1 flex-col overflow-y-auto py-4',
          footer ? 'scroll-pb-6 pb-2' : '',
        ].join(' ')}
      >
        {children}
      </div>
      {footer ? (
        <div
          data-layout-footer
          className={[
            'sticky bottom-0 z-10 shrink-0 border-t border-line bg-cream pb-[env(safe-area-inset-bottom)]',
            footerBleed
              ? '-mx-4 pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)]'
              : '',
          ].join(' ')}
        >
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
