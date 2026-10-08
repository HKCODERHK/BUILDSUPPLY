import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
  BookOpen,
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
} from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { PhoneInput } from '@/components/ui/phone-input'
import { ThemeToggle } from '@/components/ThemeToggle'
import { LanguageToggle } from '@/components/LanguageToggle'
import { CustomerAvatar } from '@/components/CustomerAvatar'
import { SuccessHeader } from '@/components/SuccessTick'
import { TruckLoader } from '@/components/TruckLoader'
import { useLanguage } from '@/context/LanguageContext'
import type { TranslationKey } from '@/lib/i18n'
import { sanitizeDecimal } from '@/lib/numberInput'
import { newRequestId } from '@/services/db'
import { getOrderPage, orderStatusUrl, placeOrder, type OrderPage as OrderPageData } from '@/services/orders'
import { OrderLinkShareModal } from '@/components/OrderLinkShareModal'
import { readKhata, rememberOrder, type KhataLink } from '@/lib/customerLinks'
import { CustomerTabBar, QuickActions, SectionHeading, SoftCard, type QuickAction } from '@/components/CustomerHome'
import { TINTS, greetingKey, tintFor } from '@/lib/customerHome'
import { cn } from '@/lib/utils'

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
    const value = JSON.parse(localStorage.getItem(lastKey(link)) ?? 'null')
    return value && Array.isArray(value.items) ? (value as LastOrder) : null
  } catch {
    return null
  }
}
function rememberLast(link: string, last: LastOrder) {
  try {
    localStorage.setItem(lastKey(link), JSON.stringify(last))
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
function samePerson(khata: KhataLink | null, previous: LastOrder | null) {
  if (!khata?.name || !previous?.name) return true
  return khata.name.trim().toLowerCase() === previous.name.trim().toLowerCase()
}

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
  const [form, setForm] = useState(() => {
    const previous = readLast(link)
    const mine = khata
    // Who this phone is, to this shop: the khata's own customer when there is
    // one — that is the shop's own record — and otherwise whoever sent the
    // last order. Taking the name from one and the account from the other is
    // exactly how the card once showed one customer's name over another's
    // khata. The site stays the last order's: it is where the load goes, not
    // who is asking.
    return {
      name: mine?.name ?? previous?.name ?? '',
      phone: mine?.phone ?? previous?.phone ?? '',
      // The last order's site only if the same person sent it — otherwise it
      // is somebody else's site on this phone.
      site: (samePerson(mine, previous) ? previous?.site : null) || mine?.site || '',
      date: '',
      note: '',
      trap: '',
    }
  })
  const [last, setLast] = useState<LastOrder | null>(() => readLast(link))
  // Cash unless the customer says otherwise — which is nearly every order.
  const [payment, setPayment] = useState<'cash' | 'online'>('cash')
  const summaryRef = useRef<HTMLDivElement>(null)
  const [sharingShop, setSharingShop] = useState(false)
  const [sending, setSending] = useState(false)
  const sendingRef = useRef(false)
  // One id per order: a double tap or a retry returns the same order.
  const requestId = useRef(newRequestId())
  const [error, setError] = useState<string | null>(null)
  // undefined: not sent yet. A string: the status code. null: nothing to show.
  const [sentToken, setSentToken] = useState<string | null | undefined>(undefined)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    getOrderPage(link)
      .then(setPage)
      .catch(() => setLoadFailed(true))
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
  const lastAvailable = last && samePerson(khata, last) ? last.items.filter((it) => materials.some((m) => m.id === it.material_id)) : []

  function step(id: string, delta: number) {
    setQty((prev) => {
      const next = Math.max(0, (Number(prev[id]) || 0) + delta)
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
    if (form.name.trim().length < 2) return setError(t('order.nameInvalid'))
    if (form.phone.length !== 10) return setError(t('order.phoneInvalid'))
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
      setError(t(errorKey(err instanceof Error ? err.message : '')))
    } finally {
      sendingRef.current = false
      setSending(false)
    }
  }

  function startAgain() {
    setQty({})
    setForm((f) => ({ ...f, date: '', note: '', trap: '' }))
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

  const header = (
    <header className="sticky top-0 z-30 bg-shell px-4 pb-3 pt-[calc(0.75rem_+_var(--safe-top))] text-white">
      <div className="mx-auto flex h-11 max-w-lg items-center gap-3">
        {/* The platform's name, as on the khata link — the shop has its own
            card on the page, so the bar no longer repeats it cut short. */}
        <svg
          width="22"
          height="22"
          viewBox="0 0 24 24"
          fill="none"
          stroke="#35A85D"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="shrink-0"
        >
          <path d="M3 21h18" />
          <path d="M5 21V8l5-4v17" />
          <path d="M10 21V11l6 3v7" />
          <path d="M16 21v-4l3 1.5V21" />
        </svg>
        <span className="min-w-0 flex-1 truncate text-lg font-bold">BuildSupply</span>
        <div className="flex shrink-0 items-center gap-2">
          <LanguageToggle className="border-white/20 text-white hover:bg-white/10 hover:text-white" />
          <ThemeToggle className="border-white/20 text-white hover:bg-white/10 hover:text-white" />
        </div>
      </div>
    </header>
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
      <div className="min-h-screen bg-surface">
        {header}
        <main className="mx-auto max-w-lg p-4">
          <Card className="text-center text-sm text-ink">{message}</Card>
        </main>
      </div>
    )
  }

  if (sentToken !== undefined) {
    return (
      <div className="min-h-screen bg-surface">
        {header}
        <main className="mx-auto flex max-w-lg flex-col gap-4 p-4">
          <SoftCard className="flex flex-col gap-4 p-5">
            <SuccessHeader title={t('order.sentTitle')} />
            <p className="text-sm text-ink">{t('order.sentBody', { business: page.business_name })}</p>
            {sentToken && (
              <div className="rounded-lg bg-surface p-3">
                <p className="mb-2 text-xs text-muted">{t('order.keepLink')}</p>
                <p className="break-all text-xs font-medium text-ink">{orderStatusUrl(sentToken)}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button size="sm" variant="outline" onClick={() => copyStatusLink(sentToken)}>
                    {copied ? t('order.copied') : t('order.copyLink')}
                  </Button>
                  <Link to={`/order-status/${sentToken}`}>
                    <Button size="sm">{t('order.viewStatus')}</Button>
                  </Link>
                </div>
              </div>
            )}
            <Button variant="outline" onClick={startAgain}>
              {t('order.another')}
            </Button>
          </SoftCard>
        </main>
      </div>
    )
  }

  // Who this phone is to this shop, for the greeting: the khata's own
  // customer, or whoever sent the last order. Nobody known: no greeting.
  const knownName = khata?.name ?? last?.name ?? null
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
    ...(lastAvailable.length > 0 ? [{ key: 'again', icon: RotateCcw, label: t('order.tileAgain'), onClick: fillLast }] : []),
    ...(khata ? [{ key: 'khata', icon: BookOpen, label: t('order.tileKhata'), to: `/khata/${khata.code}` }] : []),
    { key: 'share', icon: Share2, label: t('khata.tileShare'), onClick: () => setSharingShop(true) },
  ]
  // The same tabs as the khata link's, once this phone knows the customer's
  // khata — the two pages are one app to them. A first-time visitor has no
  // account to switch to, so no tab bar, only the order.
  const tabs = khata
    ? [
        { key: 'home', icon: House, label: t('khata.tabHome'), active: false, onClick: () => navigate(`/khata/${khata.code}`) },
        { key: 'materials', icon: ShoppingBag, label: t('khata.tabMaterials'), active: true, onClick: () => window.scrollTo({ top: 0, behavior: 'smooth' }) },
        { key: 'bills', icon: Receipt, label: t('khata.tabBills'), active: false, onClick: () => navigate(`/khata/${khata.code}?s=bills`) },
        { key: 'orders', icon: Package, label: t('khata.tabOrders'), active: false, onClick: () => navigate(`/khata/${khata.code}?s=orders`) },
      ]
    : null
  const chosenCount = chosen.length

  return (
    <div className="min-h-screen bg-surface">
      {header}
      <main className={cn('mx-auto flex max-w-lg flex-col gap-4 p-4', tabs ? 'pb-44' : 'pb-28')}>
        {knownName && (
          <div className="flex items-center gap-3 pt-1">
            <CustomerAvatar id={khata?.code ?? link} name={knownName} size={44} />
            <div className="min-w-0 flex-1">
              <div className="text-xs text-muted">{t(greetingKey())}</div>
              <div className="line-clamp-2 break-words text-lg font-bold leading-tight text-ink">
                {t('khata.hello', { name: knownName })}
              </div>
            </div>
          </div>
        )}

        {/* The shop: who, where, and its phone on the round button. */}
        <SoftCard className="flex items-center gap-3 p-4">
          {page.logo_url ? (
            <img src={page.logo_url} alt="" className="h-14 w-14 shrink-0 rounded-2xl bg-white object-cover" />
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

        <QuickActions actions={quickActions} />

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
            const inOrder = Number(value) > 0
            return (
              <div
                key={m.id}
                className={cn(
                  'flex min-w-0 flex-col gap-2 rounded-2xl border bg-card p-3 shadow-[0_2px_10px_rgba(10,36,39,0.04)]',
                  inOrder ? 'border-accent' : 'border-border',
                )}
              >
                <span className={cn('flex h-10 w-10 items-center justify-center rounded-xl', TINTS[tintFor(m.category ?? m.name)])}>
                  <Package size={19} strokeWidth={1.9} />
                </span>
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
                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-surface text-ink"
                    >
                      <Minus size={15} />
                    </button>
                    <input
                      type="text"
                      inputMode="decimal"
                      aria-label={t('order.qtyOf', { name: m.name })}
                      value={value}
                      onChange={(e) => {
                        setQty((prev) => ({ ...prev, [m.id]: sanitizeDecimal(e.target.value).slice(0, 8) }))
                        setError(null)
                      }}
                      className="h-9 w-full min-w-0 rounded-xl border border-border bg-card text-center text-sm font-semibold text-ink outline-none focus:border-accent"
                    />
                    <button
                      type="button"
                      aria-label={t('order.more', { name: m.name })}
                      onClick={() => step(m.id, 1)}
                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-accent text-white"
                    >
                      <Plus size={15} />
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    aria-label={t('order.more', { name: m.name })}
                    onClick={() => step(m.id, 1)}
                    className="flex h-9 items-center justify-center gap-1.5 rounded-xl bg-accent-bg text-sm font-semibold text-accent-text"
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
              <div>
                <Label htmlFor="order-name" required>{t('order.name')}</Label>
                <Input id="order-name" autoComplete="name" value={form.name} maxLength={60} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              </div>
              <div>
                <Label htmlFor="order-phone" required>{t('order.phone')}</Label>
                <PhoneInput id="order-phone" value={form.phone} onValueChange={(phone) => setForm({ ...form, phone })} />
              </div>
              <div>
                <Label htmlFor="order-site">{t('order.site')}</Label>
                <Input id="order-site" value={form.site} maxLength={120} onChange={(e) => setForm({ ...form, site: e.target.value })} />
              </div>
              <div>
                <Label htmlFor="order-date">{t('order.date')}</Label>
                <Input
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
                  <Label>{t('order.payHow')}</Label>
                  <div className="mt-1 grid grid-cols-2 gap-2">
                    {(['cash', 'online'] as const).map((mode) => (
                      <button
                        key={mode}
                        type="button"
                        onClick={() => setPayment(mode)}
                        className={`rounded-xl border px-3 py-2.5 text-sm font-medium ${
                          payment === mode ? 'border-accent bg-accent-bg text-accent-text' : 'border-border text-muted'
                        }`}
                      >
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
              {error && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">{error}</p>}
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
            </form>
          </SoftCard>
        </div>
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
