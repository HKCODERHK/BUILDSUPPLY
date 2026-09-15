import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ClipboardList, Truck } from 'lucide-react'
import { PageHeader } from '@/components/layout/PageHeader'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { listInvoices, markInvoiceDelivered, type InvoiceWithCustomer } from '@/services/invoices'
import { useLanguage } from '@/context/LanguageContext'
import { TruckLoader } from '@/components/TruckLoader'
import { DriverListModal } from '@/components/DriverListModal'
import { SendToDriverModal } from '@/components/SendToDriverModal'

function formatINR(n: number) {
  return `₹${n.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`
}

export default function Deliveries() {
  const { t } = useLanguage()
  const [invoices, setInvoices] = useState<InvoiceWithCustomer[]>([])
  const [loading, setLoading] = useState(true)
  const [markingId, setMarkingId] = useState<string | null>(null)
  const [driverOpen, setDriverOpen] = useState(false)
  // One bill for one driver: their WhatsApp chat with it written out.
  const [sendingBill, setSendingBill] = useState<InvoiceWithCustomer | null>(null)

  async function refresh() {
    setInvoices(await listInvoices({ billsOnly: true }))
  }

  useEffect(() => {
    refresh().finally(() => setLoading(false))
  }, [])

  const pending = invoices.filter((inv) => !inv.delivered && inv.status !== 'Cancelled')

  async function handleMarkDelivered(invoiceId: string) {
    setMarkingId(invoiceId)
    try {
      await markInvoiceDelivered(invoiceId)
      await refresh()
    } finally {
      setMarkingId(null)
    }
  }

  return (
    <div>
      <PageHeader
        title={t('del.title')}
        subtitle={t('del.subtitle')}
        action={
          // One sheet for the driver with the day's stops — nothing is marked delivered by it.
          pending.length > 0 ? (
            <Button size="sm" variant="outline" onClick={() => setDriverOpen(true)}>
              <ClipboardList size={16} /> {t('del.driverList')}
            </Button>
          ) : undefined
        }
      />

      {loading ? (
        <TruckLoader />
      ) : (
        <Card>
          <div className="flex flex-col divide-y divide-border">
            {pending.length === 0 && <p className="py-3 text-sm text-muted">{t('del.none')}</p>}
            {pending.map((inv) => (
              <div key={inv.id} className="flex items-center justify-between gap-3 py-3 text-sm">
                <div className="min-w-0">
                  <Link to={`/invoices/${inv.id}`} className="font-medium text-ink hover:text-accent">
                    {inv.invoice_no}
                  </Link>
                  <div className="truncate text-xs text-muted">
                    {inv.customers?.name ?? '—'}
                    {inv.site ? ` · ${inv.site}` : ''} · {formatINR(inv.total)}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Button size="sm" variant="outline" aria-label={t('drv.menu')} title={t('drv.menu')} onClick={() => setSendingBill(inv)}>
                    <Truck size={15} />
                  </Button>
                  <Button size="sm" onClick={() => handleMarkDelivered(inv.id)} disabled={markingId === inv.id}>
                    {markingId === inv.id ? t('inv.marking') : t('inv.markDelivered')}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {driverOpen && <DriverListModal invoices={pending} onClose={() => setDriverOpen(false)} />}
      {sendingBill && (
        <SendToDriverModal invoice={sendingBill} customer={sendingBill.customers} onClose={() => setSendingBill(null)} />
      )}
    </div>
  )
}
