import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { Check } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { LanguageToggle } from '@/components/LanguageToggle'
import { TruckLoader } from '@/components/TruckLoader'
import { useLanguage } from '@/context/LanguageContext'
import { getOrderStatus, respondToEstimate, type OrderStatusView } from '@/services/orders'
import { rejectReasonText } from '@/lib/orderFormat'
import { cn } from '@/lib/utils'

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
  const [view, setView] = useState<OrderStatusView | null>(null)
  const [failed, setFailed] = useState(false)
  const [answering, setAnswering] = useState<'accepted' | 'call_me' | null>(null)
  const [answerFailed, setAnswerFailed] = useState(false)

  useEffect(() => {
    getOrderStatus(token)
      .then(setView)
      .catch(() => setFailed(true))
  }, [token])

  const found = view && view.found ? view : null
  const tone = found?.status === 'approved' ? 'success' : found?.status === 'rejected' ? 'neutral' : 'warning'
  const estimate = found?.status === 'approved' ? (found.estimate ?? null) : null

  // The order's progress, ticked as it happens (migration 031): sent →
  // estimate ready → accepted → bill made → delivered → received. Nothing to
  // track once an order is rejected — the reason above says it all. A bill
  // made straight from the estimate counts as accepted.
  const bill = found?.bill ?? null
  const billed = estimate?.status === 'Converted' || !!bill
  const steps =
    found && found.status !== 'rejected'
      ? [
          { key: 'sent', label: t('tl.sent'), detail: formatDate(found.created_at), done: true },
          {
            key: 'estimate',
            label: t('tl.estimate'),
            detail: found.status === 'approved' && found.decided_at ? formatDate(found.decided_at) : null,
            done: found.status === 'approved',
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
            label: t('tl.received'),
            detail: bill?.received_at ? formatDate(bill.received_at) : null,
            done: !!bill?.received_at,
          },
        ]
      : null

  async function answer(response: 'accepted' | 'call_me') {
    if (answering) return
    setAnswering(response)
    setAnswerFailed(false)
    try {
      await respondToEstimate(token, response)
      setView(await getOrderStatus(token))
    } catch {
      setAnswerFailed(true)
    } finally {
      setAnswering(null)
    }
  }

  return (
    <div className="min-h-screen bg-surface">
      <header className="bg-shell px-4 pb-4 pt-[calc(1rem_+_var(--safe-top))] text-white">
        <div className="mx-auto flex max-w-lg items-center gap-3">
          <div className="min-w-0 flex-1">
            <div className="truncate text-lg font-bold">{found?.business_name ?? 'BuildSupply'}</div>
            <div className="text-xs text-sidebar-text">{t('order.statusTitle')}</div>
          </div>
          <LanguageToggle className="border-white/20 text-white hover:bg-white/10 hover:text-white" />
        </div>
      </header>
      <main className="mx-auto flex max-w-lg flex-col gap-4 p-4">
        {!view && !failed ? (
          <TruckLoader />
        ) : !found ? (
          <Card className="text-center text-sm text-ink">{failed ? t('error.generic') : t('order.statusNotFound')}</Card>
        ) : (
          <>
            <Card className="flex flex-col gap-4">
              <div>
                <Badge tone={tone}>{t(`order.status.${found.status}`)}</Badge>
                <p className="mt-3 text-sm text-ink">{t(`order.status.${found.status}Body`, { business: found.business_name })}</p>
                {found.status === 'rejected' && rejectReasonText(found, t) && (
                  <p className="mt-2 rounded-lg bg-surface p-3 text-sm font-medium text-ink">
                    {t('ord.rejectedReason', { reason: rejectReasonText(found, t) ?? '' })}
                  </p>
                )}
              </div>
              <div className="flex flex-col divide-y divide-border border-t border-border text-sm">
                {found.items.map((item, i) => (
                  <div key={i} className="flex justify-between gap-3 py-2">
                    <span className="text-ink">{item.name}</span>
                    <span className="shrink-0 font-medium text-ink">
                      {Number(item.qty).toLocaleString('en-IN')} {item.unit}
                    </span>
                  </div>
                ))}
              </div>
              <div className="flex flex-col gap-1 text-xs text-muted">
                <span>{t('order.placedOn', { date: formatDate(found.created_at) })}</span>
                {found.delivery_date && <span>{t('order.deliveryOn', { date: formatDate(found.delivery_date) })}</span>}
              </div>
            </Card>

            {steps && (
              <Card>
                <div className="mb-3 text-sm font-semibold text-ink">{t('tl.title')}</div>
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
              </Card>
            )}

            {estimate && (
              <Card className="flex flex-col gap-3">
                <div className="text-sm font-semibold text-ink">{t('est.title', { no: estimate.quote_no })}</div>
                <div className="flex flex-col divide-y divide-border border-y border-border text-sm">
                  {estimate.items.map((item, i) => (
                    <div key={i} className="flex justify-between gap-3 py-2">
                      <span className="min-w-0 text-ink">
                        {item.description}
                        <span className="block text-xs text-muted">
                          {Number(item.qty).toLocaleString('en-IN')} × {formatINR(item.rate)}
                        </span>
                      </span>
                      <span className="shrink-0 font-medium text-ink">{formatINR(item.amount)}</span>
                    </div>
                  ))}
                </div>
                <div className="flex flex-col gap-1 text-sm text-ink">
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
                  <div className="flex justify-between text-base font-bold">
                    <span>{t('est.total')}</span>
                    <span>{formatINR(estimate.total)}</span>
                  </div>
                </div>

                {estimate.status === 'Converted' ? (
                  <p className="rounded-lg bg-accent-bg p-3 text-sm font-medium text-accent-text">{t('est.converted')}</p>
                ) : estimate.status === 'Expired' ? (
                  <p className="text-sm text-muted">{t('est.expired', { business: found.business_name })}</p>
                ) : (
                  <>
                    {found.response && found.responded_at ? (
                      <p className="rounded-lg bg-surface p-3 text-sm font-medium text-ink">
                        {found.response === 'accepted'
                          ? t('est.accepted', { date: formatDate(found.responded_at) })
                          : t('est.calledFor', { business: found.business_name, date: formatDate(found.responded_at) })}
                      </p>
                    ) : (
                      <p className="text-xs text-muted">{t('est.askHint', { business: found.business_name })}</p>
                    )}
                    {answerFailed && (
                      <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">{t('error.generic')}</p>
                    )}
                    <div className="flex flex-wrap gap-2">
                      {found.response !== 'accepted' && (
                        <Button onClick={() => answer('accepted')} disabled={answering !== null}>
                          {answering === 'accepted' ? t('common.saving') : t('est.accept')}
                        </Button>
                      )}
                      {found.response !== 'call_me' && (
                        <Button variant="outline" onClick={() => answer('call_me')} disabled={answering !== null}>
                          {answering === 'call_me' ? t('common.saving') : t('est.callMe')}
                        </Button>
                      )}
                    </div>
                  </>
                )}
              </Card>
            )}
          </>
        )}
      </main>
    </div>
  )
}
