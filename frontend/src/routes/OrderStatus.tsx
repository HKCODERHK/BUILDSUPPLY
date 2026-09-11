import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { LanguageToggle } from '@/components/LanguageToggle'
import { TruckLoader } from '@/components/TruckLoader'
import { useLanguage } from '@/context/LanguageContext'
import { getOrderStatus, type OrderStatusView } from '@/services/orders'
import { rejectReasonText } from '@/lib/orderFormat'

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
}

/**
 * /order-status/<code> — the link a customer got when they placed an order.
 * The code is random (migration 026); this shows only the status, the items,
 * the dates and — once rejected — the reason the supplier picked (027). Never
 * prices, the phone number or the customer's note.
 */
export default function OrderStatus() {
  const { token = '' } = useParams()
  const { t } = useLanguage()
  const [view, setView] = useState<OrderStatusView | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    getOrderStatus(token)
      .then(setView)
      .catch(() => setFailed(true))
  }, [token])

  const found = view && view.found ? view : null
  const tone = found?.status === 'approved' ? 'success' : found?.status === 'rejected' ? 'neutral' : 'warning'

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
        )}
      </main>
    </div>
  )
}
