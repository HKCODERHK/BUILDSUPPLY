import { useEffect, useState, type FormEvent } from 'react'
import { Plus } from 'lucide-react'
import { PageHeader } from '@/components/layout/PageHeader'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Modal } from '@/components/ui/modal'
import { listDeliveries, createDelivery, updateDeliveryStatus, type DeliveryWithInvoice } from '@/services/deliveries'
import { listInvoices, type InvoiceWithCustomer } from '@/services/invoices'
import { useAuth } from '@/context/AuthContext'

export default function Deliveries() {
  const { supplier } = useAuth()
  const [deliveries, setDeliveries] = useState<DeliveryWithInvoice[]>([])
  const [invoices, setInvoices] = useState<InvoiceWithCustomer[]>([])
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [form, setForm] = useState({ invoice_id: '', driver_name: '', vehicle_no: '' })
  const [saving, setSaving] = useState(false)

  async function refresh() {
    const [deliveryList, invoiceList] = await Promise.all([listDeliveries(), listInvoices()])
    setDeliveries(deliveryList)
    setInvoices(invoiceList)
  }

  useEffect(() => {
    refresh().finally(() => setLoading(false))
  }, [])

  async function handleCreate(e: FormEvent) {
    e.preventDefault()
    if (!supplier) return
    setSaving(true)
    try {
      await createDelivery(supplier.id, {
        invoice_id: form.invoice_id || null,
        driver_name: form.driver_name,
        vehicle_no: form.vehicle_no,
      })
      setForm({ invoice_id: '', driver_name: '', vehicle_no: '' })
      setModalOpen(false)
      await refresh()
    } finally {
      setSaving(false)
    }
  }

  async function toggleStatus(d: DeliveryWithInvoice) {
    await updateDeliveryStatus(d.id, d.status === 'Pending' ? 'Delivered' : 'Pending')
    await refresh()
  }

  return (
    <div>
      <PageHeader
        title="Deliveries"
        subtitle="Challans, drivers and vehicles"
        action={
          <Button onClick={() => setModalOpen(true)}>
            <Plus size={16} /> New challan
          </Button>
        }
      />

      {loading ? (
        <p className="text-sm text-muted">Loading…</p>
      ) : (
        <Card>
          <div className="flex flex-col divide-y divide-border">
            {deliveries.length === 0 && <p className="py-3 text-sm text-muted">No delivery challans yet.</p>}
            {deliveries.map((d) => (
              <div key={d.id} className="flex items-center justify-between py-2.5 text-sm">
                <div>
                  <div className="font-medium text-ink">{d.challan_no}</div>
                  <div className="text-xs text-muted">
                    {d.invoices?.invoice_no ?? 'Blind challan'} · {d.driver_name || '—'} · {d.vehicle_no || '—'}
                  </div>
                </div>
                <button onClick={() => toggleStatus(d)}>
                  <Badge tone={d.status === 'Delivered' ? 'success' : 'warning'}>{d.status}</Badge>
                </button>
              </div>
            ))}
          </div>
        </Card>
      )}

      {modalOpen && (
        <Modal title="New delivery challan" onClose={() => setModalOpen(false)}>
          <form onSubmit={handleCreate} className="flex flex-col gap-4">
            <div>
              <Label htmlFor="invoice">Invoice (optional)</Label>
              <select
                id="invoice"
                value={form.invoice_id}
                onChange={(e) => setForm({ ...form, invoice_id: e.target.value })}
                className="h-10 w-full rounded-lg border border-border bg-white px-3 text-sm outline-none focus:border-accent"
              >
                <option value="">Blind challan (no invoice)</option>
                {invoices.map((inv) => (
                  <option key={inv.id} value={inv.id}>
                    {inv.invoice_no} — {inv.customers?.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label htmlFor="driver">Driver name</Label>
              <Input id="driver" value={form.driver_name} onChange={(e) => setForm({ ...form, driver_name: e.target.value })} />
            </div>
            <div>
              <Label htmlFor="vehicle">Vehicle number</Label>
              <Input id="vehicle" value={form.vehicle_no} onChange={(e) => setForm({ ...form, vehicle_no: e.target.value })} />
            </div>
            <Button type="submit" disabled={saving}>
              {saving ? 'Saving…' : 'Save challan'}
            </Button>
          </form>
        </Modal>
      )}
    </div>
  )
}
