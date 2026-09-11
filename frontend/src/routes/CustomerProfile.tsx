import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { Pencil, IndianRupee, RotateCcw, Plus, HandCoins, BookOpen } from 'lucide-react'
import { PageHeader } from '@/components/layout/PageHeader'
import { Card, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Modal } from '@/components/ui/modal'
import { ActionMenu } from '@/components/ui/action-menu'
import { WhatsAppIcon } from '@/components/icons/WhatsAppIcon'
import { SuccessHeader } from '@/components/SuccessTick'
import { getCustomer, getCustomerBalance, setOpeningBalance, updateCustomer } from '@/services/customers'
import { listPaymentsForCustomer, recordAdvance, recordCustomerPayment, type PaymentResult } from '@/services/payments'
import { isBill, listInvoicesForCustomer } from '@/services/invoices'
import { logActivity } from '@/services/activityLog'
import { newRequestId } from '@/services/db'
import { buildCustomerLedger } from '@/lib/customerLedger'
import { customerLedgerPdfFile, downloadCustomerLedgerPdf } from '@/lib/customerLedgerPdf'
import { receiptPdfFile } from '@/lib/receiptPdf'
import { shareDocumentOnWhatsApp } from '@/lib/shareDocument'
import { sanitizeDecimal } from '@/lib/numberInput'
import { oldestPendingDays, overdueTextClass } from '@/lib/overdue'
import { useAuth } from '@/context/AuthContext'
import { useLanguage } from '@/context/LanguageContext'
import { usePin } from '@/context/PinContext'
import type { Customer, Invoice, PaymentMode } from '@/lib/database.types'
import { TruckLoader } from '@/components/TruckLoader'

const PAYMENT_MODES: PaymentMode[] = ['Cash', 'UPI', 'Bank/Cheque']

// The name every opening balance row carries (set_opening_balance).
const OPENING_REF = 'Opening balance'

function formatINR(n: number) {
  return `₹${n.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`
}

// Everything this page shows, in one go: the customer, their bills and
// opening balance, and the advance they hold.
async function loadCustomer(customerId: string) {
  const [customer, invoices, balance] = await Promise.all([
    getCustomer(customerId),
    listInvoicesForCustomer(customerId),
    getCustomerBalance(customerId),
  ])
  return { customer, invoices, advance: Number(balance?.advance ?? 0) }
}

export default function CustomerProfile() {
  const { id } = useParams<{ id: string }>()
  const { supplier } = useAuth()
  const { t } = useLanguage()
  const { confirmWithPin } = usePin()
  const navigate = useNavigate()
  const [customer, setCustomer] = useState<Customer | null>(null)
  const [invoices, setInvoices] = useState<Invoice[]>([])
  // Money they paid ahead, waiting for their next bill (migration 024).
  const [advance, setAdvance] = useState(0)
  const [loading, setLoading] = useState(true)
  const [editOpen, setEditOpen] = useState(false)
  const [editForm, setEditForm] = useState({
    name: '',
    phone: '',
    site: '',
    address: '',
    credit_limit: '',
    opening: '',
  })
  const [editError, setEditError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [payOpen, setPayOpen] = useState(false)
  const [payForm, setPayForm] = useState<{ amount: string; mode: PaymentMode }>({ amount: '', mode: 'Cash' })
  const [paying, setPaying] = useState(false)
  const [payError, setPayError] = useState<string | null>(null)
  // A double tap lands twice before `paying` re-renders the button disabled;
  // this blocks the second in the same tick, and the id below makes the
  // database record it once even if two requests do get out (INV-1024).
  const payingRef = useRef(false)
  const payRequestId = useRef(newRequestId())
  const [payResult, setPayResult] = useState<PaymentResult | null>(null)
  // Fixed when the dialog opens, so it doesn't change its words the moment
  // the money is recorded: with nothing owed, what they hand over is advance.
  const [payKind, setPayKind] = useState<'payment' | 'advance'>('payment')
  // Everything the receipt needs, captured at the moment the money is
  // recorded — straight from the database's answer, so a supplier who taps
  // "send receipt" at once never sends a balance from before the payment.
  const [paidSummary, setPaidSummary] = useState<{
    amount: number
    mode: PaymentMode
    balance: number
    advance: number
    advanceBalance: number
  } | null>(null)
  const [sharing, setSharing] = useState<'receipt' | 'statement' | 'ledger' | null>(null)

  async function refresh() {
    if (!id) return
    const data = await loadCustomer(id)
    setCustomer(data.customer)
    setInvoices(data.invoices)
    setAdvance(data.advance)
  }

  // Applied to the oldest unpaid bills automatically — the supplier just
  // enters what the customer handed over. Anything beyond what they owe is
  // kept as advance rather than turned away.
  async function handleReceivePayment(e: FormEvent) {
    e.preventDefault()
    if (!supplier || !id || payingRef.current) return
    const amount = Number(payForm.amount)
    if (!amount || amount <= 0) return
    payingRef.current = true
    try {
      const threshold = Number(supplier.pin_payment_threshold) || 0
      if (threshold > 0 && amount >= threshold) {
        if (!(await confirmWithPin(t('pin.reasonLargePayment', { amount: formatINR(amount) })))) return
      }
      setPaying(true)
      setPayError(null)
      const result =
        payKind === 'advance'
          ? await recordAdvance(payRequestId.current, id, amount, payForm.mode)
          : await recordCustomerPayment(payRequestId.current, id, amount, payForm.mode)
      const received = result.applied.reduce((sum, a) => sum + a.amount, 0) + result.advance
      setPayResult(result)
      setPaidSummary({
        amount: received,
        mode: payForm.mode,
        balance: result.pending,
        advance: result.advance,
        advanceBalance: result.advanceBalance,
      })
      setPayForm({ amount: '', mode: 'Cash' })
      await refresh()
    } catch (err) {
      setPayError(err instanceof Error ? err.message : t('error.generic'))
    } finally {
      payingRef.current = false
      setPaying(false)
    }
  }

  function closePay() {
    setPayOpen(false)
    setPayResult(null)
    setPaidSummary(null)
    setPayError(null)
    // The next payment is a new one.
    payRequestId.current = newRequestId()
  }

  useEffect(() => {
    if (!id) return
    let active = true
    loadCustomer(id).then((data) => {
      if (!active) return
      setCustomer(data.customer)
      setInvoices(data.invoices)
      setAdvance(data.advance)
      setLoading(false)
    })
    return () => {
      active = false
    }
  }, [id])

  // The live one — a replaced opening balance stays on record, cancelled.
  const openingRow = invoices.find((i) => !isBill(i) && i.status !== 'Cancelled') ?? null

  function openEdit() {
    if (!customer) return
    setEditForm({
      name: customer.name,
      phone: customer.phone ?? '',
      site: customer.site ?? '',
      address: customer.address ?? '',
      credit_limit: customer.credit_limit != null ? String(customer.credit_limit) : '',
      opening: openingRow ? String(Number(openingRow.total)) : '',
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
    const newOpening = Number(editForm.opening) || 0
    const openingChanged = newOpening !== (openingRow ? Number(openingRow.total) : 0)
    // Changing an old balance rewrites what they owe — the owner's call.
    if (openingChanged && openingRow && !(await confirmWithPin(t('pin.reasonOpeningBalance')))) return
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
      // The database keeps the date the balance already had.
      if (openingChanged) await setOpeningBalance(customer.id, newOpening)
      setEditOpen(false)
      await refresh()
    } catch (err) {
      setEditError(err instanceof Error ? err.message : t('error.generic'))
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <TruckLoader />
  if (!customer) return <p className="text-sm text-muted">{t('cust.notFound')}</p>

  // Cancelled bills stay visible in the khata list below, but never count
  // towards what the customer owes. The opening balance does count.
  const liveInvoices = invoices.filter((i) => i.status !== 'Cancelled')
  const liveBills = liveInvoices.filter(isBill)
  const totalPending = liveInvoices.reduce((sum, i) => sum + (Number(i.total) - Number(i.paid)), 0)
  const pendingDays = oldestPendingDays(invoices)

  const creditLimit = customer.credit_limit != null ? Number(customer.credit_limit) : null

  // Two doors into the same dialog: a payment against what they owe, or an
  // advance kept for their next bill.
  function openPay(kind: 'payment' | 'advance') {
    setPayKind(kind)
    setPayOpen(true)
  }

  /** A bill number as the supplier reads it; the opening balance by name. */
  function billLabel(no: string) {
    return no === OPENING_REF ? t('cust.openingBalance') : no
  }

  // Receipt sent right after money is taken. Kills the "maine to paise de
  // diye the" argument later, because the customer has it in writing — as a
  // receipt PDF naming the bills it cleared, not just a chat message.
  async function sendReceipt() {
    if (!supplier || !customer || !paidSummary) return
    const balanceLine =
      paidSummary.balance > 0
        ? t('pay.receiptBalance', { amount: formatINR(paidSummary.balance) })
        : paidSummary.advanceBalance > 0
          ? t('pay.receiptAdvance', { amount: formatINR(paidSummary.advanceBalance) })
          : t('pay.receiptSettled')
    const message = t('pay.receiptMessage', {
      amount: formatINR(paidSummary.amount),
      mode: t(`mode.${paidSummary.mode}`),
      date: new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }),
      balance: balanceLine,
    })
    setSharing('receipt')
    try {
      const file = await receiptPdfFile(supplier, customer, {
        amount: paidSummary.amount,
        mode: paidSummary.mode,
        balance: paidSummary.balance,
        appliedTo: payResult?.applied ?? [],
        advance: paidSummary.advance,
        advanceBalance: paidSummary.advanceBalance,
      })
      await shareDocumentOnWhatsApp({
        file,
        message,
        title: 'Payment receipt',
      })
    } finally {
      setSharing(null)
    }
  }

  // This customer's whole record as a statement — every bill, every payment,
  // the opening balance and any advance. Only their own rows are read,
  // however large the business gets.
  async function loadLedger(c: Customer) {
    const [customerInvoices, customerPayments] = await Promise.all([
      listInvoicesForCustomer(c.id),
      listPaymentsForCustomer(c.id),
    ])
    return buildCustomerLedger({ customerId: c.id, invoices: customerInvoices, payments: customerPayments })
  }

  // The Ledger quick action: the complete record as a PDF.
  async function downloadLedger() {
    if (!supplier || !customer) return
    setSharing('ledger')
    try {
      await downloadCustomerLedgerPdf(supplier, customer, await loadLedger(customer))
      void logActivity('supplier', 'report_exported', { details: { report: 'Customer Ledger', format: 'pdf' } })
    } finally {
      setSharing(null)
    }
  }

  // ...and its WhatsApp icon: the same PDF, sent as a real attachment.
  async function shareLedger() {
    if (!supplier || !customer) return
    setSharing('ledger')
    try {
      const ledger = await loadLedger(customer)
      // The statement's own last line: owed, in credit, or square.
      const closing = ledger.entries.length ? ledger.entries[ledger.entries.length - 1].balance : ledger.openingBalance
      const outcome = await shareDocumentOnWhatsApp({
        file: await customerLedgerPdfFile(supplier, customer, ledger),
        message:
          `Hi ${customer.name}, here is your account statement. ` +
          (closing > 0
            ? `Closing balance: ${formatINR(closing)}.`
            : closing < 0
              ? `Advance with us: ${formatINR(-closing)}.`
              : 'Your account is fully settled. Thank you!'),
        title: `Statement — ${customer.name}`,
      })
      if (outcome === 'shared') {
        void logActivity('supplier', 'report_shared', { details: { report: 'Customer Ledger', format: 'pdf_share' } })
      }
    } finally {
      setSharing(null)
    }
  }

  // The full statement Reminders sends — every bill and every payment — so
  // the customer is chased with the record, not a number to argue with.
  async function sendStatement() {
    if (!supplier || !customer) return
    setSharing('statement')
    try {
      const ledger = await loadLedger(customer)
      const file = await customerLedgerPdfFile(supplier, customer, ledger)
      const outcome = await shareDocumentOnWhatsApp({
        file,
        message:
          `Hi ${customer.name}, your pending balance with us is ${formatINR(totalPending)}. ` +
          `The attached statement shows every bill and payment. Please clear it at your earliest convenience.`,
        title: `Statement — ${customer.name}`,
      })
      if (outcome === 'shared') {
        void logActivity('supplier', 'reminder_sent', { details: { customer: customer.name, format: 'pdf_share' } })
      }
    } finally {
      setSharing(null)
    }
  }

  // Sites come off this customer's own bills now, so a contractor can see
  // what each of their sites has run up and still owes. The opening balance
  // belongs to no site, so it stays out — the Pending card already counts it.
  const siteBreakdown = Array.from(
    liveInvoices
      .filter(isBill)
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
          <div className="flex flex-col items-start gap-2">
            <div className="flex flex-wrap items-center gap-2">
              {/* Money against what they owe: the oldest bills first, and
                  anything beyond them is kept as advance. */}
              <Button size="sm" className="sm:h-10 sm:px-4 sm:text-sm" onClick={() => openPay('payment')}>
                <IndianRupee size={16} /> {t('cust.receivePayment')}
              </Button>
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
                ...(liveBills.length > 0
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
                  label: sharing === 'statement' ? t('common.preparing') : t('cust.remind'),
                  icon: <WhatsAppIcon size={15} />,
                  disabled: !customer.phone || sharing !== null,
                  onSelect: sendStatement,
                },
              ]}
            />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {/* Just below Receive payment: money handed over for their NEXT
                  bill, kept apart from anything they already owe. */}
              <Button size="sm" variant="outline" className="sm:h-10 sm:px-4 sm:text-sm" onClick={() => openPay('advance')}>
                <HandCoins size={16} /> {t('cust.receiveAdvance')}
              </Button>
              {/* The customer's whole record in one tap, joined to a small
                  WhatsApp icon that sends the same PDF. */}
              <div className="flex items-center">
                <Button
                  size="sm"
                  variant="outline"
                  className="rounded-r-none sm:h-10 sm:px-4 sm:text-sm"
                  disabled={sharing !== null}
                  onClick={downloadLedger}
                >
                  <BookOpen size={16} /> {sharing === 'ledger' ? t('common.preparing') : t('cust.ledger')}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="-ml-px rounded-l-none px-2.5 text-accent sm:h-10"
                  disabled={sharing !== null}
                  onClick={shareLedger}
                  aria-label={t('cust.ledgerShare')}
                  title={t('cust.ledgerShare')}
                >
                  <WhatsAppIcon size={16} />
                </Button>
              </div>
            </div>
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
          {/* Paid ahead — their next bill uses it up automatically. */}
          {advance > 0 && (
            <div className="mt-1 text-xs font-semibold text-accent">{t('cust.advanceAmount', { amount: formatINR(advance) })}</div>
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
          {/* A replaced opening balance stays on record but not on screen. */}
          {invoices.filter((inv) => isBill(inv) || inv.status !== 'Cancelled').map((inv) =>
            isBill(inv) ? (
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
            ) : (
              // Not a bill to open — it is changed from Edit, above.
              <div key={inv.id} className="flex items-center justify-between py-2.5 text-sm">
                <span>{t('cust.openingBalance')}</span>
                <span className="font-semibold">{formatINR(inv.total)}</span>
                <Badge tone={inv.status === 'Paid' ? 'success' : inv.status === 'Partial' ? 'warning' : 'danger'}>
                  {t(`status.${inv.status}`)}
                </Badge>
              </div>
            ),
          )}
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
            <div>
              <Label htmlFor="edit-opening">{t('cust.openingField')}</Label>
              <Input
                id="edit-opening"
                type="text"
                inputMode="decimal"
                placeholder="0"
                value={editForm.opening}
                onChange={(e) => setEditForm({ ...editForm, opening: sanitizeDecimal(e.target.value) })}
              />
              <p className="mt-1.5 text-xs text-muted">{t('cust.openingHint')}</p>
            </div>
            <Button type="submit" disabled={saving}>
              {saving ? t('common.saving') : t('cust.saveChanges')}
            </Button>
          </form>
        </Modal>
      )}

      {payOpen && (
        <Modal
          title={`${payKind === 'advance' ? t('cust.receiveAdvance') : t('cust.receivePayment')} — ${customer.name}`}
          onClose={closePay}
        >
          {payResult ? (
            <div className="flex flex-col gap-3">
              {paidSummary && paidSummary.amount > 0 && (
                <SuccessHeader
                  title={
                    payKind === 'advance'
                      ? t('pay.advanceReceived', { amount: formatINR(paidSummary.amount) })
                      : t('pay.receivedAmount', { amount: formatINR(paidSummary.amount) })
                  }
                  detail={t(`mode.${paidSummary.mode}`)}
                />
              )}
              {payResult.applied.length > 0 && (
                <>
                  <p className="border-t border-border pt-3 text-xs text-muted">
                    {t('pay.appliedTo', { count: payResult.applied.length })}
                  </p>
                  <div className="flex flex-col divide-y divide-border text-sm">
                    {payResult.applied.map((a) => (
                      <div key={`${a.invoice_id}-${a.amount}`} className="flex justify-between py-1.5">
                        <span className="text-muted">{billLabel(a.invoice_no)}</span>
                        <span className="font-medium">{formatINR(a.amount)}</span>
                      </div>
                    ))}
                  </div>
                </>
              )}
              {payResult.advance > 0 && (
                <p className="rounded-lg bg-accent-bg p-3 text-xs font-medium text-accent-text">
                  {payKind === 'advance' && payResult.applied.length === 0
                    ? t('pay.advanceHeldNow', { amount: formatINR(payResult.advanceBalance) })
                    : t('pay.keptAsAdvance', { amount: formatINR(payResult.advance) })}
                </p>
              )}
              {customer.phone && paidSummary && paidSummary.amount > 0 && (
                <Button variant="outline" onClick={sendReceipt} disabled={sharing === 'receipt'}>
                  <WhatsAppIcon size={16} /> {sharing === 'receipt' ? t('common.preparing') : t('pay.sendReceipt')}
                </Button>
              )}
              <Button onClick={closePay}>{t('common.done')}</Button>
            </div>
          ) : (
            <form onSubmit={handleReceivePayment} className="flex flex-col gap-4">
              <p className="text-sm text-muted">
                {payKind === 'advance'
                  ? totalPending > 0
                    ? t('pay.advanceIntroOwed', { amount: formatINR(totalPending) })
                    : advance > 0
                      ? t('pay.advanceIntroHeld', { amount: formatINR(advance) })
                      : t('pay.advanceIntro')
                  : t('pay.pendingNow', { amount: formatINR(totalPending) })}
              </p>
              {payError && (
                <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">{payError}</p>
              )}
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
                {paying ? t('pay.recording') : payKind === 'advance' ? t('pay.recordAdvance') : t('pay.record')}
              </Button>
            </form>
          )}
        </Modal>
      )}
    </div>
  )
}
