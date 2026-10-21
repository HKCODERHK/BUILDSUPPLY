import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ChevronRight, Package, ShoppingBag } from 'lucide-react'
import { SoftCard } from '@/components/CustomerHome'
import { TruckLoader } from '@/components/TruckLoader'
import { useLanguage } from '@/context/LanguageContext'
import { showDate } from '@/lib/displayDate'
import type { TranslationKey } from '@/lib/i18n'
import { readRecentOrders } from '@/lib/customerLinks'
import { orderItemQtyText } from '@/lib/orderFormat'
import { getOrderStatus, type OrderStatusView } from '@/services/orders'
import { cn } from '@/lib/utils'

type Found = Extract<OrderStatusView, { found: true }>
type Row = { token: string; at: string; order: Found }
type Tab = 'all' | 'waiting' | 'accepted' | 'rejected'

/** Where an order has got, in the status page's own words. */
function stageOf(o: Found): { key: TranslationKey; tone: 'wait' | 'ok' | 'no' } {
  if (o.status === 'rejected') return { key: 'order.status.rejected', tone: 'no' }
  if (o.status === 'pending') return { key: 'order.status.pending', tone: 'wait' }
  if (o.bill?.delivered) return { key: 'corder.delivered', tone: 'ok' }
  if (o.bill) return { key: 'corder.billed', tone: 'ok' }
  return { key: o.estimate ? 'order.status.approved' : 'order.status.accepted', tone: 'ok' }
}

/**
 * The order page's Orders tab (2026-10-21, after the grocery reference's
 * order list): the orders this phone sent to this shop — the status links it
 * already keeps (`readRecentOrders`) — each read through the same public
 * `order_status` the status page uses, with tabs by where they have got.
 * Nothing new is stored or sent; tapping one opens its status page.
 */
export function ShopOrdersView({ link, onBrowse }: { link: string; onBrowse: () => void }) {
  const { t, lang } = useLanguage()
  const [rows, setRows] = useState<Row[] | null>(null)
  const [tab, setTab] = useState<Tab>('all')

  useEffect(() => {
    let live = true
    const recent = readRecentOrders(link)
    Promise.all(
      recent.map((r) =>
        getOrderStatus(r.token)
          .then((o) => (o.found ? ({ token: r.token, at: r.at, order: o } as Row) : null))
          .catch(() => null),
      ),
    ).then((list) => {
      if (live) setRows(list.filter((x): x is Row => !!x))
    })
    return () => {
      live = false
    }
  }, [link])

  if (rows === null) return <TruckLoader />

  const inTab = (r: Row) =>
    tab === 'all' ||
    (tab === 'waiting' && r.order.status === 'pending') ||
    (tab === 'accepted' && r.order.status === 'approved') ||
    (tab === 'rejected' && r.order.status === 'rejected')
  const shown = rows.filter(inTab)
  const tabs: { key: Tab; label: string }[] = [
    { key: 'all', label: t('corder.tabAll') },
    { key: 'waiting', label: t('corder.tabWaiting') },
    { key: 'accepted', label: t('corder.tabAccepted') },
    { key: 'rejected', label: t('corder.tabRejected') },
  ]

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-baseline justify-between gap-3 px-1">
        <h1 className="text-xl font-bold text-ink">{t('corder.title')}</h1>
        {rows.length > 0 && <span className="text-xs text-muted">{t('corder.fromPhone')}</span>}
      </div>

      {rows.length === 0 ? (
        <SoftCard className="flex flex-col items-center gap-3 p-6 text-center">
          <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-accent-bg text-accent-text">
            <Package size={26} />
          </span>
          <div className="text-base font-semibold text-ink">{t('corder.emptyTitle')}</div>
          <p className="text-sm text-muted">{t('corder.emptyBody')}</p>
          <button
            type="button"
            onClick={onBrowse}
            className="mt-1 inline-flex h-11 items-center gap-2 rounded-xl bg-accent px-5 text-sm font-semibold text-white"
          >
            <ShoppingBag size={16} /> {t('corder.browse')}
          </button>
        </SoftCard>
      ) : (
        <>
          <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" role="group">
            {tabs.map((x) => (
              <button
                key={x.key}
                type="button"
                aria-pressed={tab === x.key}
                onClick={() => setTab(x.key)}
                className={cn(
                  'h-9 shrink-0 rounded-full border px-4 text-xs font-semibold',
                  tab === x.key ? 'border-accent bg-accent text-white' : 'border-border bg-card text-ink',
                )}
              >
                {x.label}
              </button>
            ))}
          </div>
          {shown.length === 0 && <SoftCard className="p-4 text-sm text-muted">{t('corder.noneHere')}</SoftCard>}
          <SoftCard className="divide-y divide-border overflow-hidden">
            {shown.map((r) => {
              const stage = stageOf(r.order)
              const first = r.order.items[0]
              const more = r.order.items.length - 1
              return (
                <Link key={r.token} to={`/order-status/${r.token}`} className="flex items-center gap-3 p-4 hover:bg-surface">
                  <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-surface text-accent-text">
                    <Package size={22} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-ink">{first ? first.name : '—'}</span>
                    <span className="block truncate text-xs text-muted">
                      {first ? orderItemQtyText(first, t) : ''}
                      {more > 0 ? ` · ${t('corder.more', { count: more })}` : ''}
                    </span>
                    <span className="mt-1 flex flex-wrap items-center gap-2">
                      <span
                        className={cn(
                          'rounded-full px-2 py-0.5 text-[11px] font-semibold',
                          stage.tone === 'ok' && 'bg-accent-bg text-accent-text',
                          stage.tone === 'wait' && 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300',
                          stage.tone === 'no' && 'bg-surface text-muted',
                        )}
                      >
                        {t(stage.key)}
                      </span>
                      <span className="text-[11px] text-muted">{showDate(r.order.created_at, lang)}</span>
                    </span>
                  </span>
                  <ChevronRight size={18} className="shrink-0 text-muted" />
                </Link>
              )
            })}
          </SoftCard>
        </>
      )}
    </div>
  )
}
