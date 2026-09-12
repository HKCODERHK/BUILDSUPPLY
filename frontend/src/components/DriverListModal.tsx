import { useState } from 'react'
import { Download, LoaderCircle } from 'lucide-react'
import { Modal } from '@/components/ui/modal'
import { Button } from '@/components/ui/button'
import { WhatsAppIcon } from '@/components/icons/WhatsAppIcon'
import { useAuth } from '@/context/AuthContext'
import { useLanguage } from '@/context/LanguageContext'
import { deliveryListPdfFile, downloadDeliveryListPdf, type DeliveryStop } from '@/lib/deliveryListPdf'
import { shareDocumentOnWhatsApp } from '@/lib/shareDocument'
import { listItemsForInvoices, type InvoiceWithCustomer } from '@/services/invoices'
import { listOrderNotesForQuotations } from '@/services/orders'

/**
 * Deliveries → Driver's list: tick the bills going out today and the driver
 * gets one PDF — each stop's bill, customer, phone, site and materials, with a
 * box to tick. Sent through the share sheet like every other document; the
 * supplier picks the driver and presses Send. Nothing is marked delivered.
 */
export function DriverListModal({ invoices, onClose }: { invoices: InvoiceWithCustomer[]; onClose: () => void }) {
  const { supplier } = useAuth()
  const { t } = useLanguage()
  // Ticked to start with: bills from the last two days, at most the 30 newest.
  // A supplier who rarely taps "Mark delivered" can have hundreds pending, and
  // those older ones are listed but left for them to tick.
  const [picked, setPicked] = useState<Set<string>>(() => {
    const since = Date.now() - 2 * 24 * 60 * 60 * 1000
    return new Set(
      [...invoices]
        .filter((i) => new Date(i.created_at).getTime() >= since)
        .sort((a, b) => b.created_at.localeCompare(a.created_at))
        .slice(0, 30)
        .map((i) => i.id),
    )
  })
  const [busy, setBusy] = useState<'share' | 'download' | null>(null)
  const [failed, setFailed] = useState(false)

  function toggle(id: string) {
    setPicked((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function buildStops(): Promise<DeliveryStop[]> {
    const chosen = invoices.filter((i) => picked.has(i.id))
    // A bill made from an online order carries the estimate it came from, and
    // through it the customer's own note and wanted date — "Call before
    // coming" belongs on the driver's sheet, not in the supplier's memory.
    const quotationIds = chosen.map((i) => i.quotation_id).filter((q): q is string => !!q)
    const [items, notes] = await Promise.all([
      listItemsForInvoices(chosen.map((i) => i.id)),
      listOrderNotesForQuotations(quotationIds).catch(() => []),
    ])
    return chosen.map((inv) => {
      const fromOrder = inv.quotation_id ? notes.find((n) => n.quotation_id === inv.quotation_id) : undefined
      return {
        invoiceNo: inv.invoice_no,
        customer: inv.customers?.name ?? '—',
        phone: inv.customers?.phone ?? null,
        site: inv.site ?? inv.customers?.site ?? null,
        note: fromOrder?.note ?? null,
        wanted: fromOrder?.delivery_date ?? null,
        items: items
          .filter((it) => it.invoice_id === inv.id)
          .map((it) => ({ description: it.description, qty: Number(it.qty), unit: it.materials?.unit_label ?? null })),
      }
    })
  }

  async function run(kind: 'share' | 'download') {
    if (!supplier || busy || picked.size === 0) return
    setBusy(kind)
    setFailed(false)
    try {
      const stops = await buildStops()
      if (kind === 'download') {
        await downloadDeliveryListPdf(supplier, stops)
      } else {
        await shareDocumentOnWhatsApp({
          file: await deliveryListPdfFile(supplier, stops),
          message: t('del.driverMessage', { count: stops.length }),
          title: 'Delivery list',
        })
      }
    } catch {
      setFailed(true)
    } finally {
      setBusy(null)
    }
  }

  const allPicked = picked.size === invoices.length

  return (
    <Modal title={t('del.driverTitle')} onClose={onClose}>
      <div className="flex flex-col gap-3">
        <p className="text-xs text-muted">{t('del.driverHint')}</p>
        <div className="flex items-center justify-between text-xs">
          <span className="font-medium text-ink">{t('del.picked', { count: picked.size })}</span>
          <button
            type="button"
            className="font-semibold text-accent"
            onClick={() => setPicked(allPicked ? new Set() : new Set(invoices.map((i) => i.id)))}
          >
            {allPicked ? t('del.selectNone') : t('del.selectAll')}
          </button>
        </div>
        <div className="flex max-h-72 flex-col divide-y divide-border overflow-y-auto rounded-lg border border-border">
          {invoices.map((inv) => (
            <label key={inv.id} className="flex items-start gap-3 px-3 py-2.5 text-sm">
              <input type="checkbox" className="mt-1" checked={picked.has(inv.id)} onChange={() => toggle(inv.id)} />
              <span className="min-w-0">
                <span className="font-medium text-ink">{inv.invoice_no}</span>
                <span className="block truncate text-xs text-muted">
                  {inv.customers?.name ?? '—'}
                  {inv.site ? ` · ${inv.site}` : ''}
                </span>
              </span>
            </label>
          ))}
        </div>
        {failed && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">{t('error.generic')}</p>}
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => run('share')} disabled={busy !== null || picked.size === 0}>
            {busy === 'share' ? <LoaderCircle size={16} className="animate-spin" /> : <WhatsAppIcon size={16} />} {t('del.sendDriver')}
          </Button>
          <Button variant="outline" onClick={() => run('download')} disabled={busy !== null || picked.size === 0}>
            {busy === 'download' ? <LoaderCircle size={16} className="animate-spin" /> : <Download size={16} />} {t('del.download')}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
