import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
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
import { CustomerAvatar } from '@/components/CustomerAvatar'
import { SuccessHeader } from '@/components/SuccessTick'
import {
  activeAllocations,
  listPayments,
  recordPayment,
  type AppliedPart,
  type PaymentWithInvoice,
} from '@/services/payments'
import { isBill, listInvoices, type InvoiceWithCustomer } from '@/services/invoices'
import { newRequestId } from '@/services/db'
import { receiptPdfFile } from '@/lib/receiptPdf'
import { shareDocumentOnWhatsApp } from '@/lib/shareDocument'
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

// What the receipt needs to say, captured at the moment of recording —
// straight from the database's answer, never worked out from the list.
interface Receipt {
  customerName: string
  customerAddress: string | null
  phone: string | null
  /** Everything received: onto bills, and into advance. */
  amount: number
  mode: PaymentMode
  /** What the customer still owes after this, across every bill. */
  balance: number
  /** What this payment kept as advance, beyond everything they owed. */
  advance: number
  /** The customer's whole advance after this. */
  advanceBalance: number
  /** The bills the money went onto — the receipt PDF names them. */
  appliedTo: AppliedPart[]
}

export default function Payments() {
  const { supplier } = useAuth()
  const { t } = useLanguage()
  const { confirmWithPin } = usePin()
  const [payments, setPayments] = useState<PaymentWithInvoice[]>([])
  const [openInvoices, setOpenInvoices] = useState<InvoiceWithCustomer[]>([])
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [invoiceId, setInvoiceId] = useState('')
  const [splits, setSplits] = useState<Split[]>([{ key: crypto.randomUUID(), amount: '', mode: 'Cash' }])
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  // A second tap in the same tick, before `saving` disables the button —
  // and the id makes the database record the payment once even if both
  // requests get out. Renewed each time the dialog closes.
  const submittingRef = useRef(false)
  const requestId = useRef(newRequestId())
  const [receipt, setReceipt] = useState<Receipt | null>(null)
  const [sendingReceipt, setSendingReceipt] = useState(false)
  const [shown, setShown] = useState(PAGE_SIZE)
  const [searchParams, setSearchParams] = useSearchParams()
  const navigate = useNavigate()
  // Receive payment starts with "Who paid?" and hands over to that customer's
  // own Receive payment — oldest bills first, extra kept as advance — so money
  // is taken one way everywhere. Paying one particular bill stays one tap away.
  const [step, setStep] = useState<'who' | 'bill'>('who')

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
    // Opening balances included: old udhaar can be paid off here too.
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

  // "Who paid?": everyone who owes something, largest first — from the bills
  // already loaded, so it costs no extra request.
  const owing = Array.from(
    openInvoices
      .reduce((map, inv) => {
        if (!inv.customer_id) return map
        const cur = map.get(inv.customer_id) ?? { id: inv.customer_id, name: inv.customers?.name ?? '—', due: 0 }
        cur.due += Number(inv.total) - Number(inv.paid)
        return map.set(inv.customer_id, cur)
      }, new Map<string, { id: string; name: string; due: number }>())
      .values(),
  )
    .filter((c) => c.due > 0.005)
    .sort((a, b) => b.due - a.due)

  function closeModal() {
    setModalOpen(false)
    setReceipt(null)
    setSaveError(null)
    setInvoiceId('')
    setSplits([{ key: crypto.randomUUID(), amount: '', mode: 'Cash' }])
    setStep('who')
    requestId.current = newRequestId()
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!supplier || !invoiceId || submittingRef.current) return
    const invoice = openInvoices.find((i) => i.id === invoiceId)
    submittingRef.current = true
    try {
      const threshold = Number(supplier.pin_payment_threshold) || 0
      if (threshold > 0 && totalEntered >= threshold) {
        if (!(await confirmWithPin(t('pin.reasonLargePayment', { amount: formatINR(totalEntered) })))) return
      }
      setSaving(true)
      setSaveError(null)
      // The bill first, then the customer's older bills, then advance — all
      // in one step in the database (record_payment, migration 024).
      const result = await recordPayment(
        requestId.current,
        invoiceId,
        splits.map((s) => ({ amount: Number(s.amount) || 0, mode: s.mode })),
      )
      await refresh()

      if (invoice?.customer_id) {
        setReceipt({
          customerName: invoice.customers?.name ?? '',
          customerAddress: invoice.customers?.address ?? null,
          phone: invoice.customers?.phone ?? null,
          amount: result.applied.reduce((sum, a) => sum + a.amount, 0) + result.advance,
          // The common case is one mode; a split payment names the first.
          mode: splits.find((s) => Number(s.amount) > 0)?.mode ?? 'Cash',
          balance: result.pending,
          advance: result.advance,
          advanceBalance: result.advanceBalance,
          appliedTo: result.applied,
        })
      } else {
        closeModal()
      }
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : t('error.generic'))
    } finally {
      submittingRef.current = false
      setSaving(false)
    }
  }

  // A written acknowledgement, sent the moment the money changes hands — as
  // a receipt PDF, which holds up later in a way a chat message doesn't.
  async function sendReceipt() {
    if (!supplier || !receipt) return
    const balanceLine =
      receipt.balance > 0
        ? t('pay.receiptBalance', { amount: formatINR(receipt.balance) })
        : receipt.advanceBalance > 0
          ? t('pay.receiptAdvance', { amount: formatINR(receipt.advanceBalance) })
          : t('pay.receiptSettled')
    setSendingReceipt(true)
    try {
      const file = await receiptPdfFile(
        supplier,
        { name: receipt.customerName, address: receipt.customerAddress, phone: receipt.phone },
        {
          amount: receipt.amount,
          mode: receipt.mode,
          balance: receipt.balance,
          appliedTo: receipt.appliedTo,
          advance: receipt.advance,
          advanceBalance: receipt.advanceBalance,
        },
      )
      await shareDocumentOnWhatsApp({
        file,
        message: t('pay.receiptMessage', {
          amount: formatINR(receipt.amount),
          mode: t(`mode.${receipt.mode}`),
          date: new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }),
          balance: balanceLine,
        }),
        title: 'Payment receipt',
      })
    } finally {
      setSendingReceipt(false)
    }
  }

  /** What a payment went onto: a bill number, the opening balance, or advance. */
  function paymentLabel(p: PaymentWithInvoice) {
    const onBills = activeAllocations(p)
    if (onBills.length === 0) return t('pay.advance')
    if (onBills.length > 1) return t('pay.nBills', { n: String(onBills.length) })
    const only = onBills[0].invoices
    return only && !isBill(only) ? t('cust.openingBalance') : (only?.invoice_no ?? '—')
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
              <Plus size={16} /> {t('cust.receivePayment')}
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
          // A payment here is always recorded against a bill, so with nothing
          // outstanding the Record button opens a modal whose only dropdown is
          // empty — a dead end on the very first screen a new supplier opens.
          // Send them to make a bill instead; the payment follows from it.
          action={
            openInvoices.length > 0 ? (
              <Button onClick={() => setModalOpen(true)}>
                <Plus size={16} /> {t('cust.receivePayment')}
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
                  <div className={`font-medium ${activeAllocations(p).length ? 'text-ink' : 'text-accent'}`}>{paymentLabel(p)}</div>
                  <div className="text-xs text-muted">{p.customers?.name ?? '—'}</div>
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
        <Modal title={step === 'who' && !receipt ? t('cust.receivePayment') : t('pay.record')} onClose={closeModal}>
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
              {receipt.advance > 0 && (
                <p className="rounded-lg bg-accent-bg p-3 text-xs font-medium text-accent-text">
                  {t('pay.keptAsAdvance', { amount: formatINR(receipt.advance) })}
                </p>
              )}
              {receipt.phone && (
                <Button variant="outline" onClick={sendReceipt} disabled={sendingReceipt}>
                  <WhatsAppIcon size={16} /> {sendingReceipt ? t('common.preparing') : t('pay.sendReceipt')}
                </Button>
              )}
              <Button onClick={closeModal}>{t('common.done')}</Button>
            </div>
          ) : step === 'who' ? (
            <div className="flex flex-col gap-3">
              <div>
                <div className="text-sm font-medium text-ink">{t('pay.whoPaid')}</div>
                <p className="mt-0.5 text-xs text-muted">{t('pay.whoPaidHint')}</p>
              </div>
              {/* A tappable list with each customer's initials, not a dropdown:
                  one tap on the customer opens their own Receive payment. It
                  opens a new screen from inside a dialog, so `replace` — see
                  modal.tsx. */}
              {owing.length === 0 ? (
                <p className="text-sm text-muted">{t('pay.nobodyOwes')}</p>
              ) : (
                <div className="-mx-2 max-h-[50vh] overflow-y-auto">
                  {owing.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => navigate(`/customers/${c.id}?pay=1`, { replace: true, state: { customerName: c.name } })}
                      className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left hover:bg-surface active:bg-surface"
                    >
                      <CustomerAvatar id={c.id} name={c.name} size={36} />
                      <span className="min-w-0 flex-1 text-sm font-medium text-ink">{c.name}</span>
                      <span className="shrink-0 text-sm font-semibold text-red-600">{formatINR(c.due)}</span>
                    </button>
                  ))}
                </div>
              )}
              <button
                type="button"
                onClick={() => setStep('bill')}
                className="self-start text-xs font-semibold text-accent-text hover:text-accent"
              >
                {t('pay.forOneBill')}
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              {saveError && (
                <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">{saveError}</p>
              )}
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
                      {isBill(inv) ? inv.invoice_no : t('cust.openingBalance')} — {inv.customers?.name} (
                      {formatINR(inv.total - inv.paid)})
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
