import { useEffect, useState, type FormEvent } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { PageHeader } from '@/components/layout/PageHeader'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Modal } from '@/components/ui/modal'
import { listPayments, recordPayment, type PaymentWithInvoice } from '@/services/payments'
import { listInvoices, type InvoiceWithCustomer } from '@/services/invoices'
import type { PaymentMode } from '@/lib/database.types'
import { useAuth } from '@/context/AuthContext'

function formatINR(n: number) {
  return `₹${n.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`
}

const MODES: PaymentMode[] = ['Cash', 'UPI', 'Wallet']

interface Split {
  key: string
  amount: string
  mode: PaymentMode
}

export default function Payments() {
  const { supplier } = useAuth()
  const [payments, setPayments] = useState<PaymentWithInvoice[]>([])
  const [invoices, setInvoices] = useState<InvoiceWithCustomer[]>([])
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [invoiceId, setInvoiceId] = useState('')
  const [splits, setSplits] = useState<Split[]>([{ key: crypto.randomUUID(), amount: '', mode: 'Cash' }])
  const [saving, setSaving] = useState(false)

  async function refresh() {
    const [paymentList, invoiceList] = await Promise.all([listPayments(), listInvoices()])
    setPayments(paymentList)
    setInvoices(invoiceList.filter((i) => i.status !== 'Paid'))
  }

  useEffect(() => {
    refresh().finally(() => setLoading(false))
  }, [])

  function addSplit() {
    setSplits((prev) => [...prev, { key: crypto.randomUUID(), amount: '', mode: 'Cash' }])
  }

  function updateSplit(key: string, patch: Partial<Split>) {
    setSplits((prev) => prev.map((s) => (s.key === key ? { ...s, ...patch } : s)))
  }

  function removeSplit(key: string) {
    setSplits((prev) => prev.filter((s) => s.key !== key))
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!supplier || !invoiceId) return
    setSaving(true)
    try {
      await recordPayment(
        supplier.id,
        invoiceId,
        splits.map((s) => ({ amount: Number(s.amount) || 0, mode: s.mode })),
      )
      setModalOpen(false)
      setInvoiceId('')
      setSplits([{ key: crypto.randomUUID(), amount: '', mode: 'Cash' }])
      await refresh()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div>
      <PageHeader
        title="Payments"
        subtitle="Cash, UPI, advance wallet and split payments"
        action={
          <Button onClick={() => setModalOpen(true)}>
            <Plus size={16} /> Record payment
          </Button>
        }
      />

      {loading ? (
        <p className="text-sm text-muted">Loading…</p>
      ) : (
        <Card>
          <div className="flex flex-col divide-y divide-border">
            {payments.length === 0 && <p className="py-3 text-sm text-muted">No payments recorded yet.</p>}
            {payments.map((p) => (
              <div key={p.id} className="flex items-center justify-between py-2.5 text-sm">
                <div>
                  <div className="font-medium text-ink">{p.invoices?.invoice_no ?? '—'}</div>
                  <div className="text-xs text-muted">{p.invoices?.customers?.name ?? '—'}</div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge tone="neutral">{p.mode}</Badge>
                  <span className="font-semibold">{formatINR(p.amount)}</span>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {modalOpen && (
        <Modal title="Record payment" onClose={() => setModalOpen(false)}>
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div>
              <Label htmlFor="invoice">Invoice</Label>
              <select
                id="invoice"
                required
                value={invoiceId}
                onChange={(e) => setInvoiceId(e.target.value)}
                className="h-10 w-full rounded-lg border border-border bg-white px-3 text-sm outline-none focus:border-accent"
              >
                <option value="">Select an unpaid invoice…</option>
                {invoices.map((inv) => (
                  <option key={inv.id} value={inv.id}>
                    {inv.invoice_no} — {inv.customers?.name} (pending {formatINR(inv.total - inv.paid)})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <div className="mb-2 flex items-center justify-between">
                <Label className="mb-0">Split payment</Label>
                <button type="button" onClick={addSplit} className="text-xs font-semibold text-accent">
                  + Add split
                </button>
              </div>
              <div className="flex flex-col gap-2">
                {splits.map((s) => (
                  <div key={s.key} className="flex items-center gap-2">
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      placeholder="Amount"
                      value={s.amount}
                      onChange={(e) => updateSplit(s.key, { amount: e.target.value })}
                    />
                    <select
                      value={s.mode}
                      onChange={(e) => updateSplit(s.key, { mode: e.target.value as PaymentMode })}
                      className="h-10 rounded-lg border border-border bg-white px-2 text-sm outline-none focus:border-accent"
                    >
                      {MODES.map((m) => (
                        <option key={m} value={m}>
                          {m}
                        </option>
                      ))}
                    </select>
                    {splits.length > 1 && (
                      <button type="button" onClick={() => removeSplit(s.key)} className="text-muted hover:text-red-600">
                        <Trash2 size={16} />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <Button type="submit" disabled={saving || !invoiceId}>
              {saving ? 'Saving…' : 'Record payment'}
            </Button>
          </form>
        </Modal>
      )}
    </div>
  )
}
