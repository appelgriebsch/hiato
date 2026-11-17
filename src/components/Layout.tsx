import { useEffect, useRef, type CSSProperties, type ReactNode } from 'react'

export function Layout({
  children,
  footer,
  footerBleed = false,
  aside,
  columns = 'minmax(0, 1fr) minmax(0, 1fr)',
  hideFooterInShortLand = false,
}: {
  children: ReactNode
  footer?: ReactNode
  /**
   * Footer spans the full column edge-to-edge (breaks out of `px-4`), e.g.
   * the pinned Play letter pad in the bottom thumb zone (#138).
   */
  footerBleed?: boolean
  /**
   * Right column under short-land only. Portrait keeps `footer`.
   * Direct children should be the TopBar plus one main column.
   */
  aside?: ReactNode
  /** Grid template columns for the short-land shell (`aside` set). */
  columns?: string
  /** Portrait footer stays; short-land hides it (picker CTA moves into the column). */
  hideFooterInShortLand?: boolean
}) {
  const footerRef = useRef<HTMLDivElement | null>(null)
  const hasFooter = footer != null
  // The document scrolls (the column is not a scrollport). Reserve the sticky
  // footer's height as root scroll padding so scrollIntoView can park the
  // last content element fully above the footer (#307).
  useEffect(() => {
    if (!hasFooter) return
    const root = document.documentElement
    const footerEl = footerRef.current
    if (!footerEl) return
    const apply = () => {
      root.style.setProperty('scroll-padding-bottom', `${footerEl.offsetHeight}px`)
    }
    apply()
    const observer = new ResizeObserver(apply)
    observer.observe(footerEl)
    return () => {
      observer.disconnect()
      root.style.removeProperty('scroll-padding-bottom')
    }
  }, [hasFooter])
  return (
    <div
      data-layout-shell
      className={[
        'mx-auto flex min-h-dvh w-full max-w-md flex-col bg-cream px-4',
        'pt-[env(safe-area-inset-top)]',
        footer ? '' : 'pb-[env(safe-area-inset-bottom)]',
      ].join(' ')}
    >
      <div
        data-layout-scroll
        data-short-land-cols={aside ? '' : undefined}
        style={
          aside
            ? ({ '--short-land-cols': columns } as CSSProperties)
            : undefined
        }
        className={[
          // No vertical scrollport: overflow-y other than visible clips pixel frames on the right.
          'flex min-h-0 flex-1 flex-col py-4',
          'short-land:py-0',
          footer ? 'scroll-pb-6 pb-2' : '',
        ].join(' ')}
      >
        {children}
        {aside ? (
          <div
            data-layout-aside
            className="hidden min-h-0 min-w-0 short-land:col-start-2 short-land:row-start-2 short-land:flex short-land:items-center"
          >
            {aside}
          </div>
        ) : null}
      </div>
      {footer ? (
        <div
          data-layout-footer
          ref={footerRef}
          className={[
            'sticky bottom-0 z-10 shrink-0 border-t border-line bg-cream pb-[env(safe-area-inset-bottom)]',
            footerBleed
              ? '-mx-4 pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)]'
              : '',
            aside || hideFooterInShortLand ? 'short-land:hidden' : '',
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
    <header className="mb-4 flex min-h-11 items-center justify-between gap-2 short-land:col-span-2 short-land:mb-1.5">
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
