import { useEffect, useRef, useState, type ReactNode } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { LogOut, MoreHorizontal, X, ShieldCheck, Boxes, SlidersHorizontal, AlertTriangle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAuth } from '@/context/AuthContext'
import { useLanguage } from '@/context/LanguageContext'
import { ThemeToggle } from '@/components/ThemeToggle'
import { LanguageToggle } from '@/components/LanguageToggle'
import { WhatsAppIcon } from '@/components/icons/WhatsAppIcon'
import { WhatsAppReadyPrompt } from '@/components/WhatsAppReadyPrompt'
import { openWhatsAppShare } from '@/lib/whatsapp'
import { ADMIN_WHATSAPP_NUMBER } from '@/lib/adminContact'
import { daysUntilExpiry, subscriptionState } from '@/lib/subscription'
import { NAV_ITEMS, MOBILE_PRIMARY_IDS, ADMIN_NAV_IDS } from './nav-items'

// Shown in the desktop sidebar header and, on mobile, in the top bar.
function Brand() {
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
        <span className="block text-[11px] leading-tight text-sidebar-text">
          {t('brand.tagline')}
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

export function AppShell({ children }: { children: ReactNode }) {
  const { supplier, signOut } = useAuth()
  const { t } = useLanguage()
  const navigate = useNavigate()
  const [moreOpen, setMoreOpen] = useState(false)
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
    const publish = () =>
      document.documentElement.style.setProperty(
        '--tabbar-h',
        `${el.getBoundingClientRect().height}px`,
      )
    publish()
    const observer = new ResizeObserver(publish)
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

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
        <header className="sticky top-0 z-30 flex w-full items-center justify-between bg-shell px-4 py-3 pt-[calc(0.75rem_+_var(--safe-top))] text-white sm:px-6 lg:hidden">
          <Brand />
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
        <WhatsAppReadyPrompt />
      </div>

      {/* Phone/tablet bottom tab bar */}
      {/* pb lifts the tab labels clear of the home indicator; without it the
          gesture bar sits on top of the last few pixels of every tap target. */}
      <nav
        ref={tabBarRef}
        className="fixed inset-x-0 bottom-0 z-30 flex border-t border-border bg-card pb-[var(--safe-bottom)] lg:hidden"
      >
        {primaryItems.map((item) => (
          <NavLink
            key={item.id}
            to={item.path}
            className={({ isActive }) =>
              cn(
                'flex flex-1 flex-col items-center gap-1 py-2.5 text-[11px] font-medium text-muted',
                isActive && 'text-accent',
              )
            }
          >
            <item.icon size={19} />
            {t(item.labelKey)}
          </NavLink>
        ))}
        <button
          onClick={() => setMoreOpen(true)}
          className="flex flex-1 flex-col items-center gap-1 py-2.5 text-[11px] font-medium text-muted"
        >
          <MoreHorizontal size={19} />
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
                  onClick={() => setMoreOpen(false)}
                  className="flex flex-col items-center gap-1.5 rounded-xl border border-border p-3 text-xs font-medium text-ink"
                >
                  <item.icon size={18} />
                  {t(item.labelKey)}
                </NavLink>
              ))}
              {supplier?.role === 'admin' && (
                <>
                  <NavLink
                    to="/admin/suppliers"
                    onClick={() => setMoreOpen(false)}
                    className="flex flex-col items-center gap-1.5 rounded-xl border border-border p-3 text-xs font-medium text-ink"
                  >
                    <ShieldCheck size={18} />
                    Suppliers
                  </NavLink>
                  <NavLink
                    to="/admin/materials"
                    onClick={() => setMoreOpen(false)}
                    className="flex flex-col items-center gap-1.5 rounded-xl border border-border p-3 text-xs font-medium text-ink"
                  >
                    <Boxes size={18} />
                    Catalog
                  </NavLink>
                  <NavLink
                    to="/admin/settings"
                    onClick={() => setMoreOpen(false)}
                    className="flex flex-col items-center gap-1.5 rounded-xl border border-border p-3 text-xs font-medium text-ink"
                  >
                    <SlidersHorizontal size={18} />
                    Platform
                  </NavLink>
                </>
              )}
              <button
                onClick={handleSignOut}
                className="flex flex-col items-center gap-1.5 rounded-xl border border-border p-3 text-xs font-medium text-red-600"
              >
                <LogOut size={18} />
                {t('nav.signOut')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
