import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { PageHeader } from '@/components/layout/PageHeader'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { TruckLoader } from '@/components/TruckLoader'
import { RejectOrderModal } from '@/components/RejectOrderModal'
import { useLanguage } from '@/context/LanguageContext'
import { cn } from '@/lib/utils'
import type { Customer, OrderRequest, OrderStatus } from '@/lib/database.types'
import { listCustomers } from '@/services/customers'
import { acceptOrder, listOrders, orderPageUrl } from '@/services/orders'
import { useAuth } from '@/context/AuthContext'
import { Share2 } from 'lucide-react'
import { OrderLinkShareModal } from '@/components/OrderLinkShareModal'
import { formatOrderDate, orderItemsSummary, rejectReasonText } from '@/lib/orderFormat'

const TABS: OrderStatus[] = ['pending', 'approved', 'rejected']

/**
 * Orders customers sent from the supplier's order link. New ones first, with
 * Approve (→ an estimate) and Reject right on the card; tap a card for the
 * full request.
 */
export default function Orders() {
  const { t } = useLanguage()
  const { supplier } = useAuth()
  const navigate = useNavigate()
  const [orders, setOrders] = useState<OrderRequest[]>([])
  const [byPhone, setByPhone] = useState<Record<string, Customer>>({})
  const [loading, setLoading] = useState(true)
  // The Dashboard's "customer accepted" banner opens straight on Approved.
  const [searchParams] = useSearchParams()
  const [tab, setTab] = useState<OrderStatus>(() => {
    const asked = searchParams.get('tab') as OrderStatus | null
    return asked && TABS.includes(asked) ? asked : 'pending'
  })
  const [rejecting, setRejecting] = useState<string | null>(null)
  const [accepting, setAccepting] = useState<string | null>(null)
  const [shareOpen, setShareOpen] = useState(false)

  function load() {
    return Promise.all([listOrders(), listCustomers()]).then(([o, c]) => {
      setOrders(o)
      setByPhone(Object.fromEntries(c.filter((x) => x.phone).map((x) => [x.phone as string, x])))
    })
  }

  // Says yes and nothing more (037): the order turns Approved for the
  // customer straight away, and the estimate is written when the supplier is
  // ready, from the button that then takes its place.
  async function accept(orderId: string) {
    if (accepting) return
    setAccepting(orderId)
    try {
      await acceptOrder(orderId)
      await load()
    } finally {
      setAccepting(null)
    }
  }

  useEffect(() => {
    load().finally(() => setLoading(false))
  }, [])

  const shown = orders.filter((o) => o.status === tab)

  // "Order link bhejo": shareable from here, where the orders arrive — not only
  // from Settings. Until ordering is switched on, this points to Settings.
  const liveLink = supplier?.order_link && supplier.ordering_enabled ? orderPageUrl(supplier.order_link) : null
  const shareButton = liveLink ? (
    // Asks "link or QR?" — see OrderLinkShareModal.
    <Button size="sm" variant="outline" onClick={() => setShareOpen(true)}>
      <Share2 size={14} /> {t('ord.shareLink')}
    </Button>
  ) : (
    <Link to="/settings?s=orders">
      <Button size="sm" variant="outline">
        {t('ord.setupLink')}
      </Button>
    </Link>
  )

  return (
    <div>
      <PageHeader title={t('ord.title')} subtitle={t('ord.subtitle')} action={shareButton} />

      <div className="mb-4 flex flex-wrap gap-2">
        {TABS.map((status) => {
          const count = orders.filter((o) => o.status === status).length
          return (
            <button
              key={status}
              type="button"
              onClick={() => setTab(status)}
              className={cn(
                'rounded-full border px-3.5 py-2 text-sm font-medium transition-colors',
                tab === status ? 'border-accent bg-accent-bg text-accent-text' : 'border-border text-muted hover:text-ink',
              )}
            >
              {t(`ord.tab.${status}`)} {count > 0 && <span className="ml-1 font-semibold">{count}</span>}
            </button>
          )
        })}
      </div>

      {loading ? (
        <TruckLoader />
      ) : shown.length === 0 ? (
        // The header already has Share order link; a second one here was noise.
        <Card className="text-sm text-muted">{t(tab === 'pending' ? 'ord.emptyPending' : 'ord.emptyOther')}</Card>
      ) : (
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {shown.map((order) => {
            const match = byPhone[order.phone]
            return (
              <Card key={order.id} className="flex flex-col gap-2">
                <Link to={`/orders/${order.id}`} className="flex flex-col gap-1">
                  <div className="flex items-start justify-between gap-3">
                    <div className="font-semibold text-ink">{order.customer_name}</div>
                    <Badge tone={match ? 'success' : 'neutral'}>{t(match ? 'ord.existingCustomer' : 'ord.newCustomer')}</Badge>
                  </div>
                  <div className="text-xs text-muted">
                    {order.phone}
                    {order.site ? ` · ${order.site}` : ''}
                  </div>
                  <div className="text-sm text-ink">{orderItemsSummary(order, (count) => t('ord.moreItems', { count }))}</div>
                  <div className="text-xs text-muted">
                    {t('ord.received', { date: formatOrderDate(order.created_at) })}
                    {order.delivery_date
                      ? ` · ${t('order.deliveryOn', { date: new Date(order.delivery_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) })}`
                      : ''}
                  </div>
                  {order.note && <div className="line-clamp-2 text-xs italic text-muted">“{order.note}”</div>}
                  {order.status === 'rejected' && rejectReasonText(order, t) && (
                    <div className="text-xs text-muted">{t('ord.rejectedReason', { reason: rejectReasonText(order, t) ?? '' })}</div>
                  )}
                  {order.status === 'approved' && order.customer_response && (
                    <div className={order.customer_response === 'accepted' ? 'text-xs font-semibold text-accent' : 'text-xs font-semibold text-amber-700 dark:text-amber-400'}>
                      {t(order.customer_response === 'accepted' ? 'est.customerAccepted' : 'est.customerCallMe')}
                    </div>
                  )}
                </Link>
                {order.status === 'pending' && (
                  <div className="mt-1 flex gap-2 border-t border-border pt-3">
                    {/* Says yes on the spot (037); the estimate comes after. */}
                    <Button size="sm" onClick={() => accept(order.id)} disabled={accepting === order.id}>
                      {accepting === order.id ? t('common.saving') : t('ord.approveNow')}
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => setRejecting(order.id)}>
                      {t('ord.reject')}
                    </Button>
                  </div>
                )}
                {order.status === 'approved' && !order.quotation_id && (
                  <div className="mt-1 border-t border-border pt-3">
                    <Button size="sm" onClick={() => navigate(`/quotations/new?order=${order.id}`)}>
                      {t('ord.makeEstimate')}
                    </Button>
                  </div>
                )}
                {/* Accepted by the customer: straight to the estimate and its Convert to bill. */}
                {order.status === 'approved' && order.customer_response === 'accepted' && order.quotation_id && (
                  <div className="mt-1 border-t border-border pt-3">
                    <Button size="sm" onClick={() => navigate(`/quotations/${order.quotation_id}`)}>
                      {t('dash.convertNow')}
                    </Button>
                  </div>
                )}
              </Card>
            )
          })}
        </div>
      )}

      {shareOpen && liveLink && <OrderLinkShareModal url={liveLink} onClose={() => setShareOpen(false)} />}

      {rejecting && (
        <RejectOrderModal
          orderId={rejecting}
          onClose={() => setRejecting(null)}
          onRejected={() => {
            setRejecting(null)
            void load()
          }}
        />
      )}
    </div>
  )
}
