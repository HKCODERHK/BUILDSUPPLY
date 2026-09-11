import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Minus, Plus, Search } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { PhoneInput } from '@/components/ui/phone-input'
import { LanguageToggle } from '@/components/LanguageToggle'
import { SuccessHeader } from '@/components/SuccessTick'
import { TruckLoader } from '@/components/TruckLoader'
import { useLanguage } from '@/context/LanguageContext'
import type { TranslationKey } from '@/lib/i18n'
import { sanitizeDecimal } from '@/lib/numberInput'
import { newRequestId } from '@/services/db'
import { getOrderPage, orderStatusUrl, placeOrder, type OrderPage as OrderPageData } from '@/services/orders'

function formatINR(n: number) {
  return `₹${n.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`
}

function localIsoDate(offsetDays: number) {
  const d = new Date()
  d.setDate(d.getDate() + offsetDays)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// The customer's own recent orders from this supplier, kept on their phone
// only, so the status link is never lost after they close the page.
type RecentOrder = { token: string; at: string }
const recentKey = (link: string) => `buildsupply-orders:${link}`
function readRecent(link: string): RecentOrder[] {
  try {
    const list = JSON.parse(localStorage.getItem(recentKey(link)) ?? '[]')
    return Array.isArray(list) ? list.slice(0, 5) : []
  } catch {
    return []
  }
}
function rememberOrder(link: string, token: string): RecentOrder[] {
  const list = [{ token, at: new Date().toISOString() }, ...readRecent(link).filter((r) => r.token !== token)].slice(0, 5)
  try {
    localStorage.setItem(recentKey(link), JSON.stringify(list))
  } catch {
    // Storage blocked: the status link is still on screen to copy.
  }
  return list
}

// The server writes its refusals in English; show the customer's language.
function errorKey(message: string): TranslationKey {
  if (/unavailable/i.test(message)) return 'order.unavailable'
  if (/10-digit/i.test(message)) return 'order.phoneInvalid'
  if (/your name/i.test(message)) return 'order.nameInvalid'
  if (/delivery date/i.test(message)) return 'order.dateInvalid'
  if (/at least one material/i.test(message)) return 'order.pickSomething'
  if (/already have orders waiting/i.test(message)) return 'order.tooManyWaiting'
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
  const [page, setPage] = useState<OrderPageData | null>(null)
  const [loadFailed, setLoadFailed] = useState(false)
  const [qty, setQty] = useState<Record<string, string>>({})
  const [query, setQuery] = useState('')
  const [form, setForm] = useState({ name: '', phone: '', site: '', date: '', note: '', trap: '' })
  const [sending, setSending] = useState(false)
  const sendingRef = useRef(false)
  // One id per order: a double tap or a retry returns the same order.
  const requestId = useRef(newRequestId())
  const [error, setError] = useState<string | null>(null)
  // undefined: not sent yet. A string: the status code. null: nothing to show.
  const [sentToken, setSentToken] = useState<string | null | undefined>(undefined)
  const [copied, setCopied] = useState(false)
  const [recent, setRecent] = useState<RecentOrder[]>(() => readRecent(link))

  useEffect(() => {
    getOrderPage(link)
      .then(setPage)
      .catch(() => setLoadFailed(true))
  }, [link])

  const open = page && page.found && page.open ? page : null
  const materials = open?.materials ?? []
  const showSearch = materials.length > 8
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    return q ? materials.filter((m) => m.name.toLowerCase().includes(q) || (m.category ?? '').toLowerCase().includes(q)) : materials
  }, [materials, query])

  const chosen = materials
    .map((m) => ({ material: m, qty: Number(qty[m.id]) || 0 }))
    .filter((c) => c.qty > 0)
  const estimatedTotal =
    open?.show_prices && chosen.length > 0 && chosen.every((c) => c.material.price != null)
      ? chosen.reduce((sum, c) => sum + c.qty * (c.material.price ?? 0), 0)
      : null

  function step(id: string, delta: number) {
    setQty((prev) => {
      const next = Math.max(0, (Number(prev[id]) || 0) + delta)
      return { ...prev, [id]: next ? String(next) : '' }
    })
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
      })
      if (result.token) setRecent(rememberOrder(link, result.token))
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
    <header className="bg-shell px-4 pb-4 pt-[calc(1rem_+_var(--safe-top))] text-white">
      <div className="mx-auto flex max-w-lg items-center gap-3">
        {open?.logo_url ? (
          <img src={open.logo_url} alt="" className="h-11 w-11 shrink-0 rounded-xl bg-white object-cover" />
        ) : null}
        <div className="min-w-0 flex-1">
          <div className="truncate text-lg font-bold">{open?.business_name ?? 'BuildSupply'}</div>
          <div className="text-xs text-sidebar-text">{t('order.title')}</div>
        </div>
        <LanguageToggle className="border-white/20 text-white hover:bg-white/10 hover:text-white" />
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
          <Card className="flex flex-col gap-4">
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
          </Card>
        </main>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-surface">
      {header}
      <main className="mx-auto flex max-w-lg flex-col gap-4 p-4 pb-10">
        <p className="text-sm text-muted">{t('order.intro', { business: page.business_name })}</p>
        {page.show_prices && (
          <p className="rounded-lg bg-amber-50 p-3 text-xs font-medium text-amber-800 dark:bg-amber-950 dark:text-amber-200">
            {t('order.pricesNote')}
          </p>
        )}

        {recent.length > 0 && (
          <Card className="flex flex-col gap-2">
            <div className="text-sm font-semibold text-ink">{t('order.recent')}</div>
            {recent.map((r) => (
              <Link key={r.token} to={`/order-status/${r.token}`} className="text-sm font-medium text-accent">
                {new Date(r.at).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })} →
              </Link>
            ))}
          </Card>
        )}

        <Card className="flex flex-col gap-3 p-4">
          {showSearch && (
            <div className="relative">
              <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
              <Input placeholder={t('order.search')} value={query} onChange={(e) => setQuery(e.target.value)} className="pl-9" />
            </div>
          )}
          {materials.length === 0 && <p className="text-sm text-muted">{t('order.noMaterials')}</p>}
          <div className="flex flex-col divide-y divide-border">
            {visible.map((m) => {
              const value = qty[m.id] ?? ''
              return (
                <div key={m.id} className="flex items-center gap-3 py-3">
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium text-ink">{m.name}</div>
                    <div className="text-xs text-muted">
                      {page.show_prices
                        ? m.price != null
                          ? `${formatINR(m.price)}${m.unit ? ` / ${m.unit}` : ''}`
                          : t('order.priceOnRequest')
                        : m.unit}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <button
                      type="button"
                      aria-label={t('order.less', { name: m.name })}
                      onClick={() => step(m.id, -1)}
                      disabled={!Number(value)}
                      className="flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-card text-ink disabled:opacity-40"
                    >
                      <Minus size={15} />
                    </button>
                    <input
                      type="text"
                      inputMode="decimal"
                      aria-label={t('order.qtyOf', { name: m.name })}
                      placeholder="0"
                      value={value}
                      onChange={(e) => {
                        setQty((prev) => ({ ...prev, [m.id]: sanitizeDecimal(e.target.value).slice(0, 8) }))
                        setError(null)
                      }}
                      className="h-9 w-16 rounded-lg border border-border bg-card text-center text-sm text-ink outline-none focus:border-accent"
                    />
                    <button
                      type="button"
                      aria-label={t('order.more', { name: m.name })}
                      onClick={() => step(m.id, 1)}
                      className="flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-card text-accent"
                    >
                      <Plus size={15} />
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        </Card>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <Card className="flex flex-col gap-4">
            <div className="text-sm font-semibold text-ink">
              {chosen.length > 0 ? t('order.selectedCount', { count: chosen.length }) : t('order.yourDetails')}
              {estimatedTotal != null && (
                <span className="block text-xs font-normal text-muted">
                  {t('order.estimatedTotal', { amount: formatINR(estimatedTotal) })}
                </span>
              )}
            </div>
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
            {error && (
              <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">{error}</p>
            )}
            <Button type="submit" disabled={sending} className="w-full">
              {sending ? t('order.placing') : t('order.place')}
            </Button>
          </Card>
        </form>
      </main>
    </div>
  )
}
