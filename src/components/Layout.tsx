import type { ReactNode } from 'react'

export function Layout({
  children,
  footer,
}: {
  children: ReactNode
  footer?: ReactNode
}) {
  return (
    <div className="mx-auto flex min-h-full w-full max-w-md flex-col bg-cream px-4 pb-[env(safe-area-inset-bottom)]">
      <div className="flex flex-1 flex-col py-4">
        {children}
      </div>
      {footer}
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
