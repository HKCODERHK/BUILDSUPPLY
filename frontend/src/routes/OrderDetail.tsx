import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Ban, Phone } from 'lucide-react'
import { Modal } from '@/components/ui/modal'
import { PageHeader } from '@/components/layout/PageHeader'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { TruckLoader } from '@/components/TruckLoader'
import { WhatsAppIcon } from '@/components/icons/WhatsAppIcon'
import { RejectOrderModal } from '@/components/RejectOrderModal'
import { useAuth } from '@/context/AuthContext'
import { useLanguage } from '@/context/LanguageContext'
import { openWhatsAppShare } from '@/lib/whatsapp'
import type { Customer, OrderRequest } from '@/lib/database.types'
import { listCustomers } from '@/services/customers'
import { blockOrderPhone, getOrder, listBlockedPhones, unblockOrderPhone } from '@/services/orders'
import { formatOrderDate, rejectReasonText } from '@/lib/orderFormat'

/** One online order in full, with the customer match and Approve / Reject. */
export default function OrderDetail() {
  const { id = '' } = useParams()
  const { supplier } = useAuth()
  const { t } = useLanguage()
  const navigate = useNavigate()
  const [order, setOrder] = useState<OrderRequest | null>(null)
  const [match, setMatch] = useState<Customer | null>(null)
  const [loading, setLoading] = useState(true)
  const [rejecting, setRejecting] = useState(false)
  // Whether this number is blocked (migration 032); null hides the option —
  // before 032 is applied, or if the list could not be read.
  const [blocked, setBlocked] = useState<boolean | null>(null)
  const [confirmBlock, setConfirmBlock] = useState(false)
  const [blockBusy, setBlockBusy] = useState(false)
  const [blockFailed, setBlockFailed] = useState(false)

  function load() {
    return Promise.all([getOrder(id), listCustomers(), listBlockedPhones().catch(() => null)]).then(([o, customers, blockedList]) => {
      setOrder(o)
      setMatch(customers.find((c) => c.phone === o.phone) ?? null)
      setBlocked(blockedList ? blockedList.some((b) => b.phone === o.phone) : null)
    })
  }

  async function setBlock(block: boolean) {
    if (!order || blockBusy) return
    setBlockBusy(true)
    setBlockFailed(false)
    try {
      if (block) await blockOrderPhone(order.phone)
      else await unblockOrderPhone(order.phone)
      setConfirmBlock(false)
      await load()
    } catch {
      setBlockFailed(true)
    } finally {
      setBlockBusy(false)
    }
  }

  useEffect(() => {
    load().finally(() => setLoading(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  if (loading) return <TruckLoader />
  if (!order) return <Card className="text-sm text-muted">{t('order.statusNotFound')}</Card>

  const tone = order.status === 'approved' ? 'success' : order.status === 'rejected' ? 'neutral' : 'warning'

  return (
    <div>
      <PageHeader
        title={order.customer_name}
        subtitle={t('ord.received', { date: formatOrderDate(order.created_at) })}
        action={<Badge tone={tone}>{t(`ord.tab.${order.status}`)}</Badge>}
      />

      <div className="flex max-w-2xl flex-col gap-4">
        <Card className="flex flex-col gap-3">
          <div
            className={
              match
                ? 'rounded-lg bg-accent-bg p-3 text-sm font-medium text-accent-text'
                : 'rounded-lg bg-surface p-3 text-sm text-ink'
            }
          >
            {match ? t('ord.possibleMatch', { name: match.name }) : t('ord.newCustomerNote')}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium text-ink">{order.phone}</span>
            <a
              href={`tel:${order.phone}`}
              aria-label={t('cust.callName', { name: order.customer_name })}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border bg-card px-3 text-xs font-semibold text-accent"
            >
              <Phone size={14} /> {t('cust.call')}
            </a>
            <button
              type="button"
              onClick={() =>
                openWhatsAppShare(order.phone, t('ord.whatsappMessage', { name: order.customer_name, business: supplier?.business_name ?? '' }))
              }
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border bg-card px-3 text-xs font-semibold text-accent"
            >
              <WhatsAppIcon size={14} /> WhatsApp
            </button>
          </div>
          {order.site && <div className="text-sm text-ink">{order.site}</div>}
          {order.delivery_date && (
            <div className="text-sm text-ink">
              {t('order.deliveryOn', { date: new Date(order.delivery_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) })}
            </div>
          )}
          {order.note && <div className="text-sm italic text-muted">“{order.note}”</div>}
        </Card>

        <Card>
          <div className="flex flex-col divide-y divide-border text-sm">
            {order.items.map((item, i) => (
              <div key={i} className="flex justify-between gap-3 py-2">
                <span className="text-ink">{item.name}</span>
                <span className="shrink-0 font-semibold text-ink">
                  {Number(item.qty).toLocaleString('en-IN')} {item.unit}
                </span>
              </div>
            ))}
          </div>
        </Card>

        {order.status === 'pending' && (
          <Card className="flex flex-col gap-3">
            <p className="text-xs text-muted">{t('ord.approveHint')}</p>
            <div className="flex gap-2">
              <Button onClick={() => navigate(`/quotations/new?order=${order.id}`)}>{t('ord.approve')}</Button>
              <Button variant="outline" onClick={() => setRejecting(true)}>
                {t('ord.reject')}
              </Button>
            </div>
          </Card>
        )}
        {order.status === 'approved' && order.customer_response && (
          <p className={order.customer_response === 'accepted' ? 'text-sm font-medium text-accent' : 'text-sm font-medium text-amber-700 dark:text-amber-400'}>
            {t(order.customer_response === 'accepted' ? 'est.customerAccepted' : 'est.customerCallMe')}
          </p>
        )}
        {order.status === 'approved' && order.quotation_id && (
          <Link to={`/quotations/${order.quotation_id}`}>
            <Button variant="outline">{t('ord.openEstimate')}</Button>
          </Link>
        )}
        {order.status === 'rejected' && rejectReasonText(order, t) && (
          <p className="text-sm text-muted">{t('ord.rejectedReason', { reason: rejectReasonText(order, t) ?? '' })}</p>
        )}

        {/* Spam: block the number — its orders are refused from then on. */}
        {blocked === true && (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
            <span className="flex items-center gap-2">
              <Ban size={16} className="shrink-0" /> {t('ord.blocked')}
            </span>
            <Button size="sm" variant="outline" onClick={() => setBlock(false)} disabled={blockBusy}>
              {t('ord.unblock')}
            </Button>
          </div>
        )}
        {blocked === false && (
          <button
            type="button"
            onClick={() => setConfirmBlock(true)}
            className="inline-flex items-center gap-1.5 self-start text-sm font-semibold text-red-600 dark:text-red-400"
          >
            <Ban size={15} /> {t('ord.block')}
          </button>
        )}
        {blockFailed && !confirmBlock && (
          <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">{t('error.generic')}</p>
        )}
      </div>

      {confirmBlock && (
        <Modal title={t('ord.blockTitle', { phone: order.phone })} onClose={() => setConfirmBlock(false)}>
          <p className="mb-4 text-sm text-ink">{t('ord.blockBody')}</p>
          {blockFailed && (
            <p className="mb-3 rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">{t('error.generic')}</p>
          )}
          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" disabled={blockBusy} onClick={() => setConfirmBlock(false)}>
              {t('ord.cancel')}
            </Button>
            <Button variant="danger" className="flex-1" disabled={blockBusy} onClick={() => setBlock(true)}>
              {blockBusy ? t('common.saving') : t('ord.blockConfirm')}
            </Button>
          </div>
        </Modal>
      )}

      {rejecting && (
        <RejectOrderModal
          orderId={order.id}
          onClose={() => setRejecting(false)}
          onRejected={() => {
            setRejecting(false)
            void load()
          }}
        />
      )}
    </div>
  )
}
