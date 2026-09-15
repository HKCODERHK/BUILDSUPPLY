import type { ReactNode } from 'react'
import { CustomerAvatar } from '@/components/CustomerAvatar'
import { useTopBar } from '@/context/TopBarContext'

export function PageHeader({
  title,
  subtitle,
  action,
  avatar,
  topDetail,
  topDetailTone,
}: {
  title: string
  subtitle?: string
  action?: ReactNode
  /** The customer page's initials circle — beside the title, and in the top bar. */
  avatar?: { id: string; name: string }
  /** A small line under the title in the phone's top bar (the customer's balance). */
  topDetail?: string
  topDetailTone?: 'due' | 'good'
}) {
  // On a phone the top bar names the screen (Telegram-style), so the big
  // heading here would only repeat it — it shows from lg up, where there is no
  // top bar. The grey line and the buttons stay everywhere.
  useTopBar({ title, avatar, detail: topDetail, detailTone: topDetailTone })

  return (
    // min-w-0 and break-words because the title is often a name the supplier
    // typed — a customer or a business — and nothing stops that being long
    // with no spaces in it. A flex child will not shrink below its content
    // without min-w-0, so an 85-character name pushed this page out to 867px
    // on a 360px phone and the whole app scrolled sideways.
    <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
      <div className="flex min-w-0 items-center gap-3">
        {avatar && (
          <span className="hidden lg:inline-flex">
            <CustomerAvatar id={avatar.id} name={avatar.name} size={44} />
          </span>
        )}
        <div className="min-w-0 break-words">
          <h1 className="hidden text-xl font-bold text-ink sm:text-2xl lg:block">{title}</h1>
          {subtitle && <p className="text-sm text-muted lg:mt-0.5">{subtitle}</p>}
        </div>
      </div>
      {action}
    </div>
  )
}
