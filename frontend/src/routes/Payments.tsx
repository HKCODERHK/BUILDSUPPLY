import { useEffect, useState, type FormEvent } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Plus, Trash2 } from 'lucide-react'
import { PageHeader } from '@/components/layout/PageHeader'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Modal } from '@/components/ui/modal'
import { WhatsAppIcon } from '@/components/icons/WhatsAppIcon'
import { EmptyState } from '@/components/EmptyState'
import { SuccessHeader } from '@/components/SuccessTick'
import { listPayments, recordPayment, type PaymentWithInvoice } from '@/services/payments'
import { listInvoices, type InvoiceWithCustomer } from '@/services/invoices'
import { openWhatsAppShare } from '@/lib/whatsapp'
import type { PaymentMode } from '@/lib/database.types'
import { useAuth } from '@/context/AuthContext'
import { useLanguage } from '@/context/LanguageContext'
import { ShowMore } from '@/components/ShowMore'
import { usePin } from '@/context/PinContext'
import { sanitizeDecimal } from '@/lib/numberInput'
import { TruckLoader } from '@/components/TruckLoader'

const PAGE_SIZE = 25

function formatINR(n: number) {
  return `₹${n.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`
}

// Same three modes the billing screen offers — "Wallet" was dropped: it was
// never used once, and there is no wallet/advance feature for it to mean
// anything.
const MODES: PaymentMode[] = ['Cash', 'UPI', 'Bank/Cheque']

interface Split {
  key: string
  amount: string
  mode: PaymentMode
}

// What the receipt needs to say, captured at the moment of recording.
interface Receipt {
  customerName: string
  phone: string | null
  amount: number
  mode: PaymentMode
  balance: number
  /** Offered but refused, because the bill did not owe that much. */
  leftOver: number
}

export default function Payments() {
  const { supplier } = useAuth()
  const { t } = useLanguage()
  const { confirmWithPin } = usePin()
  const [payments, setPayments] = useState<PaymentWithInvoice[]>([])
  const [allInvoices, setAllInvoices] = useState<InvoiceWithCustomer[]>([])
  const [openInvoices, setOpenInvoices] = useState<InvoiceWithCustomer[]>([])
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [invoiceId, setInvoiceId] = useState('')
  const [splits, setSplits] = useState<Split[]>([{ key: crypto.randomUUID(), amount: '', mode: 'Cash' }])
  const [saving, setSaving] = useState(false)
  const [receipt, setReceipt] = useState<Receipt | null>(null)
  const [shown, setShown] = useState(PAGE_SIZE)
  const [searchParams, setSearchParams] = useSearchParams()

  useEffect(() => {
    if (searchParams.get('new') === '1') {
      setModalOpen(true)
      setSearchParams({}, { replace: true })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function refresh() {
    const [paymentList, invoiceList] = await Promise.all([listPayments(), listInvoices()])
    setPayments(paymentList)
    setAllInvoices(invoiceList)
    setOpenInvoices(invoiceList.filter((i) => i.status !== 'Paid' && i.status !== 'Cancelled'))
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

  const totalEntered = splits.reduce((sum, s) => sum + (Number(s.amount) || 0), 0)

  function closeModal() {
    setModalOpen(false)
    setReceipt(null)
    setInvoiceId('')
    setSplits([{ key: crypto.randomUUID(), amount: '', mode: 'Cash' }])
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!supplier || !invoiceId) return
    const invoice = openInvoices.find((i) => i.id === invoiceId)
    const threshold = Number(supplier.pin_payment_threshold) || 0
    if (threshold > 0 && totalEntered >= threshold) {
      if (!(await confirmWithPin(t('pin.reasonLargePayment', { amount: formatINR(totalEntered) })))) return
    }
    setSaving(true)
    try {
      const result = await recordPayment(
        supplier.id,
        invoiceId,
        splits.map((s) => ({ amount: Number(s.amount) || 0, mode: s.mode })),
      )
      await refresh()

      // What this customer still owes across every bill, worked out from the
      // list as it was before the refresh plus the amount just taken — the
      // customer wants their khata balance, not this one bill's.
      if (invoice?.customer_id) {
        const owedBefore = allInvoices
          .filter((i) => i.customer_id === invoice.customer_id && i.status !== 'Cancelled')
          .reduce((sum, i) => sum + (Number(i.total) - Number(i.paid)), 0)
        setReceipt({
          customerName: invoice.customers?.name ?? '',
          phone: invoice.customers?.phone ?? null,
          amount: result.applied,
          // The common case is one mode; a split payment names the first.
          mode: splits.find((s) => Number(s.amount) > 0)?.mode ?? 'Cash',
          balance: Math.max(0, owedBefore - result.applied),
          leftOver: result.leftOver,
        })
      } else {
        closeModal()
      }
    } finally {
      setSaving(false)
    }
  }

  // A written acknowledgement, sent the moment the money changes hands.
  function sendReceipt() {
    if (!receipt) return
    const balanceLine =
      receipt.balance > 0 ? t('pay.receiptBalance', { amount: formatINR(receipt.balance) }) : t('pay.receiptSettled')
    openWhatsAppShare(
      receipt.phone,
      t('pay.receiptMessage', {
        amount: formatINR(receipt.amount),
        mode: t(`mode.${receipt.mode}`),
        date: new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }),
        balance: balanceLine,
      }),
    )
  }

  return (
    <div>
      <PageHeader
        title={t('pay.title')}
        subtitle={t('pay.subtitle')}
        // Dropped while the list is empty — the empty state below carries the
        // action, and two buttons for it on one screen looks unfinished.
        action={
          payments.length > 0 ? (
            <Button onClick={() => setModalOpen(true)}>
              <Plus size={16} /> {t('pay.record')}
            </Button>
          ) : undefined
        }
      />

      {loading ? (
        <TruckLoader />
      ) : payments.length === 0 ? (
        <EmptyState
          art="payments"
          title={t('empty.paymentsTitle')}
          hint={t('empty.paymentsHint')}
          // A payment is always recorded against a bill, so with nothing
          // outstanding the Record button opens a modal whose only dropdown is
          // empty — a dead end on the very first screen a new supplier opens.
          // Send them to make a bill instead; the payment follows from it.
          action={
            openInvoices.length > 0 ? (
              <Button onClick={() => setModalOpen(true)}>
                <Plus size={16} /> {t('pay.record')}
              </Button>
            ) : (
              <Link to="/invoices/new">
                <Button>
                  <Plus size={16} /> {t('inv.new')}
                </Button>
              </Link>
            )
          }
        />
      ) : (
        <Card>
          <div className="flex flex-col divide-y divide-border">
            {payments.slice(0, shown).map((p) => (
              <div key={p.id} className="flex items-center justify-between py-2.5 text-sm">
                <div>
                  <div className="font-medium text-ink">{p.invoices?.invoice_no ?? '—'}</div>
                  <div className="text-xs text-muted">{p.invoices?.customers?.name ?? '—'}</div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge tone="neutral">{t(`mode.${p.mode}`)}</Badge>
                  <span className="font-semibold">{formatINR(p.amount)}</span>
                </div>
              </div>
            ))}
          </div>
          <ShowMore
            shown={Math.min(shown, payments.length)}
            total={payments.length}
            onMore={() => setShown((n) => n + PAGE_SIZE)}
          />
        </Card>
      )}

      {modalOpen && (
        <Modal title={t('pay.record')} onClose={closeModal}>
          {receipt ? (
            <div className="flex flex-col gap-3">
              {receipt.amount > 0 && (
                <SuccessHeader
                  title={t('pay.receivedAmount', { amount: formatINR(receipt.amount) })}
                  detail={[t(`mode.${receipt.mode}`), receipt.customerName].filter(Boolean).join(' · ')}
                />
              )}
              <div className="flex justify-between border-t border-border pt-3 text-sm">
                <span className="text-muted">{t('common.pending')}</span>
                <span className={`font-semibold ${receipt.balance > 0 ? 'text-red-600' : 'text-accent'}`}>
                  {receipt.balance > 0 ? formatINR(receipt.balance) : t('cust.settled')}
                </span>
              </div>
              {receipt.leftOver > 0 && (
                <p className="rounded-lg bg-amber-50 p-3 text-xs text-amber-700 dark:bg-amber-950 dark:text-amber-300">
                  {t('pay.leftOverBill', { amount: formatINR(receipt.leftOver) })}
                </p>
              )}
              {receipt.phone && (
                <Button variant="outline" onClick={sendReceipt}>
                  <WhatsAppIcon size={16} /> {t('pay.sendReceipt')}
                </Button>
              )}
              <Button onClick={closeModal}>{t('common.done')}</Button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              <div>
                <Label htmlFor="invoice">{t('pay.invoice')}</Label>
                <select
                  id="invoice"
                  required
                  value={invoiceId}
                  onChange={(e) => setInvoiceId(e.target.value)}
                  className="h-10 w-full rounded-lg border border-border bg-card px-3 text-sm outline-none focus:border-accent"
                >
                  <option value="">{t('pay.selectInvoice')}</option>
                  {openInvoices.map((inv) => (
                    <option key={inv.id} value={inv.id}>
                      {inv.invoice_no} — {inv.customers?.name} ({formatINR(inv.total - inv.paid)})
                    </option>
                  ))}
                </select>
              </div>

              {/* The common case is one amount in one mode, so that's all the
                  form shows. Splitting across modes is real but rare, so it
                  stays behind a link rather than greeting every payment. */}
              {splits.map((s, i) => (
                <div key={s.key}>
                  <div className="flex items-center justify-between">
                    <Label className="mb-1.5">{i === 0 ? t('pay.amountReceived') : t('pay.alsoPaidBy')}</Label>
                    {i > 0 && (
                      <button
                        type="button"
                        onClick={() => removeSplit(s.key)}
                        className="mb-1.5 text-muted hover:text-red-600"
                        aria-label="Remove this part"
                      >
                        <Trash2 size={15} />
                      </button>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <Input
                      type="text"
                      inputMode="decimal"
                      placeholder="0"
                      value={s.amount}
                      onChange={(e) => updateSplit(s.key, { amount: sanitizeDecimal(e.target.value) })}
                    />
                    <select
                      value={s.mode}
                      onChange={(e) => updateSplit(s.key, { mode: e.target.value as PaymentMode })}
                      className="h-10 shrink-0 rounded-lg border border-border bg-card px-2 text-sm outline-none focus:border-accent"
                    >
                      {MODES.map((m) => (
                        <option key={m} value={m}>
                          {t(`mode.${m}`)}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              ))}

              <button type="button" onClick={addSplit} className="self-start text-xs font-semibold text-accent-text hover:text-accent">
                {t('pay.addSplit')}
              </button>

              {totalEntered > 0 && (
                <div className="flex justify-between border-t border-border pt-3 text-sm">
                  <span className="text-muted">{t('pay.totalRecording')}</span>
                  <span className="font-semibold text-ink">{formatINR(totalEntered)}</span>
                </div>
              )}

              <Button type="submit" disabled={saving || !invoiceId || totalEntered <= 0}>
                {saving ? t('pay.recording') : t('pay.record')}
              </Button>
            </form>
          )}
        </Modal>
      )}
    </div>
  )
}
