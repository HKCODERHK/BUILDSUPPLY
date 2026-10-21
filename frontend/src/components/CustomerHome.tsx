import { useEffect, type ComponentType, type ReactNode, type Ref } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, BookOpen, MapPin, ShoppingCart, Store } from 'lucide-react'
import { Tipper } from '@/components/art'
import { LanguageToggle } from '@/components/LanguageToggle'
import { ThemeToggle } from '@/components/ThemeToggle'
import { useTheme } from '@/context/ThemeContext'
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

/**
 * The customer pages' top bar (#14): the shop's logo and its full name, which
 * is what the customer came for — BuildSupply stays as the small badge at the
 * foot of the page. Until the shop is known (loading, a dead link), the
 * BuildSupply mark and name stand in. The name wraps to two lines rather than
 * being cut off.
 */
export function CustomerHeader({
  shop,
  onLogo,
  logoLabel,
  barRef,
  title,
  onBack,
  backLabel,
  minimal = false,
  ownerPhoto,
  onOwner,
  ownerLabel,
  switcher,
}: {
  shop?: { business_name: string; logo_url?: string | null } | null
  /** Tapping the logo opens it full size. */
  onLogo?: () => void
  logoLabel?: string
  barRef?: Ref<HTMLElement>
  /** Shown instead of a shop, e.g. "My BuildSupply" on /me with no shop. */
  title?: string
  /** A ← before the mark, for a page reached from somewhere it can go back to. */
  onBack?: () => void
  backLabel?: string
  /**
   * No bar at all (the user's call, 2026-10-21, for the order page and the
   * khata link): only the shop's logo and the owner's photo at the top left.
   * Language and day/night are in Profile.
   */
  minimal?: boolean
  ownerPhoto?: string | null
  onOwner?: () => void
  ownerLabel?: string
  /** The Order | Khata switch at the top right (minimal top only). */
  switcher?: PageSwitch | null
}) {
  if (minimal) {
    return (
      <MinimalTop shop={shop} onLogo={onLogo} logoLabel={logoLabel} ownerPhoto={ownerPhoto} onOwner={onOwner} ownerLabel={ownerLabel} switcher={switcher} />
    )
  }
  // 44px, like every other control on these pages (#30).
  const toggles = 'h-11 min-w-11 w-11 border-white/20 text-white hover:bg-white/10 hover:text-white'
  let mark: ReactNode
  if (shop?.logo_url) {
    const img = <img src={shop.logo_url} alt="" className="h-9 w-9 rounded-lg bg-white object-cover" />
    mark = onLogo ? (
      <button type="button" aria-label={logoLabel} onClick={onLogo} className="shrink-0">
        {img}
      </button>
    ) : (
      <span className="shrink-0">{img}</span>
    )
  } else if (shop) {
    mark = (
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white/10">
        <Store size={18} />
      </span>
    )
  } else {
    mark = (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#35A85D" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="shrink-0" aria-hidden="true">
        <path d="M3 21h18" />
        <path d="M5 21V8l5-4v17" />
        <path d="M10 21V11l6 3v7" />
        <path d="M16 21v-4l3 1.5V21" />
      </svg>
    )
  }
  return (
    <header ref={barRef} className="sticky top-0 z-30 bg-shell px-4 pb-3 pt-[calc(0.75rem_+_var(--safe-top))] text-white">
      <div className="mx-auto flex min-h-11 max-w-lg items-center gap-2.5">
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            aria-label={backLabel}
            className="-ml-2 flex h-11 w-11 shrink-0 items-center justify-center rounded-full hover:bg-white/10"
          >
            <ArrowLeft size={20} />
          </button>
        )}
        {mark}
        {/* A long name ("… Suppliers Private Limited") steps down a size and
            may take a third line, so it is read whole rather than cut off. */}
        <span
          className={cn(
            'min-w-0 flex-1 break-words font-bold leading-tight',
            !shop ? 'text-lg' : shop.business_name.length > 24 ? 'line-clamp-3 text-sm' : 'line-clamp-2 text-base',
          )}
        >
          {shop?.business_name ?? title ?? 'BuildSupply'}
        </span>
        <div className="flex shrink-0 items-center gap-2">
          <LanguageToggle globeOnly className={toggles} />
          <ThemeToggle className={toggles} />
        </div>
      </div>
    </header>
  )
}

export interface PageSwitch {
  active: 'order' | 'khata'
  orderLabel: string
  khataLabel: string
  onOrder: () => void
  onKhata: () => void
}

/**
 * A small two-way switch between a shop's order page and the customer's
 * khata (the user's ask, 2026-10-21) — the same customer's two pages, one
 * tap apart. Only shown where both exist.
 */
function PageSwitcher({ s }: { s: PageSwitch }) {
  const item = (key: 'order' | 'khata', label: string, Icon: Icon, onClick: () => void) => {
    const on = s.active === key
    return (
      <button
        type="button"
        role="tab"
        aria-selected={on}
        onClick={on ? undefined : onClick}
        className={cn(
          'flex h-9 items-center gap-1.5 rounded-full px-3 text-xs font-semibold transition-colors',
          on ? 'bg-accent text-white shadow-sm' : 'text-muted hover:text-ink',
        )}
      >
        <Icon size={14} strokeWidth={2} />
        {label}
      </button>
    )
  }
  return (
    <div role="tablist" className="ml-auto flex shrink-0 items-center rounded-full border border-border bg-card p-1 shadow-[0_2px_10px_rgba(10,36,39,0.08)]">
      {item('order', s.orderLabel, ShoppingCart, s.onOrder)}
      {item('khata', s.khataLabel, BookOpen, s.onKhata)}
    </div>
  )
}

/** The minimal top: the shop's logo and the owner's photo, and the switch where both pages exist. */
function MinimalTop({
  shop,
  onLogo,
  logoLabel,
  ownerPhoto,
  onOwner,
  ownerLabel,
  switcher,
}: {
  shop?: { business_name: string; logo_url?: string | null } | null
  onLogo?: () => void
  logoLabel?: string
  ownerPhoto?: string | null
  onOwner?: () => void
  ownerLabel?: string
  switcher?: PageSwitch | null
}) {
  const { theme } = useTheme()
  // With no dark bar under it, the phone's status bar takes the page's own
  // colour, and gets the old one back when the page goes.
  useEffect(() => {
    const meta = document.querySelector('meta[name="theme-color"]')
    if (!meta) return
    const before = meta.getAttribute('content')
    const id = window.requestAnimationFrame(() => {
      meta.setAttribute('content', getComputedStyle(document.body).backgroundColor || (theme === 'dark' ? '#0a2427' : '#f5f7f6'))
    })
    return () => {
      window.cancelAnimationFrame(id)
      if (before) meta.setAttribute('content', before)
    }
  }, [theme])
  const tile = 'h-12 w-12 shrink-0 overflow-hidden rounded-2xl bg-white shadow-[0_2px_10px_rgba(10,36,39,0.12)] ring-1 ring-border'
  const logo = shop?.logo_url ? (
    <img src={shop.logo_url} alt="" className="h-full w-full object-cover" />
  ) : (
    <span className="flex h-full w-full items-center justify-center bg-accent-bg text-accent-text">
      <Store size={22} />
    </span>
  )
  return (
    <header className="px-4 pt-[calc(0.75rem_+_var(--safe-top))]">
      <div className="mx-auto flex max-w-lg items-center sm:max-w-2xl">
        {/* Read aloud, since the name is no longer written at the top. */}
        {shop && <h1 className="sr-only">{shop.business_name}</h1>}
        {onLogo && shop?.logo_url ? (
          <button type="button" aria-label={logoLabel} onClick={onLogo} className={tile}>
            {logo}
          </button>
        ) : (
          <span className={tile}>{logo}</span>
        )}
        {ownerPhoto && (
          <button
            type="button"
            aria-label={ownerLabel}
            onClick={onOwner}
            className="-ml-2.5 h-12 w-12 shrink-0 overflow-hidden rounded-full border-2 border-surface bg-surface shadow-[0_2px_10px_rgba(10,36,39,0.12)]"
          >
            <img src={ownerPhoto} alt="" className="h-full w-full object-cover" />
          </button>
        )}
        {switcher && <PageSwitcher s={switcher} />}
      </div>
    </header>
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
              {/* Two lines rather than cut off (#15, #32). */}
              <span className="line-clamp-2 w-full break-words text-center text-xs font-medium leading-tight text-ink">{a.label}</span>
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
        <button type="button" onClick={onAction} className="inline-flex min-h-11 shrink-0 items-center text-xs font-semibold text-accent">
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
      className="flex min-w-0 items-center gap-3 rounded-2xl border border-border bg-card p-3 text-left shadow-[0_2px_10px_rgba(10,36,39,0.04)] transition-colors hover:bg-surface active:bg-surface max-[359px]:gap-2"
    >
      {/* A smaller icon on the narrowest phones, so "Payments" fits whole (#32). */}
      <span className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-xl max-[359px]:h-8 max-[359px]:w-8', TINTS[tint])}>
        <I size={19} strokeWidth={1.9} />
      </span>
      <span className="min-w-0">
        <span className="block truncate text-sm font-semibold text-ink">{title}</span>
        {detail && <span className="line-clamp-2 block text-xs leading-snug text-muted">{detail}</span>}
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
              'flex min-w-0 flex-col items-center gap-0.5 rounded-2xl py-1.5 text-xs font-medium transition-colors',
              tab.active ? 'bg-accent-bg text-accent-text' : 'text-muted hover:text-ink',
            )}
          >
            <tab.icon size={20} strokeWidth={tab.active ? 2.2 : 1.8} />
            {/* Two short lines rather than a cut-off word at 12px (#31, #32). */}
            <span className="line-clamp-2 w-full break-words text-center leading-tight">{tab.label}</span>
          </button>
        ))}
      </div>
    </nav>
  )
}

export interface AppBarItem {
  key: string
  icon: Icon
  label: string
  active?: boolean
  onClick: () => void
}

/**
 * The order page's own bar, from the user's grocery-app reference
 * (2026-10-21): tabs either side of a raised round cart button carrying how
 * many materials are in the order. Rounded, frosted and clear of the edges,
 * like the other customer tab bar. The page keeps `pb-44` free for it.
 */
export function ShopAppBar({
  left,
  right,
  cart,
}: {
  left: AppBarItem[]
  right: AppBarItem[]
  cart: { label: string; count: number; active: boolean; onClick: () => void; icon?: Icon }
}) {
  const CartIcon = cart.icon ?? ShoppingCart
  const tab = (item: AppBarItem) => (
    <button
      key={item.key}
      type="button"
      onClick={item.onClick}
      aria-current={item.active ? 'page' : undefined}
      className={cn(
        'flex min-w-0 flex-1 flex-col items-center gap-0.5 rounded-2xl py-1.5 text-[11px] font-medium transition-colors',
        item.active ? 'text-accent-text' : 'text-muted hover:text-ink',
      )}
    >
      <item.icon size={21} strokeWidth={item.active ? 2.3 : 1.8} />
      <span className="line-clamp-1 w-full break-all text-center leading-tight">{item.label}</span>
    </button>
  )
  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 px-3 pb-[calc(0.5rem_+_var(--safe-bottom))] pl-[calc(0.75rem_+_var(--safe-left))] pr-[calc(0.75rem_+_var(--safe-right))]">
      <div className="relative mx-auto flex max-w-md items-end rounded-3xl border border-border bg-card/90 px-1.5 py-1.5 shadow-[0_6px_24px_rgba(10,36,39,0.14)] backdrop-blur-lg backdrop-saturate-150">
        <div className="flex flex-1">{left.map(tab)}</div>
        {/* The cart: a raised round button in the middle, as in the reference. */}
        <div className="flex w-20 shrink-0 justify-center">
          <button
            type="button"
            onClick={cart.onClick}
            aria-label={cart.label}
            aria-current={cart.active ? 'page' : undefined}
            className={cn(
              'relative -mt-8 flex h-16 w-16 items-center justify-center rounded-full border-4 border-surface text-white shadow-[0_8px_20px_rgba(10,36,39,0.25)] transition-transform active:scale-95',
              'bg-accent',
            )}
          >
            <CartIcon size={24} strokeWidth={2} />
            {cart.count > 0 && (
              <span className="absolute -right-1 -top-1 flex h-6 min-w-6 items-center justify-center rounded-full border-2 border-surface bg-amber-500 px-1 text-[11px] font-bold text-white">
                {cart.count > 99 ? '99+' : cart.count}
              </span>
            )}
          </button>
        </div>
        <div className="flex flex-1">{right.map(tab)}</div>
      </div>
    </nav>
  )
}
