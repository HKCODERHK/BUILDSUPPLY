import { useEffect, useState, type FormEvent } from 'react'
import { useParams, Link } from 'react-router-dom'
import { Pencil, IndianRupee } from 'lucide-react'
import { PageHeader } from '@/components/layout/PageHeader'
import { Card, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Modal } from '@/components/ui/modal'
import { WhatsAppIcon } from '@/components/icons/WhatsAppIcon'
import { getCustomer, updateCustomer } from '@/services/customers'
import { recordCustomerPayment, type KhataPaymentResult } from '@/services/payments'
import { supabase } from '@/lib/supabase'
import { openWhatsAppShare } from '@/lib/whatsapp'
import { sanitizeDecimal } from '@/lib/numberInput'
import { useAuth } from '@/context/AuthContext'
import type { Customer, Invoice, PaymentMode } from '@/lib/database.types'

const PAYMENT_MODES: PaymentMode[] = ['Cash', 'UPI', 'Bank/Cheque']

function formatINR(n: number) {
  return `₹${n.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`
}

export default function CustomerProfile() {
  const { id } = useParams<{ id: string }>()
  const { supplier } = useAuth()
  const [customer, setCustomer] = useState<Customer | null>(null)
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [loading, setLoading] = useState(true)
  const [editOpen, setEditOpen] = useState(false)
  const [editForm, setEditForm] = useState({ name: '', phone: '', site: '', address: '' })
  const [editError, setEditError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [payOpen, setPayOpen] = useState(false)
  const [payForm, setPayForm] = useState<{ amount: string; mode: PaymentMode }>({ amount: '', mode: 'Cash' })
  const [paying, setPaying] = useState(false)
  const [payResult, setPayResult] = useState<KhataPaymentResult | null>(null)

  async function refresh() {
    if (!id) return
    const [customerData, invoicesRes] = await Promise.all([
      getCustomer(id),
      supabase.from('invoices').select('*').eq('customer_id', id).order('created_at', { ascending: false }),
    ])
    setCustomer(customerData)
    setInvoices((invoicesRes.data as Invoice[]) ?? [])
  }

  // Applied to the oldest unpaid bills automatically — the supplier just
  // enters what the customer handed over.
  async function handleReceivePayment(e: FormEvent) {
    e.preventDefault()
    if (!supplier || !id) return
    const amount = Number(payForm.amount)
    if (!amount || amount <= 0) return
    setPaying(true)
    try {
      const result = await recordCustomerPayment(supplier.id, id, amount, payForm.mode)
      setPayResult(result)
      setPayForm({ amount: '', mode: 'Cash' })
      await refresh()
    } finally {
      setPaying(false)
    }
  }

  useEffect(() => {
    if (!id) return
    let active = true
    Promise.all([
      getCustomer(id),
      supabase.from('invoices').select('*').eq('customer_id', id).order('created_at', { ascending: false }),
    ]).then(([customerData, invoicesRes]) => {
      if (!active) return
      setCustomer(customerData)
      setInvoices((invoicesRes.data as Invoice[]) ?? [])
      setLoading(false)
    })
    return () => {
      active = false
    }
  }, [id])

  function openEdit() {
    if (!customer) return
    setEditForm({ name: customer.name, phone: customer.phone ?? '', site: customer.site ?? '', address: customer.address ?? '' })
    setEditError(null)
    setEditOpen(true)
  }

  async function handleEditSubmit(e: FormEvent) {
    e.preventDefault()
    if (!customer) return
    if (editForm.phone && editForm.phone.length !== 10) {
      setEditError('Phone number must be exactly 10 digits.')
      return
    }
    setSaving(true)
    setEditError(null)
    try {
      await updateCustomer(customer.id, {
        name: editForm.name,
        phone: editForm.phone || null,
        site: editForm.site || null,
        address: editForm.address || null,
      })
      setEditOpen(false)
      await refresh()
    } catch (err) {
      setEditError(err instanceof Error ? err.message : 'Something went wrong. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <p className="text-sm text-muted">Loading…</p>
  if (!customer) return <p className="text-sm text-muted">Customer not found.</p>

  // Cancelled bills stay visible in the khata list below, but never count
  // towards what the customer owes.
  const liveInvoices = invoices.filter((i) => i.status !== 'Cancelled')
  const totalPending = liveInvoices.reduce((sum, i) => sum + (Number(i.total) - Number(i.paid)), 0)

  // Sites come off this customer's own bills now, so a contractor can see
  // what each of their sites has run up and still owes.
  const siteBreakdown = Array.from(
    liveInvoices
      .reduce((map, inv) => {
        const key = inv.site?.trim() || 'No site recorded'
        const cur = map.get(key) ?? { billed: 0, pending: 0 }
        cur.billed += Number(inv.total)
        cur.pending += Number(inv.total) - Number(inv.paid)
        return map.set(key, cur)
      }, new Map<string, { billed: number; pending: number }>())
      .entries(),
  ).sort((a, b) => b[1].pending - a[1].pending)

  return (
    <div>
      <PageHeader
        title={customer.name}
        subtitle="Customer profile, khata and activity"
        action={
          <div className="flex gap-2">
            <Button variant="outline" onClick={openEdit}>
              <Pencil size={16} /> Edit
            </Button>
            <Button
              variant="outline"
              onClick={() =>
                openWhatsAppShare(
                  customer.phone,
                  `Hi ${customer.name}, your pending balance with us is ${formatINR(totalPending)}. Please clear it at your earliest convenience.`,
                )
              }
            >
              <WhatsAppIcon size={16} /> Remind via WhatsApp
            </Button>
            {totalPending > 0 && (
              <Button onClick={() => setPayOpen(true)}>
                <IndianRupee size={16} /> Receive payment
              </Button>
            )}
          </div>
        }
      />

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <div className="text-xs font-medium text-muted">Phone</div>
          {customer.phone ? (
            <a href={`tel:${customer.phone}`} className="mt-1 block text-sm font-semibold text-accent hover:underline">
              {customer.phone}
            </a>
          ) : (
            <div className="mt-1 text-sm font-semibold">—</div>
          )}
        </Card>
        <Card>
          <div className="text-xs font-medium text-muted">Address</div>
          <div className="mt-1 text-sm font-semibold">{customer.address ?? '—'}</div>
        </Card>
        <Card>
          <div className="text-xs font-medium text-muted">Status</div>
          <Badge tone={customer.status === 'Active' ? 'success' : 'neutral'} className="mt-1">
            {customer.status}
          </Badge>
        </Card>
        <Card>
          <div className="text-xs font-medium text-muted">Pending</div>
          <div className="mt-1 text-sm font-semibold text-red-600">{formatINR(totalPending)}</div>
        </Card>
      </div>

      {/* Only worth showing for a contractor running more than one site —
          for everyone else it just repeats the totals above. */}
      {siteBreakdown.length > 1 && (
        <Card className="mb-4">
          <CardHeader>
            <CardTitle>By site</CardTitle>
          </CardHeader>
          <div className="flex flex-col divide-y divide-border">
            {siteBreakdown.map(([siteName, v]) => (
              <div key={siteName} className="flex items-center justify-between py-2 text-sm">
                <div>
                  <div className="font-medium text-ink">{siteName}</div>
                  <div className="text-xs text-muted">Billed {formatINR(v.billed)}</div>
                </div>
                <span className={`font-semibold ${v.pending > 0 ? 'text-red-600' : 'text-accent'}`}>
                  {v.pending > 0 ? formatINR(v.pending) : 'Settled'}
                </span>
              </div>
            ))}
          </div>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Khata — Invoices</CardTitle>
        </CardHeader>
        <div className="flex flex-col divide-y divide-border">
          {invoices.length === 0 && <p className="py-3 text-sm text-muted">No invoices for this customer yet.</p>}
          {invoices.map((inv) => (
            <Link key={inv.id} to={`/invoices`} className="flex items-center justify-between py-2.5 text-sm hover:text-accent">
              <span>{inv.invoice_no}</span>
              <span className="font-semibold">{formatINR(inv.total)}</span>
              <Badge tone={inv.status === 'Paid' ? 'success' : inv.status === 'Partial' ? 'warning' : 'danger'}>
                {inv.status}
              </Badge>
            </Link>
          ))}
        </div>
      </Card>

      {editOpen && (
        <Modal title="Edit customer" onClose={() => setEditOpen(false)}>
          <form onSubmit={handleEditSubmit} className="flex flex-col gap-4">
            {editError && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{editError}</p>}
            <div>
              <Label htmlFor="edit-name">Name</Label>
              <Input
                id="edit-name"
                required
                value={editForm.name}
                onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
              />
            </div>
            <div>
              <Label htmlFor="edit-phone">Phone</Label>
              <Input
                id="edit-phone"
                inputMode="numeric"
                placeholder="10-digit mobile number"
                value={editForm.phone}
                onChange={(e) => setEditForm({ ...editForm, phone: e.target.value.replace(/\D/g, '').slice(0, 10) })}
              />
            </div>
            <div>
              <Label htmlFor="edit-site">Usual site (optional)</Label>
              <Input id="edit-site" value={editForm.site} onChange={(e) => setEditForm({ ...editForm, site: e.target.value })} />
            </div>
            <div>
              <Label htmlFor="edit-address">Address</Label>
              <Input
                id="edit-address"
                value={editForm.address}
                onChange={(e) => setEditForm({ ...editForm, address: e.target.value })}
              />
            </div>
            <Button type="submit" disabled={saving}>
              {saving ? 'Saving…' : 'Save changes'}
            </Button>
          </form>
        </Modal>
      )}

      {payOpen && (
        <Modal
          title={`Receive payment from ${customer.name}`}
          onClose={() => {
            setPayOpen(false)
            setPayResult(null)
          }}
        >
          {payResult ? (
            <div className="flex flex-col gap-3">
              <p className="rounded-lg bg-accent-bg p-3 text-sm text-accent-text">
                Payment recorded against {payResult.applied.length} bill{payResult.applied.length === 1 ? '' : 's'}.
              </p>
              <div className="flex flex-col divide-y divide-border text-sm">
                {payResult.applied.map((a) => (
                  <div key={a.invoice_no} className="flex justify-between py-1.5">
                    <span className="text-muted">{a.invoice_no}</span>
                    <span className="font-medium">{formatINR(a.amount)}</span>
                  </div>
                ))}
              </div>
              {payResult.leftOver > 0 && (
                <p className="rounded-lg bg-amber-50 p-3 text-xs text-amber-700 dark:bg-amber-950 dark:text-amber-300">
                  {formatINR(payResult.leftOver)} was more than this customer owed, so it wasn't recorded. Their khata is
                  now fully settled.
                </p>
              )}
              <Button
                onClick={() => {
                  setPayOpen(false)
                  setPayResult(null)
                }}
              >
                Done
              </Button>
            </div>
          ) : (
            <form onSubmit={handleReceivePayment} className="flex flex-col gap-4">
              <p className="text-sm text-muted">
                Pending right now: <span className="font-semibold text-red-600">{formatINR(totalPending)}</span>. Whatever
                you enter is applied to their oldest unpaid bills first.
              </p>
              <div>
                <Label htmlFor="pay-amount">Amount received</Label>
                <div className="flex items-center gap-2">
                  <Input
                    id="pay-amount"
                    type="text"
                    inputMode="decimal"
                    placeholder="0"
                    required
                    value={payForm.amount}
                    onChange={(e) => setPayForm({ ...payForm, amount: sanitizeDecimal(e.target.value) })}
                  />
                  <select
                    value={payForm.mode}
                    onChange={(e) => setPayForm({ ...payForm, mode: e.target.value as PaymentMode })}
                    className="h-10 shrink-0 rounded-lg border border-border bg-card px-2 text-sm outline-none focus:border-accent"
                  >
                    {PAYMENT_MODES.map((m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <Button type="submit" disabled={paying || !Number(payForm.amount)}>
                {paying ? 'Recording…' : 'Record payment'}
              </Button>
            </form>
          )}
        </Modal>
      )}
    </div>
  )
}
