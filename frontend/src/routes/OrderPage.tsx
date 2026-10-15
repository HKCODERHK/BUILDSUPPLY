import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
  BookOpen,
  Check,
  ChevronRight,
  House,
  MapPin,
  Minus,
  Navigation,
  Package,
  Phone,
  Plus,
  Receipt,
  RotateCcw,
  Search,
  Send,
  Share2,
  ShoppingBag,
  Truck,
  MessageCircle,
} from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { buttonVariants } from '@/components/ui/button-variants'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { PhoneInput } from '@/components/ui/phone-input'
import { CustomerAvatar } from '@/components/CustomerAvatar'
import { SuccessHeader } from '@/components/SuccessTick'
import { TruckLoader } from '@/components/TruckLoader'
import { useLanguage } from '@/context/LanguageContext'
import type { TranslationKey } from '@/lib/i18n'
import { sanitizeDecimal } from '@/lib/numberInput'
import { newRequestId } from '@/services/db'
import { platformDisclosure } from '@/services/compliance'
import { getOrderPage, orderStatusUrl, placeOrder, type OrderPage as OrderPageData } from '@/services/orders'
import { OrderLinkShareModal } from '@/components/OrderLinkShareModal'
import { readKhata, rememberOrder } from '@/lib/customerLinks'
import { hasCustomerSession } from '@/lib/customerAuth'
import { CustomerHeader, CustomerTabBar, QuickActions, SectionHeading, SoftCard, type QuickAction } from '@/components/CustomerHome'
import { greetingKey } from '@/lib/customerHome'
import { cn } from '@/lib/utils'
import { myShops, rememberCurrentShop, type MyShop } from '@/services/customerAccount'
import { getShopProfile, type ShopProfile } from '@/services/shopPage'
import { ShopAbout, ShopDelivery, ShopHero, ShopOffers } from '@/components/ShopProfileView'
import { MaterialPicture } from '@/components/MaterialPicture'
import { CustomerWelcome } from '@/components/CustomerWelcome'
import { BuildSupplyFooter } from '@/components/BuildSupplyFooter'
import { profileKept, readProfile, siteWithCity, type CustomerProfile } from '@/lib/customerProfile'
import { ImagePreview } from '@/components/ui/modal'
import { brandAttr, shopWhatsapp } from '@/lib/shopPage'

function formatINR(n: number) {
  return `₹${n.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`
}

function localIsoDate(offsetDays: number) {
  const d = new Date()
  d.setDate(d.getDate() + offsetDays)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// The customer's last order from this supplier, on their phone only: their
// name, phone and site fill themselves in next time, and "Fill in my last
// order" puts the quantities back.
type LastOrder = { items: { material_id: string; qty: number }[]; name: string; phone: string; site: string }
const lastKey = (link: string) => `buildsupply-last-order:${link}`
function readLast(link: string): LastOrder | null {
  try {
    const value = JSON.parse(localStorage.getItem(lastKey(link)) ?? sessionStorage.getItem(lastKey(link)) ?? 'null')
    return value && Array.isArray(value.items) ? (value as LastOrder) : null
  } catch {
    return null
  }
}
/**
 * A quantity as typed, kept to what an order can carry (#4): the server takes
 * up to 6 whole digits, 2 decimals and 1,00,000 per material, and used to drop
 * anything else from the order without a word. Returns null for a keystroke
 * that would go beyond that, so the box simply keeps its value.
 */
function orderQty(raw: string): string | null {
  const v = sanitizeDecimal(raw)
  if (!/^[0-9]{0,6}(\.[0-9]{0,2})?$/.test(v)) return null
  if (Number(v) > 100000) return null
  return v
}

function rememberLast(link: string, last: LastOrder) {
  try {
    // The same choice the customer made on the welcome screen (#8): with
    // "Keep my details on this phone" unticked, the last order — which holds
    // their name, phone and site — is kept only until the browser closes.
    if (profileKept() === false) {
      sessionStorage.setItem(lastKey(link), JSON.stringify(last))
      localStorage.removeItem(lastKey(link))
    } else {
      localStorage.setItem(lastKey(link), JSON.stringify(last))
    }
  } catch {
    // Storage blocked: they type it again next time, as before.
  }
}

/**
 * Whether the last order this phone sent belongs to the customer whose khata
 * it now holds. One phone can have opened one customer's khata and sent
 * another's order — a shop's own phone, a shared one at a site — and then
 * nothing of the one should be offered as the other's.
 */
function samePerson(who: { name?: string | null } | null, previous: LastOrder | null) {
  if (!who?.name || !previous?.name) return true
  return who.name.trim().toLowerCase() === previous.name.trim().toLowerCase()
}

/** A way on from a screen that would otherwise end the visit (#23). */
const deadEndLink =
  'inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-border bg-card px-4 text-sm font-semibold text-accent'

// The server writes its refusals in English; show the customer's language.
function errorKey(message: string): TranslationKey {
  if (/unavailable/i.test(message)) return 'order.unavailable'
  if (/10-digit/i.test(message)) return 'order.phoneInvalid'
  if (/your name/i.test(message)) return 'order.nameInvalid'
  if (/delivery date/i.test(message)) return 'order.dateInvalid'
  if (/at least one material/i.test(message)) return 'order.pickSomething'
  if (/already have orders waiting/i.test(message)) return 'order.tooManyWaiting'
  if (/from this phone/i.test(message)) return 'order.deviceBusy'
  if (/too many orders/i.test(message)) return 'order.busy'
  if (/site or address is too long/i.test(message)) return 'order.siteTooLong'
  if (/note is too long/i.test(message)) return 'order.noteTooLong'
  return 'error.generic'
}

/**
 * A supplier's public order page — /order/<link>. No sign-in: a customer
 * picks materials and quantities and sends an order REQUEST, which the
 * supplier reviews. Everything shown comes from order_page (migration 026):
 * names, units, and prices only if the supplier chose to show them.
 */
export default function OrderPage() {
  const { link = '' } = useParams()
  const { t } = useLanguage()
  const navigate = useNavigate()
  const [page, setPage] = useState<OrderPageData | null>(null)
  const [loadFailed, setLoadFailed] = useState(false)
  const [qty, setQty] = useState<Record<string, string>>({})
  const [query, setQuery] = useState('')
  // Their khata with this shop — the code and the customer it belongs to — if
  // this phone has ever opened it (lib/customerLinks — on the phone only,
  // never on the server).
  const [khata] = useState(() => readKhata(link))
  // What the customer told us the first time they opened a shop's QR or link
  // (lib/customerProfile — on this phone only). Fills in the form after the
  // shop's own record and their last order here.
  const [profile, setProfile] = useState<CustomerProfile | null>(readProfile)
  // "Not you? Change": the first-time screen again, to put new details in.
  const [changing, setChanging] = useState(false)
  // The details the welcome screen (or the khata) already gave are shown as
  // one line, "Ordering as …", with Edit opening the same fields (#18).
  const [editingDetails, setEditingDetails] = useState(false)
  const [form, setForm] = useState(() => {
    const previous = readLast(link)
    const mine = khata
    // Who this phone says it is: the shop's own record (the khata) first, then
    // the details typed on the welcome screen. The last order comes after
    // both, so "Hello B" can never sit over a form filled with A (#9).
    const who = mine?.name ? mine : profile ? { name: profile.name } : null
    // Who this phone is, to this shop: the khata's own customer when there is
    // one — that is the shop's own record — and otherwise whoever sent the
    // last order. Taking the name from one and the account from the other is
    // exactly how the card once showed one customer's name over another's
    // khata. The site stays the last order's: it is where the load goes, not
    // who is asking.
    return {
      name: mine?.name ?? profile?.name ?? previous?.name ?? '',
      phone: mine?.phone ?? profile?.phone ?? previous?.phone ?? '',
      // The last order's site only if the same person sent it — otherwise it
      // is somebody else's site on this phone.
      // At most 120 characters — what the box and the server take (#29):
      // a long site plus city used to fail with "Something went wrong".
      site: ((samePerson(who, previous) ? previous?.site : null) || mine?.site || (profile ? siteWithCity(profile) : '')).slice(0, 120),
      date: '',
      note: '',
      trap: '',
    }
  })
  const [last, setLast] = useState<LastOrder | null>(() => readLast(link))
  // Cash unless the customer says otherwise — which is nearly every order.
  const [payment, setPayment] = useState<'cash' | 'online'>('cash')
  const summaryRef = useRef<HTMLDivElement>(null)
  const [logoPreview, setLogoPreview] = useState(false)
  const [sharingShop, setSharingShop] = useState(false)
  // Who provides what (045): shown under Place order, as the admin wrote it.
  const [disclosure, setDisclosure] = useState<string | null>(null)
  useEffect(() => {
    let live = true
    platformDisclosure().then((d) => live && setDisclosure(d), () => undefined)
    return () => {
      live = false
    }
  }, [])
  const [sending, setSending] = useState(false)
  const sendingRef = useRef(false)
  // One id per order: a double tap or a retry returns the same order.
  const requestId = useRef(newRequestId())
  const [error, setError] = useState<string | null>(null)
  // undefined: not sent yet. A string: the status code. null: nothing to show.
  const [sentToken, setSentToken] = useState<string | null | undefined>(undefined)
  const [copied, setCopied] = useState(false)

  // Bumped by Try again (#23), so a failed load can be retried in place.
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    getOrderPage(link)
      .then(setPage)
      .catch(() => setLoadFailed(true))
  }, [link, attempt])
  function retryLoad() {
    setLoadFailed(false)
    setPage(null)
    setAttempt((n) => n + 1)
  }

  // The shop's own page (migration 042): cover, colour, offers, photos and the
  // rest. Absent on a database without 042, and the page is as before.
  const [shop, setShop] = useState<ShopProfile | null>(null)
  useEffect(() => {
    let live = true
    getShopProfile({ link }).then((p) => live && setShop(p))
    return () => {
      live = false
    }
  }, [link])

  // The customer's own account (migration 041), if this phone has one and this
  // shop is on it: the shop's record of who they are fills the form, and the
  // tabs lead back to /me. The order itself is placed exactly as before.
  const [account, setAccount] = useState<MyShop | null>(null)
  // Whether that check has answered, so the first-time screen never flashes
  // up for a customer whose saved account is about to name them.
  const [accountChecked, setAccountChecked] = useState(false)
  useEffect(() => {
    let live = true
    myShops()
      .then((shops) => {
        const mine = shops.find((s) => s.order_link === link)
        if (!live || !mine) return
        setAccount(mine)
        setForm((f) => ({
          ...f,
          name: f.name || mine.customer_name,
          phone: f.phone || mine.customer_phone || '',
          site: f.site || mine.customer_site || '',
        }))
      })
      .catch(() => {
        // No account, or it can't be reached: the page is the public one.
      })
      .finally(() => live && setAccountChecked(true))
    return () => {
      live = false
    }
  }, [link])

  const open = page && page.found && page.open ? page : null
  // Asking how they will pay is only worth it where the shop takes UPI;
  // otherwise every order is cash and there is nothing to choose between.
  const takesUpi = !!open?.upi
  const materials = open?.materials ?? []
  const showSearch = materials.length > 8
  const search = query.trim().toLowerCase()
  const visible = search
    ? materials.filter((m) => m.name.toLowerCase().includes(search) || (m.category ?? '').toLowerCase().includes(search))
    : materials

  const chosen = materials
    .map((m) => ({ material: m, qty: Number(qty[m.id]) || 0 }))
    .filter((c) => c.qty > 0)
  const estimatedTotal =
    open?.show_prices && chosen.length > 0 && chosen.every((c) => c.material.price != null)
      ? chosen.reduce((sum, c) => sum + c.qty * (c.material.price ?? 0), 0)
      : null
  // Only what the supplier still lists can be ordered again.
  // "Repeat" only for the same person (#9): the khata's customer, or else
  // whoever the welcome screen says this phone is.
  const lastAvailable = last && samePerson(khata?.name ? khata : profile ? { name: profile.name } : null, last) ? last.items.filter((it) => materials.some((m) => m.id === it.material_id)) : []

  // The quantity box being typed in (#3).
  const [editingQty, setEditingQty] = useState<string | null>(null)

  function step(id: string, delta: number) {
    setQty((prev) => {
      const next = Math.min(100000, Math.max(0, (Number(prev[id]) || 0) + delta))
      return { ...prev, [id]: next ? String(next) : '' }
    })
    setError(null)
  }

  function fillLast() {
    if (!last) return
    setQty(Object.fromEntries(lastAvailable.map((it) => [it.material_id, String(it.qty)])))
    setForm((f) => ({
      ...f,
      name: f.name || khata?.name || last.name,
      phone: f.phone || khata?.phone || last.phone,
      site: f.site || last.site,
    }))
    setError(null)
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!open || sendingRef.current) return
    if (chosen.length === 0) return setError(t('order.pickSomething'))
    if (form.name.trim().length < 2) {
      setEditingDetails(true)
      return setError(t('order.nameInvalid'))
    }
    if (form.phone.length !== 10) {
      setEditingDetails(true)
      return setError(t('order.phoneInvalid'))
    }
    sendingRef.current = true
    setSending(true)
    setError(null)
    try {
      const result = await placeOrder({
        link,
        requestId: requestId.current,
        name: form.name.trim(),
        phone: form.phone,
        site: form.site.trim(),
        deliveryDate: form.date || null,
        note: form.note.trim(),
        items: chosen.map((c) => ({ material_id: c.material.id, qty: c.qty })),
        trap: form.trap,
        // Only where the shop takes UPI is the question asked at all, and the
        // answer is an intention — nothing is paid or recorded by it.
        paymentMethod: takesUpi ? payment : null,
      })
      const sent: LastOrder = {
        items: chosen.map((c) => ({ material_id: c.material.id, qty: c.qty })),
        name: form.name.trim(),
        phone: form.phone,
        site: form.site.trim(),
      }
      rememberLast(link, sent)
      setLast(sent)
      if (result.token) rememberOrder(link, result.token)
      setSentToken(result.token)
      window.scrollTo({ top: 0 })
    } catch (err) {
      const key = errorKey(err instanceof Error ? err.message : '')
      // A refused name, phone or site: open the fields so it can be fixed (#18).
      if (key === 'order.phoneInvalid' || key === 'order.nameInvalid' || key === 'order.siteTooLong') setEditingDetails(true)
      setError(t(key))
    } finally {
      sendingRef.current = false
      setSending(false)
    }
  }

  function startAgain() {
    setQty({})
    setForm((f) => ({ ...f, date: '', note: '', trap: '' }))
    // The next order starts from the one line again, with whatever was edited.
    setEditingDetails(false)
    requestId.current = newRequestId()
    setSentToken(undefined)
    setCopied(false)
  }

  async function copyStatusLink(token: string) {
    try {
      await navigator.clipboard.writeText(orderStatusUrl(token))
      setCopied(true)
    } catch {
      setCopied(false)
    }
  }

  // The shop's own name and logo in the bar (#14), on every state of the
  // page; BuildSupply until the shop is known.
  const header = (
    <CustomerHeader
      shop={open}
      onLogo={() => setLogoPreview(true)}
      logoLabel={t('shop.viewLogo')}
    />
  )

  if (!page && !loadFailed) {
    return (
      <div className="min-h-screen bg-surface">
        {header}
        <TruckLoader />
      </div>
    )
  }

  if (loadFailed || !page || !page.found || !page.open) {
    const message = loadFailed ? t('error.generic') : page && page.found ? t('order.unavailable') : t('order.notFound')
    return (
      <div className="flex min-h-screen flex-col bg-surface">
        {header}
        <main className="mx-auto flex w-full max-w-lg flex-1 flex-col gap-3 p-4">
          <Card className="text-center text-sm text-ink">{message}</Card>
          {/* Never a dead end (#23): try again after a failed load, and the
              customer's own khata (or saved shops) from here. */}
          {loadFailed && (
            <Button variant="outline" className="h-11" onClick={retryLoad}>
              <RotateCcw size={16} /> {t('account.retry')}
            </Button>
          )}
          {khata ? (
            <Link to={`/khata/${khata.code}`} className={deadEndLink}>
              <BookOpen size={16} /> {t('order.tileKhata')}
            </Link>
          ) : hasCustomerSession() ? (
            <Link to="/me" className={deadEndLink}>
              <BookOpen size={16} /> {t('acct.title')}
            </Link>
          ) : null}
          <BuildSupplyFooter />
        </main>
      </div>
    )
  }

  // A customer this phone doesn't know yet — no details given, no khata link
  // opened here, no saved account — tells us who they are once, first.
  const unknown = !profile && !khata && !account
  if (unknown && !accountChecked) {
    return (
      <div className="min-h-screen bg-surface">
        {header}
        <TruckLoader />
      </div>
    )
  }
  if ((unknown || changing) && sentToken === undefined) {
    return (
      <CustomerWelcome
        shopName={page.business_name}
        logoUrl={page.logo_url}
        initial={changing ? profile : undefined}
        onCancel={changing ? () => setChanging(false) : undefined}
        onDone={(p) => {
          setProfile(p)
          setChanging(false)
          setForm((f) => ({ ...f, name: p.name, phone: p.phone, site: siteWithCity(p).slice(0, 120) }))
          window.scrollTo({ top: 0 })
        }}
      />
    )
  }

  if (sentToken !== undefined) {
    return (
      <div className="flex min-h-screen flex-col bg-surface">
        {header}
        <main className="mx-auto flex w-full max-w-lg flex-1 flex-col gap-4 p-4">
          <SoftCard className="flex flex-col gap-4 p-5">
            <SuccessHeader title={t('order.sentTitle')} />
            <p className="text-sm text-ink">{t('order.sentBody', { business: page.business_name })}</p>
            {sentToken && (
              <div className="rounded-lg bg-surface p-3">
                <p className="mb-2 text-xs text-muted">{t('order.keepLink')}</p>
                <p className="break-all text-xs font-medium text-ink">{orderStatusUrl(sentToken)}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button size="tap" variant="outline" onClick={() => copyStatusLink(sentToken)}>
                    {copied ? t('order.copied') : t('order.copyLink')}
                  </Button>
                  {/* A link styled as a button, not a button inside a link (#35). */}
                  <Link to={`/order-status/${sentToken}`} className={buttonVariants({ size: 'tap' })}>
                    {t('order.viewStatus')}
                  </Link>
                </div>
              </div>
            )}
            <Button variant="outline" size="tap" onClick={startAgain}>
              {t('order.another')}
            </Button>
            {/* And the ways on from here (#23): the shop, and their khata. */}
            {(page.phone || account || khata) && (
              <div className="flex flex-wrap gap-2">
                {page.phone && (
                  <a href={`tel:${page.phone}`} className={deadEndLink}>
                    <Phone size={16} /> {t('khata.menuCall')}
                  </a>
                )}
                {account ? (
                  <button type="button" onClick={() => openAccount('')} className={deadEndLink}>
                    <BookOpen size={16} /> {t('order.tileKhata')}
                  </button>
                ) : khata ? (
                  <Link to={`/khata/${khata.code}`} className={deadEndLink}>
                    <BookOpen size={16} /> {t('order.tileKhata')}
                  </Link>
                ) : null}
              </div>
            )}
          </SoftCard>
          <BuildSupplyFooter />
        </main>
      </div>
    )
  }

  // Who this phone is to this shop, for the greeting: the khata's own
  // customer, or whoever sent the last order. Nobody known: no greeting.
  const knownName = account?.customer_name ?? khata?.name ?? profile?.name ?? last?.name ?? null
  // Only details typed on this phone can be changed here; a khata or saved
  // account is the shop's own record of who they are.
  const canChange = !account && !khata && !!profile
  const quickActions: QuickAction[] = [
    ...(page.address
      ? [
          {
            key: 'directions',
            icon: Navigation,
            label: t('order.tileDirections'),
            href: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${page.business_name}, ${page.address}`)}`,
          },
        ]
      : []),
    ...(shopWhatsapp(shop) ? [{ key: 'wa', icon: MessageCircle, label: t('shop.tileWhatsapp'), href: shopWhatsapp(shop)! }] : []),
    ...(lastAvailable.length > 0 ? [{ key: 'again', icon: RotateCcw, label: t('order.tileAgain'), onClick: fillLast }] : []),
    ...(account
      ? [{ key: 'khata', icon: BookOpen, label: t('order.tileKhata'), onClick: () => openAccount('') }]
      : khata
        ? [{ key: 'khata', icon: BookOpen, label: t('order.tileKhata'), to: `/khata/${khata.code}` }]
        : []),
    { key: 'share', icon: Share2, label: t('khata.tileShare'), onClick: () => setSharingShop(true) },
  ]
  // The same tabs as the khata link's, once this phone knows the customer's
  // khata — the two pages are one app to them. A first-time visitor has no
  // account to switch to, so no tab bar, only the order.
  function openAccount(search: string) {
    if (!account) return
    rememberCurrentShop(account.connection)
    navigate(`/me${search}`)
  }
  const tabs = account
    ? [
        { key: 'home', icon: House, label: t('khata.tabHome'), active: false, onClick: () => openAccount('') },
        { key: 'materials', icon: ShoppingBag, label: t('khata.orderMaterials'), active: true, onClick: () => window.scrollTo({ top: 0, behavior: 'smooth' }) },
        { key: 'bills', icon: Receipt, label: t('khata.tabBills'), active: false, onClick: () => openAccount('?s=bills') },
        { key: 'orders', icon: Package, label: t('khata.tabOrders'), active: false, onClick: () => openAccount('?s=orders') },
      ]
    : khata
    ? [
        { key: 'home', icon: House, label: t('khata.tabHome'), active: false, onClick: () => navigate(`/khata/${khata.code}`) },
        { key: 'materials', icon: ShoppingBag, label: t('khata.orderMaterials'), active: true, onClick: () => window.scrollTo({ top: 0, behavior: 'smooth' }) },
        { key: 'bills', icon: Receipt, label: t('khata.tabBills'), active: false, onClick: () => navigate(`/khata/${khata.code}?s=bills`) },
        { key: 'orders', icon: Package, label: t('khata.tabOrders'), active: false, onClick: () => navigate(`/khata/${khata.code}?s=orders`) },
      ]
    : null
  const chosenCount = chosen.length

  return (
    <div className="flex min-h-screen flex-col bg-surface" data-brand={brandAttr(shop?.brand_color)}>
      {header}
      <main className={cn('mx-auto flex w-full max-w-lg flex-1 flex-col gap-4 p-4', tabs ? 'pb-44' : 'pb-28')}>
        {knownName && (
          <div className="flex items-center gap-3 pt-1">
            <CustomerAvatar id={`${page.business_name}|${knownName}`} name={knownName} size={44} />
            <div className="min-w-0 flex-1">
              <div className="text-xs text-muted">{t(greetingKey())}</div>
              <div className="line-clamp-2 break-words text-lg font-bold leading-tight text-ink">
                {t('khata.hello', { name: knownName })}
              </div>
              {canChange && (
                <button
                  type="button"
                  // Nothing is cleared until they press Continue (#17).
                  onClick={() => setChanging(true)}
                  className="inline-flex min-h-11 items-center text-xs font-medium text-accent-text"
                >
                  {t('cw.notYou')}
                </button>
              )}
            </div>
          </div>
        )}

        {/* The shop: its own page (042) when it has one, the plain card otherwise. */}
        {shop ? (
          <ShopHero
            shop={shop}
            action={
              page.phone ? (
                <a
                  href={`tel:${page.phone}`}
                  aria-label={t('khata.call')}
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-accent text-white shadow"
                >
                  <Phone size={18} />
                </a>
              ) : undefined
            }
          />
        ) : (
          <>
        {/* The shop: who, where, and its phone on the round button. */}
            <SoftCard className="flex items-center gap-3 p-4">
          {page.logo_url ? (
            <button type="button" aria-label={t('shop.viewLogo')} onClick={() => setLogoPreview(true)} className="shrink-0">
              <img src={page.logo_url} alt="" className="h-14 w-14 rounded-2xl bg-white object-cover" />
            </button>
          ) : (
            <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-accent-bg text-accent-text">
              <Truck size={26} strokeWidth={1.8} />
            </span>
          )}
          <div className="min-w-0 flex-1">
            <div className="break-words text-base font-bold leading-tight text-ink">{page.business_name}</div>
            {page.address ? (
              <div className="mt-0.5 flex items-start gap-1 text-xs text-muted">
                <MapPin size={13} className="mt-px shrink-0" />
                <span className="line-clamp-2 min-w-0 break-words">{page.address}</span>
              </div>
            ) : (
              <div className="text-xs text-muted">{t('order.title')}</div>
            )}
          </div>
          {page.phone && (
            <a
              href={`tel:${page.phone}`}
              aria-label={t('khata.call')}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-accent text-white shadow"
            >
              <Phone size={18} />
            </a>
          )}
        </SoftCard>

          </>
        )}

        <QuickActions actions={quickActions} />

        {shop && <ShopOffers shop={shop} />}
        {shop && <ShopDelivery shop={shop} />}

        <SectionHeading title={t('order.materialsHeading')} />
        <p className="-mt-2 px-1 text-xs text-muted">{t('order.intro')}</p>
        {showSearch && (
          <div className="relative">
            <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
            <Input
              placeholder={t('order.search')}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="rounded-2xl pl-9"
            />
          </div>
        )}
        {materials.length === 0 && <SoftCard className="p-4 text-sm text-muted">{t('order.noMaterials')}</SoftCard>}

        {/* Every material a tile: a tinted icon, its name, its price or unit,
            and Add — which becomes − qty + once it is in the order. The
            quantity box still takes typing, for 250 bags or 1.5 brass. */}
        <div className="grid grid-cols-2 gap-3">
          {visible.map((m) => {
            const value = qty[m.id] ?? ''
            // While its box is being typed in, the material stays in the
            // stepper even when the box is momentarily empty — deleting the "1"
            // to type "250" used to swap the box for "Add" and close the
            // keyboard (#3). Leaving an empty box puts "Add" back.
            const inOrder = Number(value) > 0 || editingQty === m.id
            return (
              <div
                key={m.id}
                className={cn(
                  'flex min-w-0 flex-col gap-2 rounded-2xl border bg-card p-3 shadow-[0_2px_10px_rgba(10,36,39,0.04)]',
                  inOrder ? 'border-accent' : 'border-border',
                )}
              >
                {/* The shop's photo, the catalog's, or a drawing of the material. */}
                <MaterialPicture name={m.name} category={m.category} photo={shop?.photos[m.id]} />
                <div className="min-w-0 flex-1">
                  <div className="line-clamp-2 break-words text-sm font-semibold leading-snug text-ink">{m.name}</div>
                  <div className="truncate text-xs text-muted">
                    {page.show_prices
                      ? m.price != null
                        ? `${formatINR(m.price)}${m.unit ? ` / ${m.unit}` : ''}`
                        : t('order.priceOnRequest')
                      : m.unit}
                  </div>
                </div>
                {inOrder ? (
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      aria-label={t('order.less', { name: m.name })}
                      onClick={() => step(m.id, -1)}
                      className="flex h-11 w-9 shrink-0 items-center justify-center rounded-xl bg-surface text-ink"
                    >
                      <Minus size={15} />
                    </button>
                    <input
                      type="text"
                      inputMode="decimal"
                      aria-label={t('order.qtyOf', { name: m.name })}
                      value={value}
                      onFocus={() => setEditingQty(m.id)}
                      onBlur={() => setEditingQty((id) => (id === m.id ? null : id))}
                      onChange={(e) => {
                        const next = orderQty(e.target.value)
                        // Beyond what an order can carry, the box keeps what it had (#4).
                        if (next === null) return
                        setQty((prev) => ({ ...prev, [m.id]: next }))
                        setError(null)
                      }}
                      className="h-11 w-full min-w-0 rounded-xl border border-border bg-card text-center text-sm font-semibold text-ink outline-none focus:border-accent"
                    />
                    <button
                      type="button"
                      aria-label={t('order.more', { name: m.name })}
                      onClick={() => step(m.id, 1)}
                      className="flex h-11 w-9 shrink-0 items-center justify-center rounded-xl bg-accent text-white"
                    >
                      <Plus size={15} />
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    aria-label={t('order.more', { name: m.name })}
                    onClick={() => step(m.id, 1)}
                    className="flex h-11 items-center justify-center gap-1.5 rounded-xl bg-accent-bg text-sm font-semibold text-accent-text"
                  >
                    <Plus size={15} /> {t('order.add')}
                  </button>
                )}
              </div>
            )
          })}
        </div>

        {/* What has been added, in words and in rupees, then who it is for. */}
        <div ref={summaryRef} className="flex scroll-mt-20 flex-col gap-4">
          {chosen.length > 0 && (
            <>
              <SectionHeading title={t('order.summaryTitle')} />
              <SoftCard className="p-4">
                <ul className="flex flex-col divide-y divide-border">
                  {chosen.map((c) => (
                    <li key={c.material.id} className="flex items-start justify-between gap-3 py-2.5 first:pt-0 last:pb-0">
                      <span className="min-w-0">
                        <span className="block break-words text-sm font-medium text-ink">{c.material.name}</span>
                        <span className="block text-xs text-muted">
                          {c.qty} {c.material.unit}
                          {page.show_prices && c.material.price != null ? ` × ${formatINR(c.material.price)}` : ''}
                        </span>
                      </span>
                      {page.show_prices && c.material.price != null && (
                        <span className="shrink-0 text-sm font-semibold text-ink">{formatINR(c.qty * c.material.price)}</span>
                      )}
                    </li>
                  ))}
                </ul>
                {estimatedTotal != null && (
                  <div className="mt-4 rounded-2xl bg-accent-bg px-4 py-3">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-sm font-semibold text-accent-text">{t('order.estimatedLabel')}</span>
                      <span className="shrink-0 text-2xl font-bold leading-none text-accent-text">{formatINR(estimatedTotal)}</span>
                    </div>
                    <p className="mt-1.5 text-xs text-muted">{t('order.estimatedNote')}</p>
                  </div>
                )}
              </SoftCard>
            </>
          )}

          <SectionHeading title={t('order.yourDetails')} />
          <SoftCard className="p-4">
            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              {!editingDetails && form.name.trim().length >= 2 && form.phone.length === 10 ? (
                // Already given once: not asked again. Edit opens the same
                // three fields, and what the shop receives is unchanged.
                <div className="flex items-start gap-3 rounded-2xl bg-surface p-3">
                  <div className="min-w-0 flex-1 text-sm">
                    <div className="text-xs text-muted">{t('order.orderingAs')}</div>
                    <div className="break-words font-semibold text-ink">{form.name.trim()}</div>
                    <div className="break-words text-muted">
                      {[form.phone, form.site.trim()].filter(Boolean).join(' · ')}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setEditingDetails(true)}
                    className="flex h-11 shrink-0 items-center rounded-full border border-border px-4 text-sm font-semibold text-accent"
                  >
                    {t('order.editDetails')}
                  </button>
                </div>
              ) : (
                <>
                  <div>
                    <Label htmlFor="order-name" required>{t('order.name')}</Label>
                    <Input id="order-name" className="h-11" autoComplete="name" value={form.name} maxLength={60} onChange={(e) => setForm({ ...form, name: e.target.value })} />
                  </div>
                  <div>
                    <Label htmlFor="order-phone" required>{t('order.phone')}</Label>
                    <PhoneInput id="order-phone" className="h-11" value={form.phone} onValueChange={(phone) => setForm({ ...form, phone })} />
                  </div>
                  <div>
                    <Label htmlFor="order-site">{t('order.site')}</Label>
                    <Input id="order-site" className="h-11" value={form.site} maxLength={120} onChange={(e) => setForm({ ...form, site: e.target.value })} />
                  </div>
                </>
              )}
              <div>
                <Label htmlFor="order-date">{t('order.date')}</Label>
                <Input
                  className="h-11"
                  id="order-date"
                  type="date"
                  min={localIsoDate(0)}
                  max={localIsoDate(90)}
                  value={form.date}
                  onChange={(e) => setForm({ ...form, date: e.target.value })}
                />
              </div>
              {takesUpi && (
                <div>
                  <Label id="order-pay-how">{t('order.payHow')}</Label>
                  {/* A choice a screen reader can hear, and a tick, not colour
                      alone, on the one chosen (#35). */}
                  <div role="radiogroup" aria-labelledby="order-pay-how" className="mt-1 grid grid-cols-2 gap-2">
                    {(['cash', 'online'] as const).map((mode) => (
                      <button
                        key={mode}
                        type="button"
                        role="radio"
                        aria-checked={payment === mode}
                        onClick={() => setPayment(mode)}
                        className={`flex min-h-11 items-center justify-center gap-1.5 rounded-xl border px-3 py-2.5 text-sm font-medium ${
                          payment === mode ? 'border-accent bg-accent-bg text-accent-text' : 'border-border text-muted'
                        }`}
                      >
                        {payment === mode && <Check size={15} className="shrink-0" aria-hidden="true" />}
                        {t(mode === 'cash' ? 'order.payCash' : 'order.payOnline')}
                      </button>
                    ))}
                  </div>
                  <p className="mt-1.5 text-xs text-muted">{t(payment === 'cash' ? 'order.payCashHint' : 'order.payOnlineHint')}</p>
                </div>
              )}
              <div>
                <Label htmlFor="order-note">{t('order.note')}</Label>
                <textarea
                  id="order-note"
                  rows={2}
                  maxLength={300}
                  placeholder={t('order.notePlaceholder')}
                  value={form.note}
                  onChange={(e) => setForm({ ...form, note: e.target.value })}
                  className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-ink placeholder:text-muted-2 outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
                />
              </div>
              {/* Only bots fill this in: invisible, unfocusable, and skipped by autofill. */}
              <div aria-hidden="true" className="absolute -left-[9999px] h-px w-px overflow-hidden">
                <label htmlFor="order-website">Website</label>
                <input id="order-website" tabIndex={-1} autoComplete="off" value={form.trap} onChange={(e) => setForm({ ...form, trap: e.target.value })} />
              </div>
              {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">{error}</p>}
              {/* Big, and wrapping rather than clipped: a long business name
                  must still read as one sentence with the button's word. */}
              <Button
                type="submit"
                size="lg"
                disabled={sending}
                className="h-auto w-full whitespace-normal rounded-2xl py-4 text-base leading-snug shadow-sm"
              >
                {sending ? (
                  t('order.placing')
                ) : (
                  <>
                    <Send size={18} className="shrink-0" />
                    <span>{t('order.placeAt', { business: page.business_name })}</span>
                  </>
                )}
              </Button>
              {disclosure && (
                <p lang="en" className="text-center text-xs leading-relaxed text-muted">
                  {disclosure}
                </p>
              )}
            </form>
          </SoftCard>
        </div>

        {shop && <ShopAbout shop={shop} showContact={false} />}
        <BuildSupplyFooter />
      </main>

      {/* The cart, floating above the tab bar once something is in it: how
          many materials, the estimate if prices show, and a tap down to the
          summary and the form. */}
      {chosenCount > 0 && (
        <div
          className={cn(
            'fixed inset-x-0 z-30 px-3',
            tabs ? 'bottom-[calc(4.75rem_+_var(--safe-bottom))]' : 'bottom-[calc(0.5rem_+_var(--safe-bottom))]',
          )}
        >
          <button
            type="button"
            onClick={() => summaryRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
            className="mx-auto flex w-full max-w-md items-center gap-3 rounded-2xl bg-accent px-4 py-3 text-left text-white shadow-[0_6px_24px_rgba(10,36,39,0.25)]"
          >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/15">
              <ShoppingBag size={18} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-bold">{t('order.selectedCount', { count: chosenCount })}</span>
              {estimatedTotal != null && <span className="block truncate text-xs text-white/85">{formatINR(estimatedTotal)}</span>}
            </span>
            <span className="flex shrink-0 items-center gap-1 text-sm font-semibold">
              {t('order.review')} <ChevronRight size={16} />
            </span>
          </button>
        </div>
      )}

      {tabs && <CustomerTabBar tabs={tabs} />}

      {logoPreview && open?.logo_url && (
        <ImagePreview src={open.logo_url} alt={open.business_name} onClose={() => setLogoPreview(false)} />
      )}

      {/* Link or QR, the same two steps the supplier's own Share order link
          offers. Nobody is signed in here, so the shop's name and logo are
          handed in rather than read from an account. */}
      {sharingShop && (
        <OrderLinkShareModal
          url={window.location.href.split('?')[0]}
          business={page.business_name}
          logoUrl={page.logo_url}
          message={t('order.shareText', {
            business: page.business_name,
            url: window.location.href.split('?')[0],
          })}
          onClose={() => setSharingShop(false)}
        />
      )}
    </div>
  )
}
