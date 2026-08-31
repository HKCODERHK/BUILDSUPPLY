import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Plus } from 'lucide-react'
import { PageHeader } from '@/components/layout/PageHeader'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { WhatsAppIcon } from '@/components/icons/WhatsAppIcon'
import { listInvoices, markInvoiceDelivered, type InvoiceWithCustomer } from '@/services/invoices'
import { getCustomer } from '@/services/customers'
import { openWhatsAppShare } from '@/lib/whatsapp'
import { logActivity } from '@/services/activityLog'
import { useLanguage } from '@/context/LanguageContext'

function formatINR(n: number) {
  return `₹${n.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`
}

export default function Invoices() {
  const { t } = useLanguage()
  const [invoices, setInvoices] = useState<InvoiceWithCustomer[]>([])
  const [loading, setLoading] = useState(true)
  const [markingId, setMarkingId] = useState<string | null>(null)
  const [query, setQuery] = useState('')

  async function refresh() {
    setInvoices(await listInvoices())
  }

  useEffect(() => {
    refresh().finally(() => setLoading(false))
  }, [])

  async function handleMarkDelivered(id: string) {
    setMarkingId(id)
    try {
      await markInvoiceDelivered(id)
      await refresh()
    } finally {
      setMarkingId(null)
    }
  }

  async function shareInvoice(inv: InvoiceWithCustomer) {
    if (!inv.customer_id) return
    const customer = await getCustomer(inv.customer_id)
    openWhatsAppShare(
      customer.phone,
      `Hi ${customer.name}, here is your bill ${inv.invoice_no} for ${formatINR(inv.total)}. ` +
        `${inv.paid < inv.total ? `Pending: ${formatINR(inv.total - inv.paid)}.` : 'Fully paid — thank you!'}`,
    )
    void logActivity('supplier', 'invoice_generated', { details: { invoice_no: inv.invoice_no } })
  }

  const filtered = invoices.filter((inv) => {
    const q = query.trim().toLowerCase()
    if (!q) return true
    const c = inv.customers
    return (
      inv.invoice_no.toLowerCase().includes(q) ||
      (inv.site ?? '').toLowerCase().includes(q) ||
      (c?.name ?? '').toLowerCase().includes(q) ||
      (c?.address ?? '').toLowerCase().includes(q) ||
      (c?.phone ?? '').toLowerCase().includes(q)
    )
  })

  return (
    <div>
      <PageHeader
        title={t('inv.listTitle')}
        subtitle={t('inv.listSubtitle')}
        action={
          <Link to="/invoices/new">
            <Button>
              <Plus size={16} /> {t('inv.new')}
            </Button>
          </Link>
        }
      />

      {loading ? (
        <p className="text-sm text-muted">{t('common.loading')}</p>
      ) : (
        <>
          <Input
            placeholder={t('inv.searchPlaceholder')}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="mb-4 max-w-sm"
          />
          <Card>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-border text-xs text-muted">
                  <th className="py-2 pr-3 font-medium">{t('inv.colInvoice')}</th>
                  <th className="py-2 pr-3 font-medium">{t('common.customer')}</th>
                  <th className="py-2 pr-3 font-medium">{t('common.site')}</th>
                  <th className="py-2 pr-3 font-medium">{t('common.total')}</th>
                  <th className="py-2 pr-3 font-medium">{t('common.paid')}</th>
                  <th className="py-2 pr-3 font-medium">{t('common.status')}</th>
                  <th className="py-2 pr-3 font-medium">{t('inv.colDelivery')}</th>
                  <th className="py-2 pr-3 font-medium"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={8} className="py-4 text-muted">
                      {invoices.length === 0 ? t('inv.noneYet') : t('inv.noMatch')}
                    </td>
                  </tr>
                )}
                {filtered.map((inv) => (
                  <tr key={inv.id}>
                    <td className="py-2.5 pr-3 font-medium text-ink">
                      <Link to={`/invoices/${inv.id}`} className="hover:text-accent">
                        {inv.invoice_no}
                      </Link>
                    </td>
                    <td className="py-2.5 pr-3">{inv.customers?.name ?? '—'}</td>
                    <td className="py-2.5 pr-3 text-muted">{inv.site ?? '—'}</td>
                    <td className="py-2.5 pr-3">{formatINR(inv.total)}</td>
                    <td className="py-2.5 pr-3">{formatINR(inv.paid)}</td>
                    <td className="py-2.5 pr-3">
                      <Badge
                        tone={
                          inv.status === 'Cancelled'
                            ? 'neutral'
                            : inv.status === 'Paid'
                              ? 'success'
                              : inv.status === 'Partial'
                                ? 'warning'
                                : 'danger'
                        }
                      >
                        {t(`status.${inv.status}`)}
                      </Badge>
                    </td>
                    <td className="py-2.5 pr-3">
                      {inv.status === 'Cancelled' ? (
                        <span className="text-xs text-muted">—</span>
                      ) : inv.delivered ? (
                        <Badge tone="success">{t('inv.deliveredBadge')}</Badge>
                      ) : (
                        <button
                          onClick={() => handleMarkDelivered(inv.id)}
                          disabled={markingId === inv.id}
                          className="text-xs font-semibold text-accent hover:text-accent-soft disabled:opacity-50"
                        >
                          {markingId === inv.id ? t('inv.marking') : t('inv.markDelivered')}
                        </button>
                      )}
                    </td>
                    <td className="py-2.5 pr-3">
                      <button onClick={() => shareInvoice(inv)} className="text-accent hover:text-accent-soft" aria-label="Share on WhatsApp">
                        <WhatsAppIcon size={16} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          </Card>
        </>
      )}
    </div>
  )
}
