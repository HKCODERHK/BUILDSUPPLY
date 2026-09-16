import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom'
import { LogOut, MoreHorizontal, X, ShieldCheck, Boxes, SlidersHorizontal, AlertTriangle, Inbox, ArrowLeft, Sun, Moon, Smartphone } from 'lucide-react'
import { CustomerAvatar } from '@/components/CustomerAvatar'
import { TopBarContext, type TopBarInfo } from '@/context/TopBarContext'
import { cn } from '@/lib/utils'
import { useAuth } from '@/context/AuthContext'
import { useLanguage } from '@/context/LanguageContext'
import { ThemeToggle } from '@/components/ThemeToggle'
import { useTheme } from '@/context/ThemeContext'
import { LanguageToggle } from '@/components/LanguageToggle'
import { WhatsAppIcon } from '@/components/icons/WhatsAppIcon'
import { ShareDocumentPrompt } from '@/components/ShareDocumentPrompt'
import { InstallIosModal } from '@/components/InstallIosModal'
import { promptInstall, useInstallState } from '@/lib/installPrompt'
import { prefetchScreens } from '@/lib/screens'
import { openWhatsAppShare } from '@/lib/whatsapp'
import { ADMIN_WHATSAPP_NUMBER } from '@/lib/adminContact'
import { daysUntilExpiry, subscriptionState } from '@/lib/subscription'
import { countPendingOrders } from '@/services/orders'
import { NAV_ITEMS, MOBILE_PRIMARY_IDS, ADMIN_NAV_IDS } from './nav-items'

// Shown in the desktop sidebar header and, on mobile, in the top bar.
// onBar: the phone's top bar, which follows the theme — "BuildSupply" in the
// app's green on a white bar by day (as Telegram writes its name in blue),
// white on the dark bar at night. The desktop sidebar is always dark.
function Brand({ compact = false, onBar = false }: { compact?: boolean; onBar?: boolean }) {
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
        <span className={cn('block text-[17px] font-bold leading-tight', onBar && 'text-accent-text dark:text-white')}>
          BuildSupply
        </span>
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
          <span
            className={cn(
              'block overflow-hidden text-[11px] leading-tight',
              onBar ? 'text-muted dark:text-sidebar-text' : 'text-sidebar-text',
            )}
          >
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

/**
 * True while the page is being scrolled down — Telegram's cue to slip the
 * floating button out of the way; scrolling back up, or reaching the top,
 * brings it back. Measured from the last change of direction, so a slow
 * scroll still counts once it has gone far enough.
 */
function useScrollingDown() {
  const [down, setDown] = useState(false)
  useEffect(() => {
    let last = window.scrollY
    let frame = 0
    const check = () => {
      frame = 0
      const y = window.scrollY
      if (y < 40) {
        setDown(false)
        last = y
      } else if (y > last + 8) {
        setDown(true)
        last = y
      } else if (y < last - 8) {
        setDown(false)
        last = y
      }
    }
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(check)
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      window.removeEventListener('scroll', onScroll)
      if (frame) cancelAnimationFrame(frame)
    }
  }, [])
  return down
}

export function AppShell({ children }: { children: ReactNode }) {
  const { supplier, signOut, splash } = useAuth()
  const { t } = useLanguage()
  const { theme, toggleTheme } = useTheme()
  const navigate = useNavigate()
  const [moreOpen, setMoreOpen] = useState(false)
  // "Install app": Chrome's own dialog where it offers one, the steps on an iPhone.
  const installState = useInstallState()
  const [iosSteps, setIosSteps] = useState(false)
  // Soon after the app opens, the other screens and the PDF tools are fetched
  // in the background, so moving around never waits (lib/screens).
  useEffect(() => {
    if (supplier) prefetchScreens(supplier.role === 'admin' ? 'admin' : 'supplier')
  }, [supplier])
  // What the current screen asked the top bar to say — see TopBarContext.
  const [topBar, setTopBar] = useState<TopBarInfo | null>(null)
  // The Profile tab shows the business's logo; its initials if it won't load.
  const [profileLogoFailed, setProfileLogoFailed] = useState(false)
  const profileLogo = !profileLogoFailed ? supplier?.logo_url : null
  const scrolled = useScrolledPast(24, 4)
  const fabAway = useScrollingDown()
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
  // Settings is the Profile tab now — the business's logo, last in the bar —
  // so it leaves the tabs before it and the More sheet.
  const tabItems = primaryItems.filter((n) => n.id !== 'settings')
  const overflowItems = navItems.filter((n) => !primaryItems.includes(n) && n.id !== 'settings')
  const tabPaths = [...tabItems.map((n) => n.path), '/settings']

  // Which tab the bubble sits behind — NavLink's own rule, so the two agree.
  // A page reached from More (Orders, Payments…) highlights no tab, as
  // before: the bubble fades out where it was rather than sliding away.
  const activeTab = tabPaths.findIndex(
    (path) => location.pathname === path || location.pathname.startsWith(`${path}/`),
  )
  const [bubbleTab, setBubbleTab] = useState(Math.max(activeTab, 0))
  if (activeTab >= 0 && activeTab !== bubbleTab) setBubbleTab(activeTab)

  // The floating Orders button: a supplier's, on the four main tabs only —
  // never over a bill or New Invoice, where Save sits at the bottom.
  const showFab = !isAdmin && tabItems.some((item) => item.path === location.pathname)

  // The top bar names the screen you are on, as Telegram's does: the
  // BuildSupply name on the Dashboard only; everywhere else the page's own
  // title (published by PageHeader), falling back to its section's name while
  // the page loads — with ← on an inner screen (a customer, a bill, New
  // invoice, a part of Settings…).
  const segs = location.pathname.split('/').filter(Boolean)
  const onDashboard = location.pathname === '/dashboard'
  const sectionItem = NAV_ITEMS.find((n) => n.path === `/${segs[0]}`)
  const inner =
    segs[0] === 'admin'
      ? segs.length > 2
      : segs.length > 1 || (segs[0] === 'settings' && new URLSearchParams(location.search).has('s'))
  const parentPath = segs[0] === 'admin' ? `/admin/${segs[1] ?? ''}` : `/${segs[0] ?? 'dashboard'}`
  // While a customer's page loads it has no heading yet, so the bar would say
  // "Customers" until the data lands. The screen that opened it passes the
  // name along (router state `customerName`), so the pill shows it at once;
  // opened any other way, a soft placeholder instead of the section's name.
  const onCustomerPage = segs[0] === 'customers' && segs.length === 2
  const passedName = (location.state as { customerName?: string } | null)?.customerName
  const bar: TopBarInfo =
    topBar ??
    (onCustomerPage
      ? { title: passedName ?? '', avatar: passedName ? { id: segs[1], name: passedName } : undefined }
      : { title: sectionItem ? t(sectionItem.labelKey) : 'BuildSupply' })
  // Telegram's chat bar (a customer's page): pills floating over the page.
  // A customer's page floats from its first frame — while it loads too — so
  // the bar doesn't jump from the dark style to the pills when the name lands.
  const floating = !onDashboard && (bar.floating ?? (segs[0] === 'customers' && segs.length === 2))
  const pill =
    'flex items-center rounded-full border border-border/60 bg-card/85 text-ink shadow-md shadow-black/5 backdrop-blur-lg backdrop-saturate-150'

  // The status bar (index.html's theme-color) matches whatever is under it:
  // the top bar — white by day, the app green at night — or, under the
  // floating bar, the page itself; and the app green while the always-dark
  // splash is up. The values are index.css's --color-card / --color-shell /
  // --color-surface, written out: read from the page they would lag a theme
  // switch, since the .dark class changes in ThemeProvider's effect, after this one.
  useEffect(() => {
    const meta = document.querySelector('meta[name="theme-color"]')
    if (!meta) return
    const colour = splash
      ? '#0a2427'
      : floating
        ? theme === 'dark'
          ? '#0c1719'
          : '#f5f7f8'
        : theme === 'dark'
          ? '#0a2427'
          : '#ffffff'
    meta.setAttribute('content', colour)
  }, [splash, floating, theme])

  // Back to wherever the supplier came from; opened straight from a link with
  // nothing behind it, to the section's list instead.
  function goBack() {
    if (location.key !== 'default') navigate(-1)
    else navigate(parentPath, { replace: true })
  }

  return (
    <div data-app-root className="flex min-h-screen bg-surface text-ink">
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
            floating
              ? 'sticky top-0 z-30 flex w-full items-center gap-2 px-3 py-2 pt-[calc(0.5rem_+_var(--safe-top))] lg:hidden'
              : 'sticky top-0 z-30 flex w-full items-center justify-between px-4 py-3 pt-[calc(0.75rem_+_var(--safe-top))] text-ink transition-colors duration-200 sm:px-6 lg:hidden dark:text-white',
            // Day: white, like Telegram's — no line under it; the white bar
            // against the light grey page is edge enough (the user asked for
            // the line to go). Night: the app's dark green.
            !floating &&
              (scrolled
                ? 'bg-card/80 backdrop-blur-lg backdrop-saturate-150 dark:bg-shell/80'
                : 'bg-card dark:bg-shell'),
          )}
        >
          {floating ? (
            // Telegram's chat bar: ←, the name, and the screen's own buttons,
            // each a frosted pill over the page.
            <>
              <button
                type="button"
                onClick={goBack}
                aria-label={t('common.back')}
                className={cn(pill, 'h-11 w-11 shrink-0 justify-center')}
              >
                <ArrowLeft size={22} />
              </button>
              <div className={cn(pill, 'h-11 min-w-0 flex-1 gap-2.5 pl-1 pr-4')}>
                {bar.avatar ? (
                  <CustomerAvatar id={bar.avatar.id} name={bar.avatar.name} size={36} />
                ) : (
                  !bar.title && <span className="h-9 w-9 shrink-0 animate-pulse rounded-full bg-border" />
                )}
                <div className="min-w-0">
                  {bar.title ? (
                    <div className="truncate text-[15px] font-semibold leading-tight">{bar.title}</div>
                  ) : (
                    // Still loading, and no name was passed along.
                    <span className="block h-3.5 w-28 animate-pulse rounded-full bg-border" />
                  )}
                  {bar.detail && (
                    <div
                      className={cn(
                        'truncate text-xs font-medium leading-tight',
                        bar.detailTone === 'due' ? 'text-red-600 dark:text-red-400' : 'text-accent',
                      )}
                    >
                      {bar.detail}
                    </div>
                  )}
                </div>
              </div>
              {bar.actions && <div className={cn(pill, 'h-11 shrink-0 px-0.5')}>{bar.actions}</div>}
            </>
          ) : onDashboard ? (
            <Brand compact={scrolled} onBar />
          ) : (
            <div className="flex min-w-0 flex-1 items-center gap-2 pr-2">
              {inner && (
                <button
                  type="button"
                  onClick={goBack}
                  aria-label={t('common.back')}
                  className="-ml-2 flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition-colors hover:bg-black/5 dark:hover:bg-white/10"
                >
                  <ArrowLeft size={22} />
                </button>
              )}
              {bar.image ? (
                <img
                  key={bar.image}
                  src={bar.image}
                  alt=""
                  className="bar-title-in h-[34px] w-[34px] shrink-0 rounded-full bg-white object-cover ring-1 ring-border"
                />
              ) : (
                bar.avatar && <CustomerAvatar id={bar.avatar.id} name={bar.avatar.name} size={34} />
              )}
              {/* Keyed by the title, so a new title eases in rather than
                  snapping — Profile turning into the business's name as its
                  page scrolls, say. */}
              <div key={bar.title} className="bar-title-in min-w-0">
                <div className="truncate text-[17px] font-semibold leading-tight">{bar.title}</div>
                {bar.detail && (
                  <div
                    className={cn(
                      'truncate text-xs font-medium leading-tight',
                      bar.detailTone === 'due' ? 'text-red-600 dark:text-red-300' : 'text-accent dark:text-green-300',
                    )}
                  >
                    {bar.detail}
                  </div>
                )}
              </div>
            </div>
          )}
          {/* EN and theme step aside on the floating bar, as in Telegram's chat. */}
          <div className={cn('flex shrink-0 items-center gap-2', floating && 'hidden')}>
            <LanguageToggle className="dark:border-white/20 dark:text-white dark:hover:bg-white/10 dark:hover:text-white" />
            {/* Day / night lives in the More sheet on a phone (the user's call). */}
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
        <main className="flex-1 px-4 pt-2 pb-4 sm:px-6 sm:pt-3 sm:pb-6 lg:p-8 lg:pt-0">
          <TopBarContext.Provider value={setTopBar}>{children}</TopBarContext.Provider>
        </main>
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
            width: `calc((100% - 0.5rem) / ${tabPaths.length})`,
            transform: `translateX(${bubbleTab * 100}%)`,
          }}
        />
        {tabItems.map((item) => (
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
        {/* Profile, last: the business's own logo (or its initials), opening
            its profile and settings — as Telegram ends its bar with the
            user's photo. More became a floating button (below). */}
        <NavLink
          to="/settings"
          viewTransition
          className={({ isActive }) =>
            cn(
              'relative flex min-w-0 flex-1 flex-col items-center gap-0.5 rounded-full px-0.5 py-1.5 text-center text-[11px] font-medium leading-tight text-muted transition-colors duration-300',
              isActive && 'text-accent-text',
            )
          }
        >
          {({ isActive }) => (
            <>
              <span
                className={cn(
                  'flex h-5 w-5 items-center justify-center overflow-hidden rounded-full bg-white',
                  isActive ? 'ring-2 ring-accent' : 'ring-1 ring-border',
                )}
              >
                {profileLogo ? (
                  <img
                    src={profileLogo}
                    alt=""
                    onError={() => setProfileLogoFailed(true)}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <CustomerAvatar id={supplier?.id ?? ''} name={supplier?.business_name ?? ''} size={20} />
                )}
              </span>
              {t('nav.profile')}
            </>
          )}
        </NavLink>
      </nav>

      {/* The floating Orders button, Telegram-style, just above the tab bar
          (--tabbar-h already includes the gap under the bar). It slips away
          while a list is scrolled down, so it never covers the last rows, and
          comes back on the way up. Opens Orders with the tabs' quick fade.
          Tailwind 4 moves and scales with the `translate` and `scale`
          properties, not `transform` — hence what is transitioned. */}
      {showFab && (
        <Link
          to="/orders"
          viewTransition
          aria-label={
            pendingOrders > 0
              ? `${t('nav.orders')}, ${pendingOrders === 1 ? t('dash.newOrdersOne') : t('dash.newOrdersMany', { count: pendingOrders })}`
              : t('nav.orders')
          }
          style={{ bottom: 'calc(var(--tabbar-h) + 0.75rem)' }}
          className={cn(
            'fixed right-4 z-30 flex h-14 w-14 items-center justify-center rounded-full bg-accent text-white shadow-lg shadow-black/25 transition-[translate,scale,opacity] duration-200 active:scale-95 motion-reduce:transition-none lg:hidden',
            fabAway ? 'pointer-events-none translate-y-4 opacity-0' : 'translate-y-0 opacity-100',
          )}
        >
          <Inbox size={24} strokeWidth={1.9} />
          {pendingOrders > 0 && (
            <span
              aria-hidden="true"
              className="absolute -right-0.5 -top-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-white px-1 text-[11px] font-bold leading-none text-accent-text ring-2 ring-accent"
            >
              {pendingOrders > 99 ? '99+' : pendingOrders}
            </span>
          )}
        </Link>
      )}

      {/* More, as a small white button floating just above the Orders button
          — Telegram's small button over its big one — or in its place where
          there is none, carrying the new-order count then. On every main
          screen; not on an inner one (a bill, New invoice, a customer…). It
          slips away with the Orders button while a list scrolls down. */}
      {!inner && (
        <button
          type="button"
          onClick={() => setMoreOpen(true)}
          aria-label={
            !showFab && pendingOrders > 0
              ? `${t('nav.more')}, ${pendingOrders === 1 ? t('dash.newOrdersOne') : t('dash.newOrdersMany', { count: pendingOrders })}`
              : t('nav.more')
          }
          style={{ bottom: showFab ? 'calc(var(--tabbar-h) + 5rem)' : 'calc(var(--tabbar-h) + 0.75rem)' }}
          className={cn(
            'fixed right-5 z-30 flex h-12 w-12 items-center justify-center rounded-full border border-border bg-card text-ink shadow-lg shadow-black/15 transition-[translate,scale,opacity] duration-200 active:scale-95 motion-reduce:transition-none lg:hidden',
            fabAway ? 'pointer-events-none translate-y-4 opacity-0' : 'translate-y-0 opacity-100',
          )}
        >
          <MoreHorizontal size={22} strokeWidth={1.9} />
          {!showFab && pendingOrders > 0 && (
            <span
              aria-hidden="true"
              className="absolute -right-0.5 -top-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-accent px-1 text-[11px] font-bold leading-none text-white ring-2 ring-card"
            >
              {pendingOrders > 99 ? '99+' : pendingOrders}
            </span>
          )}
        </button>
      )}

      {iosSteps && <InstallIosModal onClose={() => setIosSteps(false)} />}

      {/* Mobile "more" sheet */}
      {moreOpen && (
        <div
          className="fixed inset-0 z-40 flex items-end justify-center bg-black/40 px-3 pb-[calc(0.75rem_+_var(--safe-bottom))] lg:hidden"
          onClick={() => setMoreOpen(false)}
        >
          {/* A floating card, rounded all round and clear of every edge of the
              screen — like the tab bar — rising gently into place. The
              bottom padding keeps it off the home indicator. */}
          <div
            className="more-sheet-in w-full max-w-md rounded-3xl border border-border bg-card p-4 shadow-2xl shadow-black/25"
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
              {/* Only while the app isn't installed yet — gone once it is. */}
              {installState !== 'none' && (
                <button
                  type="button"
                  onClick={() => {
                    setMoreOpen(false)
                    if (installState === 'prompt') void promptInstall()
                    else setIosSteps(true)
                  }}
                  className="flex flex-col items-center gap-2 rounded-2xl p-3 text-xs font-medium text-ink transition-colors hover:bg-surface active:bg-surface"
                >
                  <Smartphone size={26} strokeWidth={1.75} />
                  {t('install.tile')}
                </button>
              )}
              {/* Day / night, moved here from the top bar. The sheet closes and
                  Telegram's circle spreads from where this tile was. */}
              <button
                type="button"
                aria-label={t(theme === 'dark' ? 'theme.toLight' : 'theme.toDark')}
                onClick={(e) => {
                  const r = e.currentTarget.getBoundingClientRect()
                  setMoreOpen(false)
                  toggleTheme({ x: r.left + r.width / 2, y: r.top + r.height / 2 })
                }}
                className="flex flex-col items-center gap-2 rounded-2xl p-3 text-xs font-medium text-ink transition-colors hover:bg-surface active:bg-surface"
              >
                {theme === 'dark' ? <Sun size={26} strokeWidth={1.75} /> : <Moon size={26} strokeWidth={1.75} />}
                {t(theme === 'dark' ? 'theme.light' : 'theme.dark')}
              </button>
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
