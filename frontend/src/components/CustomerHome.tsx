import type { ComponentType, ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { MapPin } from 'lucide-react'
import { Tipper } from '@/components/art'
import { cn } from '@/lib/utils'
import { TINTS, type Tint } from '@/lib/customerHome'

/**
 * The pieces of the customer pages' app-style home (2026-10-08, from a
 * delivery-app reference the user shared): soft rounded cards, a row of quick
 * actions, tinted tiles, a delivery card and a floating tab bar. Shared by the
 * khata link, the order page and the order status page so the three look like
 * one app.
 */

type Icon = ComponentType<{ size?: number; strokeWidth?: number; className?: string }>

/** The soft card every block on these pages sits in. */
export function SoftCard({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div className={cn('rounded-3xl border border-border bg-card shadow-[0_2px_10px_rgba(10,36,39,0.05)]', className)}>
      {children}
    </div>
  )
}


export interface QuickAction {
  key: string
  icon: Icon
  label: string
  onClick?: () => void
  to?: string
  href?: string
}

/** A row of small actions in one card: a tinted square icon over a short word. */
export function QuickActions({ actions }: { actions: QuickAction[] }) {
  if (actions.length === 0) return null
  return (
    <SoftCard className="p-2">
      <div className="grid" style={{ gridTemplateColumns: `repeat(${actions.length}, minmax(0, 1fr))` }}>
        {actions.map((a) => {
          const inner = (
            <>
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent-bg text-accent-text">
                <a.icon size={19} strokeWidth={1.9} />
              </span>
              <span className="w-full truncate text-center text-xs font-medium text-ink">{a.label}</span>
            </>
          )
          const className =
            'flex min-w-0 flex-col items-center gap-1.5 rounded-2xl px-1 py-2.5 transition-colors hover:bg-surface active:bg-surface'
          if (a.to)
            return (
              <Link key={a.key} to={a.to} className={className}>
                {inner}
              </Link>
            )
          if (a.href)
            return (
              <a key={a.key} href={a.href} className={className}>
                {inner}
              </a>
            )
          return (
            <button key={a.key} type="button" onClick={a.onClick} className={className}>
              {inner}
            </button>
          )
        })}
      </div>
    </SoftCard>
  )
}

/** A heading over a block, with an optional "See all" on the right. */
export function SectionHeading({ title, action, onAction }: { title: string; action?: string; onAction?: () => void }) {
  return (
    <div className="flex items-baseline justify-between gap-3 px-1">
      <h2 className="text-base font-bold text-ink">{title}</h2>
      {action && onAction && (
        <button type="button" onClick={onAction} className="shrink-0 text-xs font-semibold text-accent">
          {action}
        </button>
      )}
    </div>
  )
}

/** A half-width tile: a tinted icon beside a title and a short line under it. */
export function SoftTile({
  icon: I,
  tint,
  title,
  detail,
  onClick,
}: {
  icon: Icon
  tint: Tint
  title: string
  detail?: string | null
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex min-w-0 items-center gap-3 rounded-2xl border border-border bg-card p-3 text-left shadow-[0_2px_10px_rgba(10,36,39,0.04)] transition-colors hover:bg-surface active:bg-surface"
    >
      <span className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-xl', TINTS[tint])}>
        <I size={19} strokeWidth={1.9} />
      </span>
      <span className="min-w-0">
        <span className="block truncate text-sm font-semibold text-ink">{title}</span>
        {detail && <span className="line-clamp-2 block text-[11px] leading-snug text-muted">{detail}</span>}
      </span>
    </button>
  )
}

/**
 * The strip across the top of the delivery card, standing in for the
 * reference's map. There is no live tracking in this app — no driver GPS, and
 * none is coming — so this never pretends to be one: the tipper simply stands
 * at the shop until the bill is delivered, and at the site once it is.
 */
export function DeliveryStrip({ at }: { at: 'shop' | 'site' }) {
  return (
    <div className="relative h-24 overflow-hidden rounded-t-3xl bg-accent-bg">
      {/* faint blocks, like a street plan seen from above */}
      <div className="absolute inset-0 opacity-60 [background-image:linear-gradient(var(--color-card)_2px,transparent_2px),linear-gradient(90deg,var(--color-card)_2px,transparent_2px)] [background-size:44px_30px]" />
      {/* the road and the route along it */}
      <div className="absolute inset-x-6 top-[62px] border-t-[3px] border-dashed border-accent/50" />
      <span className="absolute left-4 top-[54px] h-4 w-4 rounded-full border-[3px] border-accent bg-card" />
      <span className="absolute right-3 top-[34px] flex h-8 w-8 items-center justify-center rounded-full bg-accent text-white shadow">
        <MapPin size={16} strokeWidth={2.2} />
      </span>
      <svg
        viewBox="0 0 112 56"
        className={cn(
          'absolute top-[30px] h-[34px] w-[68px] transition-[left] duration-700 motion-reduce:transition-none',
          at === 'site' ? 'left-[calc(100%-118px)]' : 'left-7',
        )}
        aria-hidden="true"
      >
        <Tipper />
      </svg>
    </div>
  )
}

export interface TabItem {
  key: string
  icon: Icon
  label: string
  active: boolean
  onClick: () => void
}

/**
 * The floating tab bar along the bottom — the supplier app's own shape (a
 * rounded, frosted bar clear of the edges), so the customer's pages read as
 * the same app. The page reserves room for it with `pb-28`.
 */
export function CustomerTabBar({ tabs }: { tabs: TabItem[] }) {
  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 px-3 pb-[calc(0.5rem_+_var(--safe-bottom))] pl-[calc(0.75rem_+_var(--safe-left))] pr-[calc(0.75rem_+_var(--safe-right))]">
      <div
        className="mx-auto grid max-w-md rounded-3xl border border-border bg-card/80 p-1.5 shadow-[0_6px_24px_rgba(10,36,39,0.12)] backdrop-blur-lg backdrop-saturate-150"
        style={{ gridTemplateColumns: `repeat(${tabs.length}, minmax(0, 1fr))` }}
      >
        {tabs.map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={tab.onClick}
            aria-current={tab.active ? 'page' : undefined}
            className={cn(
              'flex min-w-0 flex-col items-center gap-0.5 rounded-2xl py-1.5 text-[11px] font-medium transition-colors max-[359px]:text-[10px]',
              tab.active ? 'bg-accent-bg text-accent-text' : 'text-muted hover:text-ink',
            )}
          >
            <tab.icon size={20} strokeWidth={tab.active ? 2.2 : 1.8} />
            <span className="w-full truncate text-center">{tab.label}</span>
          </button>
        ))}
      </div>
    </nav>
  )
}
