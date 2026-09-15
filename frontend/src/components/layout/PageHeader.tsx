import type { ReactNode } from 'react'

export function PageHeader({
  title,
  subtitle,
  action,
  leading,
}: {
  title: string
  subtitle?: string
  action?: ReactNode
  /** Something beside the title — the customer page's initials circle. */
  leading?: ReactNode
}) {
  return (
    // min-w-0 and break-words because the title is often a name the supplier
    // typed — a customer or a business — and nothing stops that being long
    // with no spaces in it. A flex child will not shrink below its content
    // without min-w-0, so an 85-character name pushed this page out to 867px
    // on a 360px phone and the whole app scrolled sideways.
    <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
      <div className="flex min-w-0 items-center gap-3">
        {leading}
        <div className="min-w-0 break-words">
          <h1 className="text-xl font-bold text-ink sm:text-2xl">{title}</h1>
          {subtitle && <p className="mt-0.5 text-sm text-muted">{subtitle}</p>}
        </div>
      </div>
      {action}
    </div>
  )
}
