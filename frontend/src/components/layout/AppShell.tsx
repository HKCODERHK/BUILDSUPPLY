import { useEffect, useRef, useState, type ReactNode } from 'react'
import { NavLink, useLocation, useNavigate } from 'react-router-dom'
import { LogOut, MoreHorizontal, X, ShieldCheck, Boxes, SlidersHorizontal, AlertTriangle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAuth } from '@/context/AuthContext'
import { useLanguage } from '@/context/LanguageContext'
import { ThemeToggle } from '@/components/ThemeToggle'
import { LanguageToggle } from '@/components/LanguageToggle'
import { WhatsAppIcon } from '@/components/icons/WhatsAppIcon'
import { ShareDocumentPrompt } from '@/components/ShareDocumentPrompt'
import { openWhatsAppShare } from '@/lib/whatsapp'
import { ADMIN_WHATSAPP_NUMBER } from '@/lib/adminContact'
import { daysUntilExpiry, subscriptionState } from '@/lib/subscription'
import { countPendingOrders } from '@/services/orders'
import { NAV_ITEMS, MOBILE_PRIMARY_IDS, ADMIN_NAV_IDS } from './nav-items'

// Shown in the desktop sidebar header and, on mobile, in the top bar.
function Brand({ compact = false }: { compact?: boolean }) {
  const { t } = useLanguage()
  return (
    <div className="flex items-center gap-2">
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#35A85D" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
        <path d="M3 21h18" />
        <path d="M5 21V8l5-4v17" />
        <path d="M10 21V11l6 3v7" />
        <path d="M16 21v-4l3 1.5V21" />
      </svg>
      <div className="min-w-0">
        <span className="block text-[17px] font-bold leading-tight">BuildSupply</span>
        {/* leading-tight above keeps the two lines together as one lockup rather
            than a heading with a caption drifting below it. */}
        {/* Wraps rather than truncates: the sidebar is only 230px, and the
            Hindi and Marathi lines are longer than the English one, so an
            ellipsis would eat the tagline exactly where it is tightest. */}
        {/* compact (the phone's top bar, scrolled): the tagline folds away the
            way Telegram's search field does, and comes back at the top. A
            0fr grid row, so it folds smoothly whatever its height — one line
            in English, two in Hindi and Marathi. */}
        <span
          className={cn(
            'grid transition-[grid-template-rows,opacity] duration-200 motion-reduce:transition-none',
            compact ? 'grid-rows-[0fr] opacity-0' : 'grid-rows-[1fr] opacity-100',
          )}
        >
          <span className="block overflow-hidden text-[11px] leading-tight text-sidebar-text">
            {t('brand.tagline')}
          </span>
        </span>
      </div>
    </div>
  )
}

/**
 * Tells the supplier their subscription is ending, with the one tap that
 * fixes it. Deliberately silent when no expiry date is set — that's the
 * admin's gap to close, not something to worry a supplier about.
 */
function SubscriptionNotice() {
  const { supplier } = useAuth()
  const { t } = useLanguage()
  if (!supplier || supplier.role !== 'supplier') return null

  const state = subscriptionState(supplier.subscription_expiry)
  if (state !== 'expired' && state !== 'expiring') return null

  const days = daysUntilExpiry(supplier.subscription_expiry) ?? 0
  const message =
    state === 'expired' ? t('sub.expired') : days === 0 ? t('sub.expiringToday') : t('sub.expiringDays', { days })
  const expired = state === 'expired'

  return (
    <div
      className={cn(
        'flex flex-wrap items-center justify-between gap-3 px-4 py-2.5 text-sm sm:px-6 lg:px-8',
        expired
          ? 'bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300'
          : 'bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300',
      )}
    >
      <span className="flex items-center gap-2 font-medium">
        <AlertTriangle size={16} className="shrink-0" />
        {message}
      </span>
      <button
        onClick={() =>
          openWhatsAppShare(
            ADMIN_WHATSAPP_NUMBER,
            `Hi, I would like to renew my BuildSupply subscription for ${supplier.business_name}.`,
          )
        }
        className="flex items-center gap-1.5 rounded-lg border border-current px-2.5 py-1 text-xs font-semibold"
      >
        <WhatsAppIcon size={14} /> {t('sub.renew')}
      </button>
    </div>
  )
}

/**
 * True once the page has scrolled under the top bar. Two thresholds, so a
 * page resting near the top can't flick the bar between its two looks — and
 * on a phone narrow enough for the tagline to wrap to two lines, folding it
 * makes the bar a few pixels shorter, which nudges the scroll position itself.
 */
function useScrolledPast(on: number, off: number) {
  const [past, setPast] = useState(false)
  useEffect(() => {
    let frame = 0
    const check = () => {
      frame = 0
      setPast((was) => (was ? window.scrollY > off : window.scrollY > on))
    }
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(check)
    }
    frame = requestAnimationFrame(check)
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      window.removeEventListener('scroll', onScroll)
      if (frame) cancelAnimationFrame(frame)
    }
  }, [on, off])
  return past
}

export function AppShell({ children }: { children: ReactNode }) {
  const { supplier, signOut } = useAuth()
  const { t } = useLanguage()
  const navigate = useNavigate()
  const [moreOpen, setMoreOpen] = useState(false)
  const scrolled = useScrolledPast(24, 4)
  const tabBarRef = useRef<HTMLElement>(null)

  // Publishes the tab bar's real height as --tabbar-h, for the things that have
  // to sit exactly on top of it — the page's bottom padding, and the Save bar
  // on New Invoice and New Quotation. That used to be a hard-coded 4rem in
  // three separate files while the bar actually measures 60px, so a 4px strip
  // of scrolling page showed through underneath Save. Measuring instead of
  // guessing also survives the taller bar a home indicator produces, and
  // Hindi or Marathi labels wrapping to a second line.
  useEffect(() => {
    const el = tabBarRef.current
    if (!el) return
    // getBoundingClientRect, not offsetHeight: the bar measures 60.3px and
    // offsetHeight rounds that to 60, which leaves the last row of a list a
    // third of a pixel underneath it.
    // The bar floats above the bottom edge (Telegram-style), so what the page
    // must keep clear is the bar plus the gap under it. Hidden (desktop), 0.
    const publish = () => {
      const height = el.getBoundingClientRect().height
      const gap = height > 0 ? parseFloat(getComputedStyle(el).bottom) || 0 : 0
      document.documentElement.style.setProperty('--tabbar-h', `${height + gap}px`)
    }
    publish()
    const observer = new ResizeObserver(publish)
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  // Online orders waiting to be reviewed (migration 026): a count on Orders,
  // and a dot on More, which is where Orders sits on a phone. Re-read on each
  // screen change — one small count, never the orders themselves.
  const location = useLocation()
  const [pendingOrders, setPendingOrders] = useState(0)
  useEffect(() => {
    if (!supplier || supplier.role !== 'supplier') return
    let active = true
    countPendingOrders()
      .then((n) => active && setPendingOrders(n))
      .catch(() => {})
    return () => {
      active = false
    }
  }, [supplier, location.pathname])

  async function handleSignOut() {
    await signOut()
    navigate('/login', { replace: true })
  }

  // An admin gets their own dashboard and the platform tools; the supplier
  // workspace (customers, bills, stock, khata) isn't theirs to browse.
  const isAdmin = supplier?.role === 'admin'
  const navItems = isAdmin ? NAV_ITEMS.filter((n) => ADMIN_NAV_IDS.includes(n.id)) : NAV_ITEMS

  // Mobile bar order follows MOBILE_PRIMARY_IDS itself, not the sidebar's
  // order, so the two can differ intentionally (e.g. Stock before Invoices
  // on mobile even though Invoices comes first in the full nav).
  const primaryItems = (isAdmin ? ADMIN_NAV_IDS : MOBILE_PRIMARY_IDS)
    .map((id) => navItems.find((n) => n.id === id))
    .filter((n) => n !== undefined)
  const overflowItems = navItems.filter((n) => !primaryItems.includes(n))

  // Which tab the bubble sits behind — NavLink's own rule, so the two agree.
  // A page reached from More (Orders, Settings…) highlights no tab, as
  // before: the bubble fades out where it was rather than sliding away.
  const activeTab = primaryItems.findIndex(
    (item) => location.pathname === item.path || location.pathname.startsWith(`${item.path}/`),
  )
  const [bubbleTab, setBubbleTab] = useState(Math.max(activeTab, 0))
  if (activeTab >= 0 && activeTab !== bubbleTab) setBubbleTab(activeTab)

  return (
    <div className="flex min-h-screen bg-surface text-ink">
      {/* Desktop sidebar. Kept for lg and up only — on a tablet a fixed
          230px rail eats ~30% of the screen and squeezes the content, so
          tablets get the same top-bar + bottom-nav chrome as phones. */}
      <nav className="sticky top-0 hidden h-screen w-[230px] shrink-0 flex-col bg-shell text-white lg:flex">
        <div className="border-b border-white/10 px-5 py-5">
          <Brand />
        </div>
        <div className="flex flex-1 flex-col gap-1 overflow-y-auto px-2.5 py-3.5">
          {navItems.map((item) => (
            <NavLink
              key={item.id}
              to={item.path}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm font-medium text-sidebar-text transition-colors hover:bg-white/5',
                  isActive && 'bg-accent/15 text-white',
                )
              }
            >
              <item.icon size={17} />
              {t(item.labelKey)}
              {item.id === 'orders' && pendingOrders > 0 && (
                <span className="ml-auto rounded-full bg-accent px-1.5 py-0.5 text-[11px] font-semibold leading-none text-white">
                  {pendingOrders}
                </span>
              )}
            </NavLink>
          ))}
          {supplier?.role === 'admin' && (
            <>
              <NavLink
                to="/admin/suppliers"
                className={({ isActive }) =>
                  cn(
                    'mt-2 flex items-center gap-2.5 rounded-lg border-t border-white/10 px-3 pt-4 pb-2.5 text-sm font-medium text-sidebar-text transition-colors hover:bg-white/5',
                    isActive && 'bg-accent/15 text-white',
                  )
                }
              >
                <ShieldCheck size={17} />
                Suppliers (Admin)
              </NavLink>
              <NavLink
                to="/admin/materials"
                className={({ isActive }) =>
                  cn(
                    'flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm font-medium text-sidebar-text transition-colors hover:bg-white/5',
                    isActive && 'bg-accent/15 text-white',
                  )
                }
              >
                <Boxes size={17} />
                Material Catalog
              </NavLink>
              <NavLink
                to="/admin/settings"
                className={({ isActive }) =>
                  cn(
                    'flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm font-medium text-sidebar-text transition-colors hover:bg-white/5',
                    isActive && 'bg-accent/15 text-white',
                  )
                }
              >
                <SlidersHorizontal size={17} />
                Platform Settings
              </NavLink>
            </>
          )}
        </div>
        <div className="border-t border-white/10 p-3">
          <div className="mb-2 truncate px-2 text-xs text-sidebar-text">{supplier?.business_name}</div>
          <button
            onClick={handleSignOut}
            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-sidebar-text hover:bg-white/5"
          >
            <LogOut size={16} />
            {t('nav.signOut')}
          </button>
        </div>
      </nav>

      {/* Main content */}
      {/* Reserves the fixed tab bar's height so the last row of a list isn't
          stuck behind it — and the bar is now that much taller on a phone
          with a home indicator, so this has to match. */}
      <div className="flex min-w-0 flex-1 flex-col pb-[var(--tabbar-h)] lg:pb-0">
        {/* Phone/tablet top bar — the sidebar's brand header has no room
            here, so it moves up alongside the theme toggle. */}
        {/* pt keeps the brand out from under the status bar, which the
            translucent status bar style in index.html puts us beneath. */}
        {/* data-app-header / data-app-tabbar: what ui/action-menu keeps its
            menus clear of. */}
        {/* Telegram-style: solid at the top of a page, so it meets the status
            bar in one colour; once the page scrolls under it, see-through and
            frosted so the content shows through, and the tagline folds away.
            Both come back at the top. */}
        <header
          data-app-header
          style={{ viewTransitionName: 'app-header' }}
          className={cn(
            'sticky top-0 z-30 flex w-full items-center justify-between px-4 py-3 pt-[calc(0.75rem_+_var(--safe-top))] text-white transition-colors duration-200 sm:px-6 lg:hidden',
            scrolled ? 'bg-shell/80 backdrop-blur-lg backdrop-saturate-150' : 'bg-shell',
          )}
        >
          <Brand compact={scrolled} />
          <div className="flex items-center gap-2">
            <LanguageToggle className="border-white/20 text-white hover:bg-white/10 hover:text-white" />
            <ThemeToggle className="border-white/20 text-white hover:bg-white/10 hover:text-white" />
          </div>
        </header>

        <SubscriptionNotice />

        <div className="hidden justify-end gap-2 px-8 pt-4 lg:flex">
          <LanguageToggle />
          <ThemeToggle />
        </div>
        {/* Less room above the first thing on the page than around it: the
            header already reads as a boundary, so a full 16px on top of that
            left the greeting floating away from the bar it belongs under.
            Applies to every screen, not just the dashboard, so the distance
            from the header stays the same wherever the supplier is. */}
        <main className="flex-1 px-4 pt-2 pb-4 sm:px-6 sm:pt-3 sm:pb-6 lg:p-8 lg:pt-0">{children}</main>
        {/* After main, so it stacks above a page's own dialog. */}
        <ShareDocumentPrompt />
      </div>

      {/* Phone/tablet bottom tab bar — floating, Telegram-style: a rounded
          bar clear of the screen edges, the page showing through it as it
          scrolls, and a bubble behind the tab you are on. */}
      {/* The bottom offset lifts it clear of the home indicator; without that
          the gesture bar sits on top of the last few pixels of every tap
          target. mx-auto + max-w-md keeps it phone-sized on a tablet. */}
      <nav
        ref={tabBarRef}
        data-app-tabbar
        // Its own layer in a screen change, shown as it is now rather than
        // faded — otherwise the bubble's slide is doubled by a fading copy.
        style={{ viewTransitionName: 'app-tabbar' }}
        className="fixed inset-x-3 bottom-[calc(0.5rem_+_var(--safe-bottom))] z-30 mx-auto flex max-w-md rounded-full border border-border bg-card/70 p-1 shadow-lg shadow-black/10 backdrop-blur-lg backdrop-saturate-150 lg:hidden"
      >
        {/* The bubble behind the current tab: one element that slides to the
            tab you tap, as Telegram's does, instead of one per tab jumping.
            Tabs are equal widths, so one tab along is translateX(100%). */}
        <span
          aria-hidden="true"
          className={cn(
            'absolute inset-y-1 left-1 rounded-full bg-accent-bg transition-[transform,opacity] duration-300 ease-[cubic-bezier(0.34,1.3,0.64,1)] motion-reduce:transition-none',
            activeTab < 0 && 'opacity-0',
          )}
          style={{
            width: `calc((100% - 0.5rem) / ${primaryItems.length + 1})`,
            transform: `translateX(${bubbleTab * 100}%)`,
          }}
        />
        {primaryItems.map((item) => (
          <NavLink
            key={item.id}
            to={item.path}
            // A quick cross-fade into the new screen — see index.css.
            viewTransition
            className={({ isActive }) =>
              cn(
                'relative flex min-w-0 flex-1 flex-col items-center gap-0.5 rounded-full px-0.5 py-1.5 text-center text-[11px] font-medium leading-tight text-muted transition-colors duration-300',
                isActive && 'text-accent-text',
              )
            }
          >
            {/* Finer lines on the other tabs, a bolder icon on the one you
                are on — how Telegram and the phone's own apps mark it. */}
            {({ isActive }) => (
              <>
                <item.icon size={20} strokeWidth={isActive ? 2.3 : 1.75} />
                {t(item.labelKey)}
              </>
            )}
          </NavLink>
        ))}
        <button
          onClick={() => setMoreOpen(true)}
          aria-label={
            pendingOrders > 0
              ? `${t('nav.more')}, ${pendingOrders === 1 ? t('dash.newOrdersOne') : t('dash.newOrdersMany', { count: pendingOrders })}`
              : undefined
          }
          className="relative flex min-w-0 flex-1 flex-col items-center gap-0.5 rounded-full px-0.5 py-1.5 text-center text-[11px] font-medium leading-tight text-muted"
        >
          <MoreHorizontal size={20} strokeWidth={1.75} />
          {pendingOrders > 0 && (
            // How many new orders, not just that there are some — a number on
            // the corner of the icon, as Telegram counts unread chats.
            <span
              aria-hidden="true"
              className="absolute left-1/2 top-0.5 ml-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-accent px-1 text-[10px] font-bold leading-none text-white ring-2 ring-card"
            >
              {pendingOrders > 99 ? '99+' : pendingOrders}
            </span>
          )}
          {t('nav.more')}
        </button>
      </nav>

      {/* Mobile "more" sheet */}
      {moreOpen && (
        <div className="fixed inset-0 z-40 flex items-end bg-black/40 lg:hidden" onClick={() => setMoreOpen(false)}>
          {/* Sits on the bottom edge like the tab bar, so its last row of
              links needs the same clearance from the home indicator. */}
          <div
            className="w-full rounded-t-2xl bg-card p-4 pb-[calc(2rem_+_var(--safe-bottom))]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between">
              <span className="text-sm font-semibold">{t('nav.more')}</span>
              <button onClick={() => setMoreOpen(false)} aria-label="Close">
                <X size={18} />
              </button>
            </div>
            <div className="grid grid-cols-3 gap-3 sm:grid-cols-5">
              {overflowItems.map((item) => (
                <NavLink
                  key={item.id}
                  to={item.path}
                  viewTransition
                  onClick={() => setMoreOpen(false)}
                  className="relative flex flex-col items-center gap-2 rounded-2xl p-3 text-xs font-medium transition-colors hover:bg-surface active:bg-surface text-ink"
                >
                  {/* Plain outline icons, as WhatsApp draws its own — no box. */}
                  <item.icon size={26} strokeWidth={1.75} />
                  {t(item.labelKey)}
                  {item.id === 'orders' && pendingOrders > 0 && (
                    <span className="absolute right-2 top-2 rounded-full bg-accent px-1.5 py-0.5 text-[10px] font-semibold leading-none text-white">
                      {pendingOrders}
                    </span>
                  )}
                </NavLink>
              ))}
              {supplier?.role === 'admin' && (
                <>
                  <NavLink
                    to="/admin/suppliers"
                    viewTransition
                    onClick={() => setMoreOpen(false)}
                    className="flex flex-col items-center gap-2 rounded-2xl p-3 text-xs font-medium transition-colors hover:bg-surface active:bg-surface text-ink"
                  >
                    <ShieldCheck size={26} strokeWidth={1.75} />
                    Suppliers
                  </NavLink>
                  <NavLink
                    to="/admin/materials"
                    viewTransition
                    onClick={() => setMoreOpen(false)}
                    className="flex flex-col items-center gap-2 rounded-2xl p-3 text-xs font-medium transition-colors hover:bg-surface active:bg-surface text-ink"
                  >
                    <Boxes size={26} strokeWidth={1.75} />
                    Catalog
                  </NavLink>
                  <NavLink
                    to="/admin/settings"
                    viewTransition
                    onClick={() => setMoreOpen(false)}
                    className="flex flex-col items-center gap-2 rounded-2xl p-3 text-xs font-medium transition-colors hover:bg-surface active:bg-surface text-ink"
                  >
                    <SlidersHorizontal size={26} strokeWidth={1.75} />
                    Platform
                  </NavLink>
                </>
              )}
              <button
                onClick={handleSignOut}
                className="flex flex-col items-center gap-2 rounded-2xl p-3 text-xs font-medium transition-colors hover:bg-surface active:bg-surface text-red-600"
              >
                <LogOut size={26} strokeWidth={1.75} />
                {t('nav.signOut')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
