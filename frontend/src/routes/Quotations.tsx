import { useEffect, useState, type FormEvent } from 'react'
import { Plus } from 'lucide-react'
import { PageHeader } from '@/components/layout/PageHeader'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Modal } from '@/components/ui/modal'
import { listQuotations, createQuotation, markQuotationConverted, type QuotationWithCustomer } from '@/services/quotations'
import { createInvoice } from '@/services/invoices'
import { listCustomers } from '@/services/customers'
import type { Customer } from '@/lib/database.types'
import { useAuth } from '@/context/AuthContext'

function formatINR(n: number) {
  return `₹${n.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`
}

export default function Quotations() {
  const { supplier } = useAuth()
  const [quotations, setQuotations] = useState<QuotationWithCustomer[]>([])
  const [customers, setCustomers] = useState<Customer[]>([])
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [form, setForm] = useState({ customer_id: '', total: '' })
  const [saving, setSaving] = useState(false)
  const [convertingId, setConvertingId] = useState<string | null>(null)

  async function refresh() {
    const [quoteList, customerList] = await Promise.all([listQuotations(), listCustomers()])
    setQuotations(quoteList)
    setCustomers(customerList)
  }

  useEffect(() => {
    refresh().finally(() => setLoading(false))
  }, [])

  async function handleCreate(e: FormEvent) {
    e.preventDefault()
    if (!supplier) return
    setSaving(true)
    try {
      await createQuotation(supplier.id, { customer_id: form.customer_id, total: Number(form.total) || 0 })
      setForm({ customer_id: '', total: '' })
      setModalOpen(false)
      await refresh()
    } finally {
      setSaving(false)
    }
  }

  async function handleConvert(q: QuotationWithCustomer) {
    if (!supplier || !q.customer_id) return
    setConvertingId(q.id)
    try {
      const invoice = await createInvoice(supplier.id, {
        customer_id: q.customer_id,
        items: [{ material_id: null, description: `Converted from ${q.quote_no}`, qty: 1, rate: q.total }],
      })
      await markQuotationConverted(q.id, invoice.id)
      await refresh()
    } finally {
      setConvertingId(null)
    }
  }

  return (
    <div>
      <PageHeader
        title="Quotations"
        subtitle="Estimates you can convert to invoices in one click"
        action={
          <Button onClick={() => setModalOpen(true)}>
            <Plus size={16} /> New quotation
          </Button>
        }
      />

      {loading ? (
        <p className="text-sm text-muted">Loading…</p>
      ) : (
        <Card>
          <div className="flex flex-col divide-y divide-border">
            {quotations.length === 0 && <p className="py-3 text-sm text-muted">No quotations yet.</p>}
            {quotations.map((q) => (
              <div key={q.id} className="flex items-center justify-between py-2.5 text-sm">
                <div>
                  <div className="font-medium text-ink">{q.quote_no}</div>
                  <div className="text-xs text-muted">{q.customers?.name ?? '—'}</div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="font-semibold">{formatINR(q.total)}</span>
                  <Badge tone={q.status === 'Converted' ? 'success' : q.status === 'Expired' ? 'danger' : 'neutral'}>
                    {q.status}
                  </Badge>
                  {q.status === 'Open' && (
                    <Button size="sm" variant="outline" onClick={() => handleConvert(q)} disabled={convertingId === q.id}>
                      {convertingId === q.id ? 'Converting…' : 'Convert'}
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {modalOpen && (
        <Modal title="New quotation" onClose={() => setModalOpen(false)}>
          <form onSubmit={handleCreate} className="flex flex-col gap-4">
            <div>
              <Label htmlFor="customer">Customer</Label>
              <select
                id="customer"
                required
                value={form.customer_id}
                onChange={(e) => setForm({ ...form, customer_id: e.target.value })}
                className="h-10 w-full rounded-lg border border-border bg-white px-3 text-sm outline-none focus:border-accent"
              >
                <option value="">Select a customer…</option>
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label htmlFor="total">Estimated total (₹)</Label>
              <Input id="total" type="number" min="0" step="0.01" required value={form.total} onChange={(e) => setForm({ ...form, total: e.target.value })} />
            </div>
            <Button type="submit" disabled={saving}>
              {saving ? 'Saving…' : 'Save quotation'}
            </Button>
          </form>
        </Modal>
      )}
    </div>
  )
}
