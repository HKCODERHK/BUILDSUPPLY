import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import {
  BookOpen,
  Check,
  House,
  MapPin,
  Minus,
  Navigation,
  Package,
  Phone,
  Plus,
  Trash2,
  UserRound,
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
import { sanitizeDecimal, sanitizeDigits } from '@/lib/numberInput'
import { newRequestId } from '@/services/db'
import { platformDisclosure } from '@/services/compliance'
import {
  getOrderPage,
  orderStatusUrl,
  placeOrder,
  type OrderPage as OrderPageData,
  type OrderPageMaterial,
} from '@/services/orders'
import {
  byLoad,
  capacityText,
  firstQty,
  isVehicleOption,
  listingKey,
  loadsKey,
  quantityProblem,
  stepOf,
  totalMaterialText,
  vehicleOptionLabel,
} from '@/lib/sellingType'
import { OrderLinkShareModal } from '@/components/OrderLinkShareModal'
import { forgetShopOnPhone, readKhata, rememberOrder, rememberShopName } from '@/lib/customerLinks'
import { hasCustomerSession } from '@/lib/customerAuth'
import { CustomerHeader, QuickActions, SectionHeading, ShopAppBar, SoftCard, type QuickAction } from '@/components/CustomerHome'
import { ShopOrdersView } from '@/components/ShopOrdersView'
import { CustomerMeView } from '@/components/CustomerMeView'
import { greetingKey } from '@/lib/customerHome'
import { cn } from '@/lib/utils'
import { myShops, rememberCurrentShop, type MyShop } from '@/services/customerAccount'
import { getShopProfile, type ShopProfile } from '@/services/shopPage'
import { ShopAbout, ShopDelivery, ShopHero, ShopOffers } from '@/components/ShopProfileView'
import { MaterialPicture } from '@/components/MaterialPicture'
import { CustomerWelcome } from '@/components/CustomerWelcome'
import { BuildSupplyFooter } from '@/components/BuildSupplyFooter'
import { clearProfile, profileKept, readProfile, siteWithCity, type CustomerProfile } from '@/lib/customerProfile'
import { ImagePreview, Modal } from '@/components/ui/modal'
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

/**
 * One chosen material in words: "River Sand / Truck • 800 CFT · 2 loads =
 * 1,600 CFT", or "Cement / 20 Bag × ₹350". Never a bare number (050).
 */
function OrderLine({ line, showPrice }: { line: { material: OrderPageMaterial; qty: number }; showPrice: boolean }) {
  const { t } = useLanguage()
  const m = line.material
  if (isVehicleOption(m)) {
    return (
      <span className="min-w-0">
        <span className="block break-words text-sm font-medium text-ink">{m.listing_name}</span>
        <span className="block text-xs text-muted">
          {vehicleOptionLabel(m.vehicle!, m.capacity!, m.capacity_unit!)} · {t(loadsKey(line.qty), { count: line.qty })} ={' '}
          <span className="font-semibold text-ink">{totalMaterialText(line.qty, m.capacity!, m.capacity_unit!)}</span>
        </span>
        {showPrice && m.price != null && (
          <span className="block text-xs text-muted">{t('sell.loadsTimesPrice', { count: line.qty, price: formatINR(m.price) })}</span>
        )}
      </span>
    )
  }
  return (
    <span className="min-w-0">
      <span className="block break-words text-sm font-medium text-ink">{m.name}</span>
      <span className="block text-xs text-muted">
        {line.qty} {m.unit}
        {showPrice && m.price != null ? ` × ${formatINR(m.price)}` : ''}
      </span>
    </span>
  )
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
  if (/not available right now/i.test(message)) return 'order.notAvailableNow'
  if (/how the shop sells it/i.test(message)) return 'order.qtyRule'
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
  // A category chip: only which tiles show, never what is in the order.
  const [category, setCategory] = useState<string | null>(null)
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
  // The page as an app (2026-10-21): Home, Cart, Orders and Profile, kept in
  // ?v= so the phone's back button steps back through them, like the khata
  // link's ?s=. An unknown value is Home.
  const [searchParams, setSearchParams] = useSearchParams()
  const view = (['cart', 'orders', 'profile'] as const).find((v) => v === searchParams.get('v')) ?? 'home'
  function go(next: 'home' | 'cart' | 'orders' | 'profile') {
    if (next === view) return
    setSearchParams(next === 'home' ? {} : { v: next })
    window.scrollTo({ top: 0 })
  }
  // The material whose detail sheet is open.
  const [detail, setDetail] = useState<OrderPageMaterial | null>(null)
  const [logoPreview, setLogoPreview] = useState(false)
  const [ownerPreview, setOwnerPreview] = useState(false)
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
      .then((p) => {
        setPage(p)
        // Named on this phone for "Lost your khata link?" (2026-10-20).
        if (p.found && p.open) rememberShopName(link, p.business_name)
      })
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
  const search = query.trim().toLowerCase()
  // The shop's own categories, in the order its list has them.
  const categories = [...new Set(materials.map((m) => (m.category ?? '').trim()).filter(Boolean))]
  const visible = (search
    ? materials.filter(
        (m) =>
          m.name.toLowerCase().includes(search) ||
          (m.listing_name ?? '').toLowerCase().includes(search) ||
          (m.category ?? '').toLowerCase().includes(search),
      )
    : materials
  ).filter((m) => !category || (m.category ?? '').trim() === category)

  const chosen = materials
    .map((m) => ({ material: m, qty: Number(qty[m.id]) || 0 }))
    .filter((c) => c.qty > 0)
  // The material and its delivery, kept apart (migration 050): delivery is
  // per load for a vehicle, once per material otherwise, and only where the
  // shop shows prices.
  const deliveryOf = (c: { material: OrderPageMaterial; qty: number }) =>
    c.material.delivery_charge ? (isVehicleOption(c.material) ? c.qty : 1) * c.material.delivery_charge : 0
  const materialTotal =
    open?.show_prices && chosen.length > 0 && chosen.every((c) => c.material.price != null)
      ? chosen.reduce((sum, c) => sum + c.qty * (c.material.price ?? 0), 0)
      : null
  const deliveryTotal = chosen.reduce((sum, c) => sum + deliveryOf(c), 0)
  const estimatedTotal = materialTotal != null ? materialTotal + deliveryTotal : null

  // A vehicle material's options are one tile with a choice of vehicle;
  // everything else is a tile of its own, in the order the shop lists them.
  type Tile =
    | { kind: 'one'; m: OrderPageMaterial }
    | { kind: 'vehicle'; key: string; name: string; category: string | null; options: OrderPageMaterial[] }
  const tiles: Tile[] = []
  const vehicleTiles = new Map<string, Extract<Tile, { kind: 'vehicle' }>>()
  for (const m of visible) {
    if (!isVehicleOption(m)) {
      tiles.push({ kind: 'one', m })
      continue
    }
    const key = listingKey(m)
    const tile = vehicleTiles.get(key)
    if (tile) tile.options.push(m)
    else {
      const fresh = { kind: 'vehicle' as const, key, name: m.listing_name!, category: m.category, options: [m] }
      vehicleTiles.set(key, fresh)
      tiles.push(fresh)
    }
  }
  for (const tile of vehicleTiles.values()) tile.options.sort(byLoad)
  // Only what the supplier still lists can be ordered again.
  // "Repeat" only for the same person (#9): the khata's customer, or else
  // whoever the welcome screen says this phone is.
  const lastAvailable = last && samePerson(khata?.name ? khata : profile ? { name: profile.name } : null, last) ? last.items.filter((it) => materials.some((m) => m.id === it.material_id && m.available !== false)) : []

  // The quantity box being typed in (#3).
  const [editingQty, setEditingQty] = useState<string | null>(null)

  /**
   * One tap of − or +: whole loads for a vehicle, otherwise the shop's own
   * steps, starting at its minimum and dropping out below it (migration 050).
   */
  function step(m: OrderPageMaterial, dir: 1 | -1) {
    setQty((prev) => {
      const current = Number(prev[m.id]) || 0
      let next = current === 0 && dir > 0 ? firstQty(m) : Math.round((current + dir * stepOf(m)) * 100) / 100
      const least = isVehicleOption(m) ? 1 : Number(m.min_qty) || 0
      if (next < least) next = 0
      next = Math.min(100000, Math.max(0, next))
      return { ...prev, [m.id]: next ? String(next) : '' }
    })
    setError(null)
  }

  /** Choosing another vehicle carries the loads across to it. */
  function pickVehicle(options: OrderPageMaterial[], chosenOption: OrderPageMaterial) {
    setQty((prev) => {
      const loads = options.reduce((n, o) => Math.max(n, Number(prev[o.id]) || 0), 0)
      const next = { ...prev }
      for (const o of options) next[o.id] = ''
      next[chosenOption.id] = String(loads || 1)
      return next
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
    // The same rule place_order checks: whole loads, the minimum, the steps.
    if (chosen.some((c) => quantityProblem(c.material, c.qty))) return setError(t('order.qtyRule'))
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
    // Back to the shop, not an empty cart.
    setSearchParams({}, { replace: true })
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
      shop={open ? { business_name: open.business_name, logo_url: open.logo_url ?? shop?.logo_url ?? null } : null}
      onLogo={() => setLogoPreview(true)}
      logoLabel={t('shop.viewLogo')}
      minimal
      ownerPhoto={shop?.owner_photo_url}
      onOwner={() => setOwnerPreview(true)}
      ownerLabel={t('shop.ownerPhoto')}
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
            {chosen.length > 0 && (
              <ul className="flex flex-col divide-y divide-border rounded-lg bg-surface px-3">
                {chosen.map((c) => (
                  <li key={c.material.id} className="py-2">
                    <OrderLine line={c} showPrice={false} />
                  </li>
                ))}
              </ul>
            )}
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
  const chosenCount = chosen.length

  return (
    <div className="flex min-h-screen flex-col bg-surface" data-brand={brandAttr(shop?.brand_color)}>
      {header}
      <main className="mx-auto flex w-full max-w-lg flex-1 flex-col gap-4 p-4 pb-36 sm:max-w-2xl">
        {view === 'home' && (
          <>
        {/* The top band: who they are, what this page is for, and the search —
            the shop's own colour, white text (each brand colour is ≥5:1). */}
        <section className="rounded-3xl bg-accent p-4 text-white shadow-[0_8px_24px_rgba(10,36,39,0.16)]">
          {knownName && (
            <div className="mb-3 flex items-center gap-3">
              <CustomerAvatar id={`${page.business_name}|${knownName}`} name={knownName} size={40} />
              <div className="min-w-0 flex-1">
                <div className="text-xs text-white/80">{t(greetingKey())}</div>
                <div className="line-clamp-2 break-words text-base font-bold leading-tight">{t('khata.hello', { name: knownName })}</div>
              </div>
              {canChange && (
                <button
                  type="button"
                  // Nothing is cleared until they press Continue (#17).
                  onClick={() => setChanging(true)}
                  className="inline-flex min-h-11 shrink-0 items-center rounded-full px-2 text-xs font-semibold text-white underline underline-offset-2"
                >
                  {t('cw.notYou')}
                </button>
              )}
            </div>
          )}
          <h1 className="text-xl font-bold leading-tight">{t('order.heroTitle')}</h1>
          <p className="mt-1 text-xs leading-snug text-white/85">{t('order.intro')}</p>
          {materials.length > 0 && (
            <div className="relative mt-3">
              <Search size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" />
              <input
                type="search"
                aria-label={t('order.search')}
                placeholder={t('order.search')}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="h-11 w-full rounded-2xl border-0 bg-white pl-10 pr-3 text-sm text-[#0a2427] outline-none placeholder:text-slate-500 focus:ring-2 focus:ring-white/60"
              />
            </div>
          )}
        </section>

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

        <div className="flex items-baseline justify-between gap-3 px-1">
          <h2 className="text-base font-bold text-ink">{t('order.materialsHeading')}</h2>
          {materials.length > 0 && <span className="shrink-0 text-xs text-muted">{t('order.itemCount', { count: tiles.length })}</span>}
        </div>
        {/* The shop's categories as chips — they only narrow what is shown. */}
        {categories.length > 1 && (
          <div className="-mx-4 -mt-1 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" role="group" aria-label={t('order.categories')}>
            {[null, ...categories].map((c) => {
              const on = category === c
              return (
                <button
                  key={c ?? '*'}
                  type="button"
                  aria-pressed={on}
                  onClick={() => setCategory(c)}
                  className={cn(
                    'h-9 shrink-0 rounded-full border px-4 text-xs font-semibold transition-colors',
                    on ? 'border-accent bg-accent text-white' : 'border-border bg-card text-ink hover:bg-surface',
                  )}
                >
                  {c ?? t('order.allCategories')}
                </button>
              )
            })}
          </div>
        )}
        {materials.length === 0 && <SoftCard className="p-4 text-sm text-muted">{t('order.noMaterials')}</SoftCard>}
        {materials.length > 0 && tiles.length === 0 && (
          <SoftCard className="flex flex-col items-start gap-2 p-4 text-sm text-muted">
            {t('order.noMatch')}
            <button
              type="button"
              onClick={() => {
                setQuery('')
                setCategory(null)
              }}
              className="inline-flex min-h-11 items-center text-sm font-semibold text-accent"
            >
              {t('order.showAll')}
            </button>
          </SoftCard>
        )}

        {/* Every material a tile: a tinted icon, its name, its price or unit,
            and Add — which becomes − qty + once it is in the order. The
            quantity box still takes typing, for 250 bags or 1.5 brass. */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {tiles.map((tile) => {
            if (tile.kind === 'vehicle') {
              const picked = tile.options.find((o) => Number(qty[o.id]) > 0 || editingQty === o.id) ?? null
              const loads = picked ? Number(qty[picked.id]) || 0 : 0
              const photo = tile.options.map((o) => shop?.photos[o.id]).find(Boolean)
              return (
                <div
                  key={tile.key}
                  className={cn(
                    'col-span-2 flex min-w-0 flex-col gap-3 rounded-2xl border bg-card p-3 shadow-[0_4px_14px_rgba(10,36,39,0.06)] sm:col-span-3',
                    picked ? 'border-accent ring-1 ring-accent' : 'border-border',
                  )}
                >
                  <div className="flex items-center gap-3">
                    <MaterialPicture name={tile.name} category={tile.category} photo={photo} thumb />
                    <div className="min-w-0 flex-1">
                      <div className="break-words text-base font-bold leading-snug text-ink">{tile.name}</div>
                      <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-accent-bg px-2 py-0.5 text-[11px] font-semibold text-accent-text">
                        <Truck size={12} /> {t('sell.soldByLoad')}
                      </span>
                    </div>
                  </div>
                  <div role="radiogroup" aria-label={t('sell.chooseVehicle', { name: tile.name })} className="flex flex-col gap-2">
                    <div className="text-xs font-semibold text-ink">{t('sell.chooseVehicleShort')}</div>
                    {tile.options.map((o) => {
                      const on = picked?.id === o.id
                      const off = o.available === false
                      return (
                        <button
                          key={o.id}
                          type="button"
                          role="radio"
                          aria-checked={on}
                          disabled={off}
                          onClick={() => pickVehicle(tile.options, o)}
                          className={cn(
                            'flex min-h-12 items-center gap-3 rounded-xl border px-3 py-2 text-left transition-colors',
                            on ? 'border-accent bg-accent-bg' : 'border-border bg-card hover:bg-surface',
                            off && 'opacity-60',
                          )}
                        >
                          {/* A radio dot, so the choice reads as one of several. */}
                          <span
                            aria-hidden
                            className={cn(
                              'flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2',
                              on ? 'border-accent bg-accent text-white' : 'border-border',
                            )}
                          >
                            {on && <Check size={12} strokeWidth={3} />}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block text-sm font-semibold text-ink">{o.vehicle}</span>
                            <span className="block text-xs text-muted">
                              {t('sell.capacityPerLoad', { capacity: capacityText(o.capacity!, o.capacity_unit!) })}
                            </span>
                          </span>
                          <span className="shrink-0 text-right text-xs">
                            {off ? (
                              <span className="font-semibold text-muted">{t('sell.notAvailable')}</span>
                            ) : page.show_prices && o.price != null ? (
                              <span className="font-bold text-accent-text">{t('sell.perLoadPrice', { price: formatINR(o.price) })}</span>
                            ) : page.show_prices ? (
                              <span className="text-muted">{t('order.priceOnRequest')}</span>
                            ) : null}
                          </span>
                        </button>
                      )
                    })}
                  </div>
                  {picked && (
                    <div className="flex flex-col gap-2 rounded-xl border border-accent/30 bg-accent-bg/60 p-3">
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-xs font-semibold text-ink">{t('sell.numberOfLoads')}</span>
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            aria-label={t('order.less', { name: picked.name })}
                            onClick={() => step(picked, -1)}
                            className="flex h-11 w-10 shrink-0 items-center justify-center rounded-xl bg-card text-ink"
                          >
                            <Minus size={15} />
                          </button>
                          <input
                            type="text"
                            inputMode="numeric"
                            aria-label={t('sell.loadsOf', { name: picked.name })}
                            value={qty[picked.id] ?? ''}
                            onFocus={() => setEditingQty(picked.id)}
                            onBlur={() => setEditingQty((id) => (id === picked.id ? null : id))}
                            onChange={(e) => {
                              // Whole loads only, and no more than an order carries.
                              const next = sanitizeDigits(e.target.value).slice(0, 4)
                              setQty((prev) => ({ ...prev, [picked.id]: next }))
                              setError(null)
                            }}
                            className="h-11 w-14 rounded-xl border border-border bg-card text-center text-sm font-semibold text-ink outline-none focus:border-accent"
                          />
                          <button
                            type="button"
                            aria-label={t('order.more', { name: picked.name })}
                            onClick={() => step(picked, 1)}
                            className="flex h-11 w-10 shrink-0 items-center justify-center rounded-xl bg-accent text-white"
                          >
                            <Plus size={15} />
                          </button>
                        </div>
                      </div>
                      {loads > 0 && (
                        <dl className="flex flex-col gap-1 border-t border-border pt-2 text-xs">
                          <div className="flex justify-between gap-3">
                            <dt className="text-muted">{t('sell.selectedVehicle')}</dt>
                            <dd className="text-right font-medium text-ink">{vehicleOptionLabel(picked.vehicle!, picked.capacity!, picked.capacity_unit!)}</dd>
                          </div>
                          <div className="flex justify-between gap-3">
                            <dt className="text-muted">{t('sell.totalMaterial')}</dt>
                            <dd className="text-right font-semibold text-ink">
                              {t(loadsKey(loads), { count: loads })} × {capacityText(picked.capacity!, picked.capacity_unit!)} ={' '}
                              {totalMaterialText(loads, picked.capacity!, picked.capacity_unit!)}
                            </dd>
                          </div>
                          {page.show_prices && picked.price != null && (
                            <div className="flex justify-between gap-3">
                              <dt className="text-muted">{t('sell.materialSubtotal')}</dt>
                              <dd className="text-right font-semibold text-ink">{formatINR(loads * picked.price)}</dd>
                            </div>
                          )}
                          {picked.delivery_charge ? (
                            <div className="flex justify-between gap-3">
                              <dt className="text-muted">{t('sell.delivery')}</dt>
                              <dd className="text-right text-ink">{formatINR(loads * picked.delivery_charge)}</dd>
                            </div>
                          ) : null}
                        </dl>
                      )}
                    </div>
                  )}
                </div>
              )
            }
            const m = tile.m
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
                  'flex min-w-0 flex-col overflow-hidden rounded-2xl border bg-card shadow-[0_4px_14px_rgba(10,36,39,0.06)]',
                  inOrder ? 'border-accent ring-1 ring-accent' : 'border-border',
                )}
              >
                {/* The shop's own photo, or a calm panel with the material's
                    icon — tapping it, or the name, opens the material's sheet. */}
                <button type="button" onClick={() => setDetail(m)} aria-label={t('ccart.details', { name: m.name })} className="block w-full">
                  <MaterialPicture name={m.name} category={m.category} photo={shop?.photos[m.id]} />
                </button>
                <div className="flex min-w-0 flex-1 flex-col gap-1 p-3">
                  <button type="button" onClick={() => setDetail(m)} className="line-clamp-2 break-words text-left text-sm font-semibold leading-snug text-ink">{m.name}</button>
                  <div className="flex flex-wrap items-baseline gap-x-1">
                    {page.show_prices && m.price != null ? (
                      <>
                        <span className="text-base font-bold text-accent-text">{formatINR(m.price)}</span>
                        {m.unit && <span className="text-xs text-muted">/ {m.unit}</span>}
                      </>
                    ) : (
                      <span className="text-xs text-muted">{page.show_prices ? t('order.priceOnRequest') : m.unit}</span>
                    )}
                  </div>
                  {/* The shop's ordering rule, before it can be broken (050). */}
                  {(m.min_qty || m.qty_step) && (
                    <div className="text-[11px] text-muted">
                      {[
                        m.min_qty ? t('sell.minShort', { qty: `${Number(m.min_qty)} ${m.unit}`.trim() }) : null,
                        m.qty_step && Number(m.qty_step) !== 1 ? t('sell.stepShort', { qty: `${Number(m.qty_step)} ${m.unit}`.trim() }) : null,
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </div>
                  )}
                  {Number(value) > 0 && quantityProblem(m, Number(value)) && (
                    <div role="alert" className="text-[11px] font-medium text-red-600">{t('order.qtyRule')}</div>
                  )}
                </div>
                <div className="px-3 pb-3">
                {m.available === false ? (
                  <div className="flex h-11 items-center justify-center rounded-xl bg-surface text-xs font-semibold text-muted">
                    {t('sell.notAvailable')}
                  </div>
                ) : inOrder ? (
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      aria-label={t('order.less', { name: m.name })}
                      onClick={() => step(m, -1)}
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
                      onClick={() => step(m, 1)}
                      className="flex h-11 w-9 shrink-0 items-center justify-center rounded-xl bg-accent text-white"
                    >
                      <Plus size={15} />
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    aria-label={t('order.more', { name: m.name })}
                    onClick={() => step(m, 1)}
                    className="flex h-11 w-full items-center justify-center gap-1.5 rounded-xl bg-accent text-sm font-semibold text-white shadow-sm active:opacity-90"
                  >
                    <Plus size={16} /> {t('order.add')}
                  </button>
                )}
                </div>
              </div>
            )
          })}
        </div>

          {shop && <ShopAbout shop={shop} showContact={false} />}
          </>
        )}

        {view === 'orders' && <ShopOrdersView link={link} onBrowse={() => go('home')} />}

        {view === 'profile' && (
          <CustomerMeView
            shopName={page.business_name}
            name={knownName}
            phone={form.phone || null}
            site={form.site.trim() || null}
            onChangeDetails={canChange ? () => setChanging(true) : undefined}
            khata={account ? { onClick: () => openAccount('') } : khata ? { to: `/khata/${khata.code}` } : null}
            shopPhone={page.phone}
            onShare={() => setSharingShop(true)}
            onForget={
              account
                ? undefined
                : () => {
                    // This shop's links, orders and the details typed here,
                    // gone from this phone. Nothing on the server changes.
                    forgetShopOnPhone(link)
                    clearProfile()
                    setProfile(null)
                    setLast(null)
                    setQty({})
                    setForm((f) => ({ ...f, name: '', phone: '', site: '', note: '', date: '' }))
                    setSearchParams({}, { replace: true })
                    window.location.reload()
                  }
            }
          />
        )}

        {/* The cart: what has been added, in words and in rupees, then who it is for. */}
        {view === 'cart' && (
        <div ref={summaryRef} className="flex flex-col gap-4">
          <div className="flex items-baseline justify-between gap-3 px-1">
            <h1 className="text-xl font-bold text-ink">{t('ccart.title')}</h1>
            {chosen.length > 0 && <span className="text-xs text-muted">{t('order.itemCount', { count: chosen.length })}</span>}
          </div>
          {chosen.length === 0 && (
            <SoftCard className="flex flex-col items-center gap-3 p-6 text-center">
              <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-accent-bg text-accent-text">
                <ShoppingBag size={26} />
              </span>
              <div className="text-base font-semibold text-ink">{t('ccart.emptyTitle')}</div>
              <p className="text-sm text-muted">{t('ccart.emptyBody')}</p>
              <button
                type="button"
                onClick={() => go('home')}
                className="mt-1 inline-flex h-11 items-center gap-2 rounded-xl bg-accent px-5 text-sm font-semibold text-white"
              >
                {t('corder.browse')}
              </button>
            </SoftCard>
          )}
          {chosen.length > 0 && (
            <>
              <SectionHeading title={t('order.summaryTitle')} />
              <SoftCard className="p-4">
                <ul className="flex flex-col divide-y divide-border">
                  {chosen.map((c) => (
                    <li key={c.material.id} className="flex flex-col gap-2 py-3 first:pt-0 last:pb-0">
                      <div className="flex items-start justify-between gap-3">
                        <OrderLine line={c} showPrice={page.show_prices} />
                        {page.show_prices && c.material.price != null && (
                          <span className="shrink-0 text-sm font-semibold text-ink">{formatINR(c.qty * c.material.price)}</span>
                        )}
                      </div>
                      {/* Change it here: the same steps as on the card. */}
                      <div className="flex items-center gap-2">
                        <div className="flex items-center gap-1 rounded-xl bg-surface p-1">
                          <button
                            type="button"
                            aria-label={t('order.less', { name: c.material.name })}
                            onClick={() => step(c.material, -1)}
                            className="flex h-10 w-10 items-center justify-center rounded-lg bg-card text-ink"
                          >
                            <Minus size={15} />
                          </button>
                          <span className="min-w-12 px-1 text-center text-sm font-semibold text-ink">
                            {isVehicleOption(c.material) ? t(loadsKey(c.qty), { count: c.qty }) : `${c.qty} ${c.material.unit}`.trim()}
                          </span>
                          <button
                            type="button"
                            aria-label={t('order.more', { name: c.material.name })}
                            onClick={() => step(c.material, 1)}
                            className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent text-white"
                          >
                            <Plus size={15} />
                          </button>
                        </div>
                        {isVehicleOption(c.material) && (
                          <button type="button" onClick={() => go('home')} className="inline-flex min-h-10 items-center text-xs font-semibold text-accent">
                            {t('ccart.changeVehicle')}
                          </button>
                        )}
                        <button
                          type="button"
                          aria-label={t('ccart.remove', { name: c.material.name })}
                          onClick={() => setQty((prev) => ({ ...prev, [c.material.id]: '' }))}
                          className="ml-auto flex h-10 w-10 items-center justify-center rounded-lg text-muted hover:text-red-600"
                        >
                          <Trash2 size={17} />
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
                {/* Material and delivery apart, so neither hides in the other. */}
                {materialTotal != null && deliveryTotal > 0 && (
                  <dl className="mt-3 flex flex-col gap-1 border-t border-border pt-3 text-sm">
                    <div className="flex justify-between gap-3">
                      <dt className="text-muted">{t('sell.materialSubtotal')}</dt>
                      <dd className="font-semibold text-ink">{formatINR(materialTotal)}</dd>
                    </div>
                    <div className="flex justify-between gap-3">
                      <dt className="text-muted">{t('sell.delivery')}</dt>
                      <dd className="font-semibold text-ink">{formatINR(deliveryTotal)}</dd>
                    </div>
                  </dl>
                )}
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

          {chosen.length > 0 && (
          <>
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
          </>
          )}
        </div>
        )}

        <BuildSupplyFooter />
      </main>

      <ShopAppBar
        left={[
          { key: 'home', icon: House, label: t('khata.tabHome'), active: view === 'home', onClick: () => go('home') },
          { key: 'orders', icon: Package, label: t('khata.tabOrders'), active: view === 'orders', onClick: () => go('orders') },
        ]}
        cart={{ label: t('ccart.title'), count: chosenCount, active: view === 'cart', onClick: () => go('cart') }}
        right={[
          ...(account
            ? [{ key: 'khata', icon: BookOpen, label: t('khata.tabBills'), onClick: () => openAccount('') }]
            : khata
              ? [{ key: 'khata', icon: BookOpen, label: t('khata.tabBills'), onClick: () => navigate(`/khata/${khata.code}`) }]
              : page.phone
                ? [{ key: 'call', icon: Phone, label: t('khata.call'), onClick: () => window.location.assign(`tel:${page.phone}`) }]
                : []),
          { key: 'profile', icon: UserRound, label: t('cme.tab'), active: view === 'profile', onClick: () => go('profile') },
        ]}
      />

      {/* A material's own sheet: the picture large, its price, rules and a way to add it. */}
      {detail && (
        <Modal title={detail.name} onClose={() => setDetail(null)}>
          <div className="flex flex-col gap-3">
            <div className="overflow-hidden rounded-2xl border border-border">
              <MaterialPicture name={detail.name} category={detail.category} photo={shop?.photos[detail.id]} />
            </div>
            {detail.category && <div className="text-xs font-medium text-muted">{detail.category}</div>}
            <div className="flex flex-wrap items-baseline gap-x-1">
              {page.show_prices && detail.price != null ? (
                <>
                  <span className="text-2xl font-bold text-accent-text">{formatINR(detail.price)}</span>
                  {detail.unit && <span className="text-sm text-muted">/ {detail.unit}</span>}
                </>
              ) : (
                <span className="text-sm text-muted">{page.show_prices ? t('order.priceOnRequest') : detail.unit}</span>
              )}
            </div>
            {(detail.min_qty || detail.qty_step) && (
              <p className="text-xs text-muted">
                {[
                  detail.min_qty ? t('sell.minShort', { qty: `${Number(detail.min_qty)} ${detail.unit}`.trim() }) : null,
                  detail.qty_step && Number(detail.qty_step) !== 1 ? t('sell.stepShort', { qty: `${Number(detail.qty_step)} ${detail.unit}`.trim() }) : null,
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </p>
            )}
            {detail.delivery_charge ? (
              <p className="text-xs text-muted">{t('ccart.deliveryNote', { price: formatINR(detail.delivery_charge) })}</p>
            ) : null}
            {page.show_prices && <p className="text-xs text-muted">{t('order.estimatedNote')}</p>}
            {detail.available === false ? (
              <div className="flex h-12 items-center justify-center rounded-xl bg-surface text-sm font-semibold text-muted">{t('sell.notAvailable')}</div>
            ) : Number(qty[detail.id]) > 0 ? (
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-1 rounded-xl bg-surface p-1">
                  <button type="button" aria-label={t('order.less', { name: detail.name })} onClick={() => step(detail, -1)} className="flex h-11 w-11 items-center justify-center rounded-lg bg-card text-ink">
                    <Minus size={16} />
                  </button>
                  <span className="min-w-14 text-center text-base font-bold text-ink">{`${Number(qty[detail.id])} ${detail.unit}`.trim()}</span>
                  <button type="button" aria-label={t('order.more', { name: detail.name })} onClick={() => step(detail, 1)} className="flex h-11 w-11 items-center justify-center rounded-lg bg-accent text-white">
                    <Plus size={16} />
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    // The sheet takes its history entry back off first (it
                    // checks the path, which ?v= does not change); only then
                    // the cart, or that step back would undo it. Phase 14 B1.
                    setDetail(null)
                    let done = false
                    const open = () => {
                      if (done) return
                      done = true
                      window.removeEventListener('popstate', open)
                      go('cart')
                    }
                    window.addEventListener('popstate', open)
                    window.setTimeout(open, 400)
                  }}
                  className="flex h-12 flex-1 items-center justify-center gap-2 rounded-xl border border-accent text-sm font-semibold text-accent"
                >
                  <ShoppingBag size={16} /> {t('ccart.goToCart')}
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => step(detail, 1)}
                className="flex h-12 items-center justify-center gap-2 rounded-xl bg-accent text-sm font-semibold text-white"
              >
                <Plus size={17} /> {t('ccart.addToCart')}
              </button>
            )}
          </div>
        </Modal>
      )}

      {ownerPreview && shop?.owner_photo_url && (
        <ImagePreview src={shop.owner_photo_url} alt={t('shop.ownerPhoto')} onClose={() => setOwnerPreview(false)} />
      )}
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
