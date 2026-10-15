import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { BookOpen, Check, House, MessageCircle, Package, Phone, Receipt, ShoppingBag } from 'lucide-react'
import { readKhata, rememberOrder } from '@/lib/customerLinks'
import { readProfile } from '@/lib/customerProfile'
import type { TranslationKey } from '@/lib/i18n'
import { Button } from '@/components/ui/button'
import {
  CustomerHeader,
  CustomerTabBar,
  DeliveryStrip,
  QuickActions,
  SectionHeading,
  SoftCard,
  type QuickAction,
} from '@/components/CustomerHome'
import { myShops, rememberCurrentShop, type MyShop } from '@/services/customerAccount'
import { getShopProfile, type ShopProfile } from '@/services/shopPage'
import { brandAttr, shopWhatsapp } from '@/lib/shopPage'
import { TruckLoader } from '@/components/TruckLoader'
import { useLanguage } from '@/context/LanguageContext'
import { getOrderStatus, respondToEstimate, type OrderStatusView } from '@/services/orders'
import { rejectReasonText } from '@/lib/orderFormat'
import { receivedState } from '@/lib/received'
import { QrCode } from '@/components/QrCode'
import { upiPayUrl } from '@/lib/upi'
import { cn } from '@/lib/utils'
import { BuildSupplyFooter } from '@/components/BuildSupplyFooter'

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
}

function formatINR(n: number) {
  return `₹${Number(n).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`
}

/**
 * /order-status/<code> — the link a customer got when they placed an order.
 * The code is random (migration 026); this shows the status, the items, the
 * dates, the reason if it was rejected (027), and once approved the estimate
 * made from it, with Accept or Please call me (030). Never the phone number
 * or the customer's note. An answer bills nothing: the supplier converts the
 * estimate as always.
 */
export default function OrderStatus() {
  const { token = '' } = useParams()
  const { t } = useLanguage()
  const navigate = useNavigate()
  const [view, setView] = useState<OrderStatusView | null>(null)
  const [failed, setFailed] = useState(false)
  const [answering, setAnswering] = useState<'accepted' | 'call_me' | null>(null)
  const [answerFailed, setAnswerFailed] = useState<TranslationKey | null>(null)
  // Their khata code with this shop, if this phone has ever opened it
  // (lib/customerLinks — kept on the phone, never on the server).
  const [khataCode, setKhataCode] = useState<string | null>(null)
  // The customer's own account (migration 041), when this shop is on it.
  const [account, setAccount] = useState<MyShop | null>(null)
  // The shop's own colour and WhatsApp (migration 042), through its order link.
  const [shop, setShop] = useState<ShopProfile | null>(null)

  useEffect(() => {
    getOrderStatus(token)
      .then((v) => {
        setView(v)
        // Opened from WhatsApp, say: the supplier's order page lists it under
        // this customer's recent orders from now on (on this phone only).
        if (v.found && v.order_link) {
          const link = v.order_link
          rememberOrder(link, token, v.created_at)
          setKhataCode(readKhata(link)?.code ?? null)
          getShopProfile({ link }).then(setShop)
          myShops()
            .then((shops) => setAccount(shops.find((s) => s.order_link === link) ?? null))
            .catch(() => {
              // No account on this phone: the page is the public one.
            })
        }
      })
      .catch(() => setFailed(true))
  }, [token])

  const found = view && view.found ? view : null
  const tone = found?.status === 'approved' ? 'success' : found?.status === 'rejected' ? 'neutral' : 'warning'
  const estimate = found?.status === 'approved' ? (found.estimate ?? null) : null
  const statusKey = found?.status === 'approved' && !found.estimate ? 'accepted' : (found?.status ?? 'pending')
  // The shop's own UPI ID, sent only to a customer who chose to pay online and
  // only while something is owed (migration 037). The amount is the bill's
  // outstanding once a bill exists, the estimate's total until then.
  // The note is what the shop reads in its bank app to know who paid (#7):
  // the customer's own name as this phone knows it, and the bill or estimate
  // number. It used to carry the shop's own name, which told the shop nothing.
  const payerName = (found?.order_link ? readKhata(found.order_link)?.name : null) || readProfile()?.name || ''
  const payFor = found?.bill?.invoice_no ?? found?.estimate?.quote_no ?? ''
  const upiUrl =
    found?.upi_id && (found.due ?? 0) > 0.005
      ? upiPayUrl({
          upiId: found.upi_id,
          payee: found.business_name,
          amount: Math.round((found.due ?? 0) * 100) / 100,
          note: [payerName, payFor].filter(Boolean).join(' ') || found.business_name,
        })
      : null

  // The order's progress, ticked as it happens (migration 031): sent →
  // estimate ready → accepted → bill made → delivered → received. Nothing to
  // track once an order is rejected — the reason above says it all. A bill
  // made straight from the estimate counts as accepted.
  const bill = found?.bill ?? null
  // Only a live bill counts (#10): a converted estimate whose bill was
  // cancelled is not billed, and is not owed either (047).
  const billed = !!bill
  const steps =
    found && found.status !== 'rejected'
      ? [
          { key: 'sent', label: t('tl.sent'), detail: formatDate(found.created_at), done: true },
          {
            key: 'estimate',
            label: t('tl.estimate'),
            // Ticked only when there really is an estimate (#1): since 037 the
            // shop can say yes on the spot and price it later, and the title
            // then reads "Order accepted — the price is on its way".
            detail: found.status === 'approved' && found.estimate && found.decided_at ? formatDate(found.decided_at) : null,
            done: found.status === 'approved' && !!found.estimate,
          },
          {
            key: 'accepted',
            label: t('tl.accepted'),
            detail:
              found.response === 'accepted' && found.responded_at
                ? formatDate(found.responded_at)
                : found.response === 'call_me' && !billed
                  ? t('tl.callAsked')
                  : null,
            done: found.response === 'accepted' || billed,
          },
          {
            key: 'bill',
            label: t('tl.bill'),
            detail: bill ? t('tl.billDetail', { no: bill.invoice_no, date: formatDate(bill.created_at) }) : null,
            done: billed,
          },
          { key: 'delivered', label: t('tl.delivered'), detail: null, done: !!bill && (bill.delivered || !!bill.received_at) },
          {
            key: 'received',
            // Their own tap, or — a day after delivery with nothing said —
            // taken as received, which the line underneath says plainly.
            label: t('tl.received'),
            detail: bill?.received_at
              ? formatDate(bill.received_at)
              : bill && receivedState(bill) === 'assumed'
                ? t('tl.receivedAssumed')
                : null,
            done: !!bill && receivedState(bill) !== 'none' && receivedState(bill) !== 'waiting',
          },
        ]
      : null

  async function answer(response: 'accepted' | 'call_me') {
    if (answering) return
    setAnswering(response)
    setAnswerFailed(null)
    try {
      await respondToEstimate(token, response)
    } catch (e) {
      // The shop may have billed the estimate meanwhile: say so, rather than
      // "something went wrong" over buttons that can never work (#29).
      setAnswerFailed(/no longer be changed/i.test(e instanceof Error ? e.message : '') ? 'est.noLongerOpen' : 'error.generic')
    }
    // Either way, show the order as it stands now.
    try {
      setView(await getOrderStatus(token))
    } catch {
      // Keep what is on screen.
    } finally {
      setAnswering(null)
    }
  }

  // Where this customer's account lives on this phone: their own BuildSupply
  // (/me) if the shop is on it, otherwise the khata link they have opened here.
  const home = account ? '/me' : khataCode ? `/khata/${khataCode}` : null
  function go(to: string) {
    if (account) rememberCurrentShop(account.connection)
    navigate(to)
  }
  const quickActions: QuickAction[] = [
    ...(found?.order_link
      ? [{ key: 'more', icon: ShoppingBag, label: t('order.tileMore'), to: `/order/${found.order_link}` }]
      : []),
    ...(home ? [{ key: 'khata', icon: BookOpen, label: t('order.tileKhata'), onClick: () => go(home) }] : []),
    // The page tells customers to contact the shop (rejected, expired, "call
    // me"), so it gives them the shop's own published number to do it (#24).
    ...(shop?.phone ? [{ key: 'call', icon: Phone, label: t('khata.call'), href: `tel:${shop.phone}` }] : []),
    ...(shopWhatsapp(shop) ? [{ key: 'wa', icon: MessageCircle, label: t('shop.tileWhatsapp'), href: shopWhatsapp(shop)! }] : []),
  ]
  // The same four tabs as the khata link and the order page, once this phone
  // knows whose account it is. This page is an order, so Orders is lit.
  const tabs = home
    ? [
        { key: 'home', icon: House, label: t('khata.tabHome'), active: false, onClick: () => go(home) },
        ...(found?.order_link
          ? [
              {
                key: 'materials',
                icon: ShoppingBag,
                label: t('khata.orderMaterials'),
                active: false,
                onClick: () => navigate(`/order/${found.order_link}`),
              },
            ]
          : []),
        { key: 'bills', icon: Receipt, label: t('khata.tabBills'), active: false, onClick: () => go(`${home}?s=bills`) },
        { key: 'orders', icon: Package, label: t('khata.tabOrders'), active: true, onClick: () => go(`${home}?s=orders`) },
      ]
    : null
  // The truck stands at the shop until the goods are delivered, at the site
  // after — never a live position (there is no tracking in this app).
  const arrived = !!bill && (bill.delivered || !!bill.received_at)
  // Once a bill exists the order has moved past its estimate, so the title
  // says how far it has got — the furthest step ticked on the timeline.
  const progress = bill && steps ? [...steps].reverse().find((st) => st.done) ?? null : null

  return (
    <div className="flex min-h-screen flex-col bg-surface" data-brand={brandAttr(shop?.brand_color)}>
      {/* The shop's own name and logo in the bar (#14). */}
      <CustomerHeader
        shop={found ? { business_name: found.business_name, logo_url: shop?.logo_url ?? null } : null}
      />
      <main className={cn('mx-auto flex w-full max-w-lg flex-1 flex-col gap-4 p-4', tabs && 'pb-28')}>
        {!view && !failed ? (
          <TruckLoader />
        ) : !found ? (
          <SoftCard className="p-5 text-center text-sm text-ink">{failed ? t('error.generic') : t('order.statusNotFound')}</SoftCard>
        ) : (
          <>
            {/* The order, the way the khata link shows a delivery: the truck
                strip, what has happened, and the shop it is with. */}
            <SoftCard className="overflow-hidden">
              {found.status !== 'rejected' && <DeliveryStrip at={arrived ? 'site' : 'shop'} />}
              <div className="flex flex-col gap-2 p-4">
                <div className="text-[11px] font-medium text-muted">
                  {t('khata.liveOrder')} · {found.business_name}
                </div>
                {/* Approved reads "Estimate ready" only once there is one; an
                    order said yes to on the spot (037) says so instead. */}
                <div
                  className={cn(
                    'text-lg font-bold leading-snug',
                    tone === 'success' ? 'text-accent-text' : tone === 'neutral' ? 'text-muted' : 'text-ink',
                  )}
                >
                  {progress ? progress.label : t(`order.status.${statusKey}`)}
                </div>
                <p className="text-sm text-ink">
                  {progress && bill
                    ? t('tl.billDetail', { no: bill.invoice_no, date: formatDate(bill.created_at) })
                    : t(`order.status.${statusKey}Body`, { business: found.business_name })}
                </p>
                {found.status === 'rejected' && rejectReasonText(found, t) && (
                  <p className="rounded-2xl bg-surface p-3 text-sm font-medium text-ink">
                    {t('ord.rejectedReason', { reason: rejectReasonText(found, t) ?? '' })}
                  </p>
                )}
              </div>
            </SoftCard>

            {/* Only for a customer who said they would pay online, and only
                once there is a real figure — the bill's if there is one, the
                estimate's until then. The money goes straight to the shop;
                nothing here records it. */}
            {upiUrl && found.upi_id && (
              <SoftCard className="flex flex-col items-center gap-3 p-5 text-center">
                <div className="text-sm font-semibold text-ink">{t('upi.payTitle')}</div>
                <div className="rounded-2xl bg-white p-2">
                  <QrCode text={upiUrl} size={200} label={t('upi.payTitle')} />
                </div>
                <div className="text-xs text-muted">{found.upi_id}</div>
                <a href={upiUrl} className="w-full">
                  <Button className="w-full rounded-2xl">{t('upi.openApp', { amount: formatINR(found.due ?? 0) })}</Button>
                </a>
                <p className="text-xs text-muted">{t('upi.payHint')}</p>
              </SoftCard>
            )}

            <QuickActions actions={quickActions} />

            {steps && (
              <>
                <SectionHeading title={t('tl.title')} />
                <SoftCard className="p-4">
                  <ol className="flex flex-col">
                    {steps.map((s, i) => {
                      const current = !s.done && (i === 0 || steps[i - 1].done)
                      const next = steps[i + 1]
                      return (
                        <li key={s.key} className="flex gap-3">
                          <div className="flex flex-col items-center">
                            <span
                              className={cn(
                                'flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2',
                                s.done ? 'border-accent bg-accent text-white' : current ? 'border-accent bg-card' : 'border-border bg-card',
                              )}
                            >
                              {s.done ? <Check size={14} strokeWidth={3} /> : current ? <span className="h-2 w-2 rounded-full bg-accent" /> : null}
                            </span>
                            {next && <span className={cn('min-h-4 w-0.5 flex-1', next.done ? 'bg-accent' : 'bg-border')} />}
                          </div>
                          <div className={cn('min-w-0', next && 'pb-4')}>
                            <div className={cn('text-sm leading-6', s.done || current ? 'font-semibold text-ink' : 'text-muted')}>{s.label}</div>
                            {s.detail && <div className="text-xs text-muted">{s.detail}</div>}
                          </div>
                        </li>
                      )
                    })}
                  </ol>
                </SoftCard>
              </>
            )}

            <SectionHeading title={t('order.materialsHeading')} />
            <SoftCard className="p-4">
              <div className="flex flex-col divide-y divide-border text-sm">
                {found.items.map((item, i) => (
                  <div key={i} className="flex justify-between gap-3 py-2 first:pt-0 last:pb-0">
                    <span className="min-w-0 break-words text-ink">{item.name}</span>
                    <span className="shrink-0 font-medium text-ink">
                      {Number(item.qty).toLocaleString('en-IN')} {item.unit}
                    </span>
                  </div>
                ))}
              </div>
              <div className="mt-3 flex flex-col gap-1 border-t border-border pt-3 text-xs text-muted">
                <span>{t('order.placedOn', { date: formatDate(found.created_at) })}</span>
                {found.delivery_date && <span>{t('order.deliveryOn', { date: formatDate(found.delivery_date) })}</span>}
                {found.payment_method && (
                  <span>
                    {t('order.payChose', {
                      method: t(found.payment_method === 'cash' ? 'order.payCash' : 'order.payOnline'),
                    })}
                  </span>
                )}
              </div>
            </SoftCard>

            {estimate && (
              <>
                <SectionHeading title={t('est.title', { no: estimate.quote_no })} />
                <SoftCard className="flex flex-col gap-3 p-4">
                  <div className="flex flex-col divide-y divide-border text-sm">
                    {estimate.items.map((item, i) => (
                      <div key={i} className="flex justify-between gap-3 py-2 first:pt-0">
                        <span className="min-w-0 break-words text-ink">
                          {item.description}
                          <span className="block text-xs text-muted">
                            {Number(item.qty).toLocaleString('en-IN')} × {formatINR(item.rate)}
                          </span>
                        </span>
                        <span className="shrink-0 font-medium text-ink">{formatINR(item.amount)}</span>
                      </div>
                    ))}
                  </div>
                  <div className="flex flex-col gap-1 border-t border-border pt-3 text-sm text-ink">
                    {(estimate.gst_amount > 0 || estimate.transport_labour_charge > 0) && (
                      <div className="flex justify-between">
                        <span>{t('est.subtotal')}</span>
                        <span>{formatINR(estimate.subtotal)}</span>
                      </div>
                    )}
                    {estimate.gst_amount > 0 && (
                      <div className="flex justify-between">
                        <span>GST</span>
                        <span>{formatINR(estimate.gst_amount)}</span>
                      </div>
                    )}
                    {estimate.transport_labour_charge > 0 && (
                      <div className="flex justify-between">
                        <span>{t('est.transport')}</span>
                        <span>{formatINR(estimate.transport_labour_charge)}</span>
                      </div>
                    )}
                    <div className="mt-1 flex items-center justify-between rounded-2xl bg-accent-bg px-4 py-3 text-accent-text">
                      <span className="text-sm font-semibold">{t('est.total')}</span>
                      <span className="text-xl font-bold leading-none">{formatINR(estimate.total)}</span>
                    </div>
                  </div>

                  {estimate.status === 'Converted' && bill ? (
                    <p className="rounded-2xl bg-accent-bg p-3 text-sm font-medium text-accent-text">{t('est.converted')}</p>
                  ) : estimate.status === 'Converted' ? (
                    <p className="text-sm text-muted">{t('est.closed', { business: found.business_name })}</p>
                  ) : estimate.status === 'Expired' ? (
                    <p className="text-sm text-muted">{t('est.expired', { business: found.business_name })}</p>
                  ) : (
                    <>
                      {found.response && found.responded_at ? (
                        <p className="rounded-2xl bg-surface p-3 text-sm font-medium text-ink">
                          {found.response === 'accepted'
                            ? t('est.accepted', { date: formatDate(found.responded_at) })
                            : t('est.calledFor', { business: found.business_name, date: formatDate(found.responded_at) })}
                        </p>
                      ) : (
                        <p className="text-xs text-muted">{t('est.askHint', { business: found.business_name })}</p>
                      )}
                      {answerFailed && (
                        <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">{t(answerFailed)}</p>
                      )}
                      <div className="flex flex-wrap gap-2">
                        {found.response !== 'accepted' && (
                          <Button className="rounded-full px-5" onClick={() => answer('accepted')} disabled={answering !== null}>
                            {answering === 'accepted' ? t('common.saving') : t('est.accept')}
                          </Button>
                        )}
                        {found.response !== 'call_me' && (
                          <Button variant="outline" className="rounded-full px-5" onClick={() => answer('call_me')} disabled={answering !== null}>
                            {answering === 'call_me' ? t('common.saving') : t('est.callMe')}
                          </Button>
                        )}
                      </div>
                    </>
                  )}
                </SoftCard>
              </>
            )}
          </>
        )}
        <BuildSupplyFooter />
      </main>

      {tabs && <CustomerTabBar tabs={tabs} />}
    </div>
  )
}
