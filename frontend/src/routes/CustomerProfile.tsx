import { useEffect, useState, type FormEvent } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { Pencil, IndianRupee, RotateCcw, Plus } from 'lucide-react'
import { PageHeader } from '@/components/layout/PageHeader'
import { Card, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Modal } from '@/components/ui/modal'
import { ActionMenu } from '@/components/ui/action-menu'
import { WhatsAppIcon } from '@/components/icons/WhatsAppIcon'
import { getCustomer, updateCustomer } from '@/services/customers'
import { recordCustomerPayment, type KhataPaymentResult } from '@/services/payments'
import { supabase } from '@/lib/supabase'
import { openWhatsAppShare } from '@/lib/whatsapp'
import { sanitizeDecimal } from '@/lib/numberInput'
import { oldestPendingDays, overdueTextClass } from '@/lib/overdue'
import { useAuth } from '@/context/AuthContext'
import { useLanguage } from '@/context/LanguageContext'
import { usePin } from '@/context/PinContext'
import type { Customer, Invoice, PaymentMode } from '@/lib/database.types'

const PAYMENT_MODES: PaymentMode[] = ['Cash', 'UPI', 'Bank/Cheque']

function formatINR(n: number) {
  return `₹${n.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`
}

export default function CustomerProfile() {
  const { id } = useParams<{ id: string }>()
  const { supplier } = useAuth()
  const { t } = useLanguage()
  const { confirmWithPin } = usePin()
  const navigate = useNavigate()
  const [customer, setCustomer] = useState<Customer | null>(null)
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [loading, setLoading] = useState(true)
  const [editOpen, setEditOpen] = useState(false)
  const [editForm, setEditForm] = useState({ name: '', phone: '', site: '', address: '', credit_limit: '' })
  const [editError, setEditError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [payOpen, setPayOpen] = useState(false)
  const [payForm, setPayForm] = useState<{ amount: string; mode: PaymentMode }>({ amount: '', mode: 'Cash' })
  const [paying, setPaying] = useState(false)
  const [payResult, setPayResult] = useState<KhataPaymentResult | null>(null)
  // Everything the receipt needs, captured at the moment the money is
  // recorded. The balance in particular is worked out here rather than read
  // off the page: refreshing the invoice list is a round trip, and a
  // supplier who taps "send receipt" straight away would otherwise send the
  // customer the balance from *before* the payment they just made.
  const [paidSummary, setPaidSummary] = useState<{ amount: number; mode: PaymentMode; balance: number } | null>(null)

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
    const threshold = Number(supplier.pin_payment_threshold) || 0
    if (threshold > 0 && amount >= threshold) {
      if (!(await confirmWithPin(t('pin.reasonLargePayment', { amount: formatINR(amount) })))) return
    }
    setPaying(true)
    try {
      const owedBefore = invoices
        .filter((i) => i.status !== 'Cancelled')
        .reduce((sum, i) => sum + (Number(i.total) - Number(i.paid)), 0)
      const result = await recordCustomerPayment(supplier.id, id, amount, payForm.mode)
      const applied = result.applied.reduce((sum, a) => sum + a.amount, 0)
      setPayResult(result)
      setPaidSummary({ amount: applied, mode: payForm.mode, balance: Math.max(0, owedBefore - applied) })
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
    setEditForm({
      name: customer.name,
      phone: customer.phone ?? '',
      site: customer.site ?? '',
      address: customer.address ?? '',
      credit_limit: customer.credit_limit != null ? String(customer.credit_limit) : '',
    })
    setEditError(null)
    setEditOpen(true)
  }

  async function handleEditSubmit(e: FormEvent) {
    e.preventDefault()
    if (!customer) return
    if (editForm.phone && editForm.phone.length !== 10) {
      setEditError(t('error.phone10'))
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
        credit_limit: editForm.credit_limit ? Number(editForm.credit_limit) : null,
      })
      setEditOpen(false)
      await refresh()
    } catch (err) {
      setEditError(err instanceof Error ? err.message : t('error.generic'))
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <p className="text-sm text-muted">{t('common.loading')}</p>
  if (!customer) return <p className="text-sm text-muted">{t('cust.notFound')}</p>

  // Cancelled bills stay visible in the khata list below, but never count
  // towards what the customer owes.
  const liveInvoices = invoices.filter((i) => i.status !== 'Cancelled')
  const totalPending = liveInvoices.reduce((sum, i) => sum + (Number(i.total) - Number(i.paid)), 0)
  const pendingDays = oldestPendingDays(invoices)

  const creditLimit = customer.credit_limit != null ? Number(customer.credit_limit) : null

  // Receipt sent right after money is taken. Kills the "maine to paise de
  // diye the" argument later, because the customer has it in writing.
  function sendReceipt() {
    if (!customer || !paidSummary) return
    const balanceLine =
      paidSummary.balance > 0 ? t('pay.receiptBalance', { amount: formatINR(paidSummary.balance) }) : t('pay.receiptSettled')
    const message = t('pay.receiptMessage', {
      amount: formatINR(paidSummary.amount),
      mode: t(`mode.${paidSummary.mode}`),
      date: new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }),
      balance: balanceLine,
    })
    openWhatsAppShare(customer.phone, message)
  }

  // Sites come off this customer's own bills now, so a contractor can see
  // what each of their sites has run up and still owes.
  const siteBreakdown = Array.from(
    liveInvoices
      .reduce((map, inv) => {
        const key = inv.site?.trim() || t('cust.noSite')
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
        subtitle={t('cust.profileSubtitle')}
        action={
          // Taking money is why this page gets opened, and repeating last
          // week's bill is the other reason. Editing and chasing are rarer.
          // Three actions on a 375px screen came to 354px against 343px of
          // room, so the ⋯ was clipped off the right edge and unreachable
          // without scrolling sideways. The two named buttons drop a size on
          // phones — 310px, comfortably inside — and go back to full size from
          // sm up, where there was never a shortage of room. flex-wrap is the
          // backstop: if a label ever grows, these move to a second line
          // instead of pushing ⋯ out of reach again.
          <div className="flex flex-wrap items-center gap-2">
            {totalPending > 0 && (
              <Button size="sm" className="sm:h-10 sm:px-4 sm:text-sm" onClick={() => setPayOpen(true)}>
                <IndianRupee size={16} /> {t('cust.receivePayment')}
              </Button>
            )}
            {/* Billing this customer used to mean leaving for Invoices, then
                New, then picking them again from the dropdown. */}
            <Button
              size="sm"
              variant="outline"
              className="sm:h-10 sm:px-4 sm:text-sm"
              onClick={() => navigate(`/invoices/new?customer=${customer.id}`)}
            >
              <Plus size={16} /> {t('inv.new')}
            </Button>
            <ActionMenu
              items={[
                // Repeating last week's bill is a shortcut for the button
                // above, so it sits directly under it rather than beside it.
                ...(liveInvoices.length > 0
                  ? [
                      {
                        label: t('cust.repeatBill'),
                        icon: <RotateCcw size={15} />,
                        onSelect: () => navigate(`/invoices/new?customer=${customer.id}&repeat=1`),
                      },
                    ]
                  : []),
                { label: t('common.edit'), icon: <Pencil size={15} />, onSelect: openEdit },
                {
                  label: t('cust.remind'),
                  icon: <WhatsAppIcon size={15} />,
                  disabled: !customer.phone,
                  onSelect: () =>
                    openWhatsAppShare(
                      customer.phone,
                      `Hi ${customer.name}, your pending balance with us is ${formatINR(totalPending)}. Please clear it at your earliest convenience.`,
                    ),
                },
              ]}
            />
          </div>
        }
      />

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <div className="text-xs font-medium text-muted">{t('common.phone')}</div>
          {customer.phone ? (
            <a href={`tel:${customer.phone}`} className="mt-1 block text-sm font-semibold text-accent hover:underline">
              {customer.phone}
            </a>
          ) : (
            <div className="mt-1 text-sm font-semibold">—</div>
          )}
        </Card>
        <Card>
          <div className="text-xs font-medium text-muted">{t('common.address')}</div>
          <div className="mt-1 text-sm font-semibold">{customer.address ?? '—'}</div>
        </Card>
        {creditLimit != null ? (
          <Card>
            <div className="text-xs font-medium text-muted">{t('cust.creditLimitShort')}</div>
            <div
              className={`mt-1 text-sm font-semibold ${totalPending > creditLimit ? 'text-red-600' : 'text-ink'}`}
            >
              {formatINR(totalPending)} / {formatINR(creditLimit)}
            </div>
          </Card>
        ) : (
          <Card>
            <div className="text-xs font-medium text-muted">{t('common.status')}</div>
            <Badge tone={customer.status === 'Active' ? 'success' : 'neutral'} className="mt-1">
              {t(customer.status === 'Active' ? 'status.Active' : 'status.Inactive')}
            </Badge>
          </Card>
        )}
        <Card>
          <div className="text-xs font-medium text-muted">{t('common.pending')}</div>
          <div className="mt-1 text-sm font-semibold text-red-600">{formatINR(totalPending)}</div>
          {/* The age is what makes someone actually chase the money. */}
          {pendingDays !== null && (
            <div className={`mt-0.5 text-xs font-medium ${overdueTextClass(pendingDays)}`}>
              {pendingDays === 0
                ? t('overdue.today')
                : pendingDays === 1
                  ? t('overdue.oneDay')
                  : t('overdue.days', { days: pendingDays })}
            </div>
          )}
        </Card>
      </div>

      {/* Only worth showing for a contractor running more than one site —
          for everyone else it just repeats the totals above. */}
      {siteBreakdown.length > 1 && (
        <Card className="mb-4">
          <CardHeader>
            <CardTitle>{t('cust.bySite')}</CardTitle>
          </CardHeader>
          <div className="flex flex-col divide-y divide-border">
            {siteBreakdown.map(([siteName, v]) => (
              <div key={siteName} className="flex items-center justify-between py-2 text-sm">
                <div>
                  <div className="font-medium text-ink">{siteName}</div>
                  <div className="text-xs text-muted">{t('cust.billed', { amount: formatINR(v.billed) })}</div>
                </div>
                <span className={`font-semibold ${v.pending > 0 ? 'text-red-600' : 'text-accent'}`}>
                  {v.pending > 0 ? formatINR(v.pending) : t('cust.settled')}
                </span>
              </div>
            ))}
          </div>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>{t('cust.khata')}</CardTitle>
        </CardHeader>
        <div className="flex flex-col divide-y divide-border">
          {invoices.length === 0 && <p className="py-3 text-sm text-muted">{t('cust.noInvoices')}</p>}
          {invoices.map((inv) => (
            <Link
              key={inv.id}
              to={`/invoices/${inv.id}`}
              className="flex items-center justify-between py-2.5 text-sm hover:text-accent"
            >
              <span>{inv.invoice_no}</span>
              <span className="font-semibold">{formatINR(inv.total)}</span>
              <Badge tone={inv.status === 'Paid' ? 'success' : inv.status === 'Partial' ? 'warning' : 'danger'}>
                {t(`status.${inv.status}`)}
              </Badge>
            </Link>
          ))}
        </div>
      </Card>

      {editOpen && (
        <Modal title={t('cust.editTitle')} onClose={() => setEditOpen(false)}>
          <form onSubmit={handleEditSubmit} className="flex flex-col gap-4">
            {editError && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">{editError}</p>}
            <div>
              <Label htmlFor="edit-name" required>{t('common.name')}</Label>
              <Input
                id="edit-name"
                required
                value={editForm.name}
                onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
              />
            </div>
            <div>
              <Label htmlFor="edit-phone">{t('common.phone')}</Label>
              <Input
                id="edit-phone"
                inputMode="numeric"
                placeholder={t('cust.phoneHint')}
                value={editForm.phone}
                onChange={(e) => setEditForm({ ...editForm, phone: e.target.value.replace(/\D/g, '').slice(0, 10) })}
              />
            </div>
            <div>
              <Label htmlFor="edit-site">{t('cust.usualSite')}</Label>
              <Input id="edit-site" value={editForm.site} onChange={(e) => setEditForm({ ...editForm, site: e.target.value })} />
            </div>
            <div>
              <Label htmlFor="edit-address">{t('common.address')}</Label>
              <Input
                id="edit-address"
                value={editForm.address}
                onChange={(e) => setEditForm({ ...editForm, address: e.target.value })}
              />
            </div>
            <div>
              <Label htmlFor="edit-credit-limit">{t('cust.creditLimit')}</Label>
              <Input
                id="edit-credit-limit"
                type="text"
                inputMode="decimal"
                placeholder="0"
                value={editForm.credit_limit}
                onChange={(e) => setEditForm({ ...editForm, credit_limit: sanitizeDecimal(e.target.value) })}
              />
              <p className="mt-1.5 text-xs text-muted">{t('cust.creditLimitHint')}</p>
            </div>
            <Button type="submit" disabled={saving}>
              {saving ? t('common.saving') : t('cust.saveChanges')}
            </Button>
          </form>
        </Modal>
      )}

      {payOpen && (
        <Modal
          title={`${t('cust.receivePayment')} — ${customer.name}`}
          onClose={() => {
            setPayOpen(false)
            setPayResult(null)
            setPaidSummary(null)
          }}
        >
          {payResult ? (
            <div className="flex flex-col gap-3">
              <p className="rounded-lg bg-accent-bg p-3 text-sm text-accent-text">
                {t('pay.appliedTo', { count: payResult.applied.length })}
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
                  {t('pay.leftOver', { amount: formatINR(payResult.leftOver) })}
                </p>
              )}
              {customer.phone && paidSummary && paidSummary.amount > 0 && (
                <Button variant="outline" onClick={sendReceipt}>
                  <WhatsAppIcon size={16} /> {t('pay.sendReceipt')}
                </Button>
              )}
              <Button
                onClick={() => {
                  setPayOpen(false)
                  setPayResult(null)
                  setPaidSummary(null)
                }}
              >
                {t('common.done')}
              </Button>
            </div>
          ) : (
            <form onSubmit={handleReceivePayment} className="flex flex-col gap-4">
              <p className="text-sm text-muted">{t('pay.pendingNow', { amount: formatINR(totalPending) })}</p>
              <div>
                <Label htmlFor="pay-amount">{t('pay.amountReceived')}</Label>
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
                        {t(`mode.${m}`)}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <Button type="submit" disabled={paying || !Number(payForm.amount)}>
                {paying ? t('pay.recording') : t('pay.record')}
              </Button>
            </form>
          )}
        </Modal>
      )}
    </div>
  )
}
