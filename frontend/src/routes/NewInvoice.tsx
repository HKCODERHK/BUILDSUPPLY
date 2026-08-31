import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { Trash2, Plus, AlertTriangle } from 'lucide-react'
import { PageHeader } from '@/components/layout/PageHeader'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Modal } from '@/components/ui/modal'
import { AddCustomerModal } from '@/components/AddCustomerModal'
import { listCustomers, listCustomerBalances } from '@/services/customers'
import { listMaterials } from '@/services/materials'
import {
  createInvoice,
  updateInvoice,
  getInvoice,
  listInvoiceItems,
  listInvoices,
  lastBillForCustomer,
  lastRatesForCustomer,
  markInvoiceDelivered,
  type NewInvoiceItem,
  type LastRate,
} from '@/services/invoices'
import { recordPayment } from '@/services/payments'
import type { Customer, CustomerBalance, Invoice, Material, PaymentMode } from '@/lib/database.types'
import { useAuth } from '@/context/AuthContext'
import { useLanguage } from '@/context/LanguageContext'
import { usePin } from '@/context/PinContext'
import { sanitizeDigits, sanitizeDecimal } from '@/lib/numberInput'
import { cn } from '@/lib/utils'

const GST_RATE = 0.18
const PAYMENT_MODES: PaymentMode[] = ['Cash', 'UPI', 'Bank/Cheque']

interface LineItem extends NewInvoiceItem {
  key: string
  // True for the rows pre-filled from the supplier's own material list.
  // They start at qty 0 and are dropped on save unless a quantity is typed,
  // so billing is just "type the numbers" with no picking at all.
  preset?: boolean
}

interface SourceItem {
  material_id: string | null
  description: string
  qty: number
  rate: number
}

function formatINR(n: number) {
  return `₹${n.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`
}

function shortDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
}

/** Key a line uses to look up what this customer was last charged for it. */
function rateKey(item: { material_id: string | null; description: string }) {
  return item.material_id ?? `desc:${item.description.trim().toLowerCase()}`
}

/**
 * Lays out every material the supplier stocks, with quantities and rates
 * carried over from `source` (a bill being edited, or the last bill being
 * repeated). Anything in `source` that isn't in the material list any more
 * becomes a custom row so an edit can never silently drop a line.
 */
function buildLineItems(materials: Material[], source: SourceItem[]): LineItem[] {
  const known = new Map(materials.map((m) => [m.id, m]))
  const carried = new Map<string, SourceItem>()
  const extras: SourceItem[] = []
  for (const item of source) {
    if (item.material_id && known.has(item.material_id)) carried.set(item.material_id, item)
    else extras.push(item)
  }

  const presets: LineItem[] = materials.map((mat) => {
    const hit = carried.get(mat.id)
    return {
      key: crypto.randomUUID(),
      material_id: mat.id,
      description: mat.name,
      qty: hit ? Number(hit.qty) : 0,
      rate: hit ? Number(hit.rate) : mat.rate,
      preset: true,
    }
  })

  const customs: LineItem[] = extras.map((item) => ({
    key: crypto.randomUUID(),
    material_id: item.material_id,
    description: item.description,
    qty: Number(item.qty),
    rate: Number(item.rate),
  }))

  return [...presets, ...customs]
}

export default function NewInvoice() {
  const { supplier } = useAuth()
  const { t, mt } = useLanguage()
  const { confirmWithPin } = usePin()
  const navigate = useNavigate()
  // Present only on /invoices/:id/edit — the same screen, correcting a bill
  // that already exists rather than raising a new one.
  const { id: editingId } = useParams<{ id: string }>()
  const isEdit = !!editingId
  const [searchParams] = useSearchParams()

  const [customers, setCustomers] = useState<Customer[]>([])
  const [materials, setMaterials] = useState<Material[]>([])
  const [balances, setBalances] = useState<Record<string, CustomerBalance>>({})
  const [editingInvoice, setEditingInvoice] = useState<Invoice | null>(null)
  const [customerId, setCustomerId] = useState('')
  const [site, setSite] = useState('')
  const [knownSites, setKnownSites] = useState<string[]>([])
  const [items, setItems] = useState<LineItem[]>([])
  const [lastRates, setLastRates] = useState<Map<string, LastRate>>(new Map())
  // Starts on only for a GST-registered supplier. Anyone without a GST
  // number had to untick this on every single bill, and forgetting once
  // meant overcharging the customer 18% on a PDF already sent.
  const [gstApplicable, setGstApplicable] = useState(false)
  const gstDefaulted = useRef(false)
  const [transportLabour, setTransportLabour] = useState('')
  const [paidNow, setPaidNow] = useState('')
  const [paidMode, setPaidMode] = useState<PaymentMode>('Cash')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  // React state updates aren't synchronous, so a second click landing before
  // the re-render that disables the button would slip through `saving`
  // alone; this ref blocks re-entry immediately, in the same tick.
  const savingRef = useRef(false)
  const [deliveryPrompt, setDeliveryPrompt] = useState<{ id: string; invoice_no: string } | null>(null)
  const [confirmingDelivery, setConfirmingDelivery] = useState(false)
  const [addCustomerOpen, setAddCustomerOpen] = useState(false)

  useEffect(() => {
    let active = true
    async function load() {
      const [customerList, materialList, invoiceList, balanceList] = await Promise.all([
        listCustomers(),
        listMaterials(),
        listInvoices(),
        listCustomerBalances(),
      ])
      if (!active) return
      setCustomers(customerList)
      setMaterials(materialList)
      setBalances(Object.fromEntries(balanceList.map((b) => [b.customer_id, b])))
      // Sites already used before, offered as type-ahead suggestions so a
      // repeat site never has to be typed out twice.
      setKnownSites(
        Array.from(
          new Set([...invoiceList.map((i) => i.site), ...customerList.map((c) => c.site)].filter((s): s is string => !!s)),
        ).sort(),
      )

      if (isEdit && editingId) {
        const invoice = await getInvoice(editingId)
        const existingItems = await listInvoiceItems(editingId)
        if (!active) return
        setEditingInvoice(invoice)
        setCustomerId(invoice.customer_id ?? '')
        setSite(invoice.site ?? '')
        setGstApplicable(Number(invoice.gst_amount) > 0)
        gstDefaulted.current = true
        setTransportLabour(
          Number(invoice.transport_labour_charge) > 0 ? String(invoice.transport_labour_charge) : '',
        )
        setItems(buildLineItems(materialList, existingItems))
        setLoading(false)
        return
      }

      // "Repeat last bill" arrives here from the customer's profile with
      // their id and a flag; everything else starts blank.
      const preselect = searchParams.get('customer') ?? ''
      const repeat = searchParams.get('repeat') === '1'
      let source: SourceItem[] = []
      if (preselect && repeat) {
        const last = await lastBillForCustomer(preselect)
        if (!active) return
        if (last) {
          source = last.items
          setSite(last.invoice.site ?? '')
          setGstApplicable(Number(last.invoice.gst_amount) > 0)
          gstDefaulted.current = true
          if (Number(last.invoice.transport_labour_charge) > 0) {
            setTransportLabour(String(last.invoice.transport_labour_charge))
          }
        }
      }
      if (preselect) {
        setCustomerId(preselect)
        if (!repeat) setSite(customerList.find((c) => c.id === preselect)?.site ?? '')
      }
      setItems(buildLineItems(materialList, source))
      setLoading(false)
    }
    load()
    return () => {
      active = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editingId])

  useEffect(() => {
    if (supplier && !gstDefaulted.current) {
      gstDefaulted.current = true
      setGstApplicable(!!supplier.gst_number?.trim())
    }
  }, [supplier])

  // What this customer was actually charged last time. Every contractor is on
  // a different rate and the supplier keeps them in their head — this puts
  // the real number one tap away from the rate box.
  useEffect(() => {
    if (!customerId) {
      setLastRates(new Map())
      return
    }
    let active = true
    lastRatesForCustomer(customerId).then((rates) => {
      if (active) setLastRates(rates)
    })
    return () => {
      active = false
    }
  }, [customerId])

  // Picking a customer pre-fills their usual site; the supplier can type a
  // different one for this bill (a contractor runs several sites at once).
  function pickCustomer(id: string) {
    setCustomerId(id)
    setSite(customers.find((c) => c.id === id)?.site ?? '')
  }

  // A customer added here is saved to the customer list straight away, then
  // selected for this bill — no need to break off and go to Customers first.
  function handleCustomerCreated(customer: Customer) {
    setCustomers((prev) => [customer, ...prev])
    setCustomerId(customer.id)
    setSite(customer.site ?? '')
    setAddCustomerOpen(false)
  }

  function addItem() {
    setItems((prev) => [
      ...prev,
      { key: crypto.randomUUID(), material_id: null, description: '', qty: 1, rate: 0 },
    ])
  }

  function updateItem(key: string, patch: Partial<LineItem>) {
    setItems((prev) => prev.map((it) => (it.key === key ? { ...it, ...patch } : it)))
  }

  function removeItem(key: string) {
    setItems((prev) => prev.filter((it) => it.key !== key))
  }

  function pickMaterial(key: string, materialId: string) {
    const material = materials.find((m) => m.id === materialId)
    if (!material) return
    updateItem(key, { material_id: material.id, description: material.name, rate: material.rate })
  }

  // Only rows with a quantity actually go on the bill — the rest are just
  // the supplier's price list sitting there waiting to be used.
  const billedItems = items.filter((it) => it.qty > 0)

  const subtotal = billedItems.reduce((sum, it) => sum + it.qty * it.rate, 0)
  const gst = gstApplicable ? Math.round(subtotal * GST_RATE) : 0
  const transportLabourAmount = Number(transportLabour) || 0
  const total = subtotal + gst + transportLabourAmount
  const paidNowAmount = isEdit ? 0 : Number(paidNow) || 0
  const remaining = Math.max(0, total - paidNowAmount)

  const selectedCustomer = customers.find((c) => c.id === customerId) ?? null

  // Udhaar limit check. In edit mode the bill's current balance is already
  // inside `pending`, so it comes out before the new one goes in — otherwise
  // editing a bill would look like doubling the customer's outstanding.
  const creditLimit = selectedCustomer?.credit_limit != null ? Number(selectedCustomer.credit_limit) : null
  const currentPending = Number(balances[customerId]?.pending ?? 0)
  const alreadyOnThisBill = editingInvoice ? Math.max(0, Number(editingInvoice.total) - Number(editingInvoice.paid)) : 0
  const projectedPending =
    currentPending - alreadyOnThisBill + Math.max(0, total - (editingInvoice ? Number(editingInvoice.paid) : paidNowAmount))
  const overLimit = creditLimit != null && creditLimit > 0 && projectedPending > creditLimit
  const nearLimit =
    creditLimit != null && creditLimit > 0 && !overLimit && projectedPending >= creditLimit * 0.8 && total > 0

  async function handleSave() {
    if (!supplier || !customerId || billedItems.length === 0 || savingRef.current) return
    savingRef.current = true
    setSaving(true)
    setSaveError(null)
    try {
      const payload = billedItems.map(({ key: _key, preset: _preset, ...rest }) => rest)

      // Editing a saved bill rewrites its totals and moves stock; a large
      // payment taken at the counter is worth a second of confirmation.
      const threshold = Number(supplier.pin_payment_threshold) || 0
      const guard = isEdit
        ? t('pin.reasonEditBill')
        : threshold > 0 && paidNowAmount >= threshold
          ? t('pin.reasonLargePayment', { amount: formatINR(paidNowAmount) })
          : null
      if (guard && !(await confirmWithPin(guard))) {
        savingRef.current = false
        setSaving(false)
        return
      }

      if (isEdit && editingId) {
        await updateInvoice(editingId, {
          site,
          items: payload,
          gstApplicable,
          transportLabourCharge: transportLabourAmount,
        })
        navigate(`/invoices/${editingId}`)
        return
      }

      const invoice = await createInvoice(supplier.id, {
        customer_id: customerId,
        site,
        items: payload,
        gstApplicable,
        transportLabourCharge: transportLabourAmount,
      })
      if (paidNowAmount > 0) {
        await recordPayment(supplier.id, invoice.id, [{ amount: paidNowAmount, mode: paidMode }])
      }
      // Stock isn't touched yet — ask before deducting it, since billing and
      // delivery often happen at different times.
      setDeliveryPrompt({ id: invoice.id, invoice_no: invoice.invoice_no })
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Something went wrong. Please try again.')
    } finally {
      savingRef.current = false
      setSaving(false)
    }
  }

  async function respondToDeliveryPrompt(delivered: boolean) {
    if (!deliveryPrompt) return
    setConfirmingDelivery(true)
    try {
      if (delivered) await markInvoiceDelivered(deliveryPrompt.id)
      navigate(`/invoices/${deliveryPrompt.id}`)
    } finally {
      setConfirmingDelivery(false)
    }
  }

  /** Small tappable chip showing this customer's last agreed rate for a line. */
  function LastRateHint({ item }: { item: LineItem }) {
    const last = lastRates.get(rateKey(item))
    if (!last || Math.round(last.rate) === Math.round(item.rate)) return null
    return (
      <button
        type="button"
        title={t('inv.lastRateTitle')}
        onClick={() => updateItem(item.key, { rate: last.rate })}
        className="mt-0.5 rounded-full bg-surface px-2 py-0.5 text-[10px] font-medium text-muted hover:text-accent"
      >
        {t('inv.lastRate', { rate: formatINR(last.rate), date: shortDate(last.at) })}
      </button>
    )
  }

  if (loading) {
    return (
      <div>
        <PageHeader title={isEdit ? t('inv.editTitle') : t('inv.createTitle')} subtitle={t('common.loading')} />
      </div>
    )
  }

  if (isEdit && editingInvoice?.status === 'Cancelled') {
    return (
      <div>
        <PageHeader title={editingInvoice.invoice_no} subtitle={t('inv.cancelledBanner')} />
        <Card className="border-red-300 bg-red-50 dark:bg-red-950">
          <p className="text-sm font-semibold text-red-700 dark:text-red-300">{t('inv.cancelledBanner')}</p>
          <p className="mt-1 text-xs text-red-700/80 dark:text-red-300/80">{t('inv.cancelledDetail')}</p>
        </Card>
      </div>
    )
  }

  return (
    <div>
      <PageHeader
        title={isEdit ? `${t('inv.editTitle')} · ${editingInvoice?.invoice_no ?? ''}` : t('inv.createTitle')}
        subtitle={isEdit ? t('inv.editSubtitle') : t('inv.createSubtitle')}
      />

      <Card className="mb-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <div className="flex items-center justify-between">
              <Label htmlFor="customer" className="mb-1.5">
                {t('common.customer')}
              </Label>
              {!isEdit && (
                <button
                  type="button"
                  onClick={() => setAddCustomerOpen(true)}
                  className="-m-2 mb-0 p-2 text-xs font-semibold text-accent hover:text-accent-soft"
                >
                  {t('inv.newCustomer')}
                </button>
              )}
            </div>
            <select
              id="customer"
              value={customerId}
              disabled={isEdit}
              onChange={(e) => pickCustomer(e.target.value)}
              className="h-10 w-full rounded-lg border border-border bg-card px-3 text-sm outline-none focus:border-accent disabled:opacity-60"
            >
              <option value="">{t('inv.selectCustomer')}</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label htmlFor="site">{t('inv.sitePlace')}</Label>
            <Input
              id="site"
              list="known-sites"
              placeholder="e.g. Gachibowli Tower 2"
              value={site}
              onChange={(e) => setSite(e.target.value)}
            />
            <datalist id="known-sites">
              {knownSites.map((s) => (
                <option key={s} value={s} />
              ))}
            </datalist>
          </div>
        </div>
      </Card>

      {/* Udhaar limit is a warning, never a block — whether to give more
          credit is the supplier's call to make at the counter. */}
      {(overLimit || nearLimit) && selectedCustomer && creditLimit != null && (
        <div
          className={cn(
            'mb-4 flex items-start gap-2.5 rounded-xl border px-4 py-3',
            overLimit
              ? 'border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950'
              : 'border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950',
          )}
        >
          <AlertTriangle
            size={18}
            className={cn('mt-0.5 shrink-0', overLimit ? 'text-red-600 dark:text-red-400' : 'text-amber-600 dark:text-amber-400')}
          />
          <p
            className={cn(
              'text-sm font-medium',
              overLimit ? 'text-red-700 dark:text-red-300' : 'text-amber-700 dark:text-amber-300',
            )}
          >
            {t(overLimit ? 'cust.overLimit' : 'cust.nearLimit', {
              name: selectedCustomer.name,
              pending: formatINR(projectedPending),
              limit: formatINR(creditLimit),
            })}
          </p>
        </div>
      )}

      <Card className="mb-4">
        <div className="mb-1 flex items-center justify-between">
          <h3 className="text-sm font-semibold">{t('inv.items')}</h3>
          <Button size="sm" variant="outline" onClick={addItem}>
            <Plus size={14} /> {t('inv.addItem')}
          </Button>
        </div>
        <p className="mb-3 text-xs text-muted">
          {items.some((it) => it.preset)
            ? t('inv.itemsHint', { count: billedItems.length })
            : t('inv.itemsHintPlain')}
        </p>

        {items.length === 0 && <p className="text-sm text-muted">{t('inv.noMaterials')}</p>}

        <div className="flex flex-col gap-2">
          {items.map((item) =>
            item.preset ? (
              // Pre-filled from the material list: name is fixed, so only the
              // numbers are editable. Highlighted once it's actually on the bill.
              <div
                key={item.key}
                className={cn(
                  // On a phone the name gets its own full line and the two
                  // number fields sit under it. Squeezed into one row the name
                  // column was 104px and "Cement — UltraTech — PPC • 50 KG"
                  // truncated, so you were typing a quantity against a name
                  // you could not read. From sm up there is room for one row,
                  // and `sm:contents` lets the fields rejoin the outer grid.
                  'rounded-lg border border-border p-2.5 transition-colors',
                  'sm:grid sm:grid-cols-[minmax(0,1fr)_4.5rem_5.5rem] sm:items-center sm:gap-2',
                  item.qty > 0 && 'border-accent bg-accent-bg',
                )}
              >
                <div className="min-w-0">
                  <div className="text-sm font-medium text-ink sm:truncate">{mt(item.description)}</div>
                  <div className="text-xs text-muted">
                    {item.qty > 0 ? formatINR(item.qty * item.rate) : t('inv.notOnBill')}
                  </div>
                  <LastRateHint item={item} />
                </div>
                <div className="mt-2 grid grid-cols-2 gap-2 sm:mt-0 sm:contents">
                  <div>
                    <Label className="mb-0.5 text-[11px]">{t('common.qty')}</Label>
                    <Input
                      type="text"
                      inputMode="numeric"
                      value={item.qty}
                      onChange={(e) => updateItem(item.key, { qty: Number(sanitizeDigits(e.target.value)) || 0 })}
                    />
                  </div>
                  <div>
                    <Label className="mb-0.5 text-[11px]">{t('common.rate')} (₹)</Label>
                    <Input
                      type="text"
                      inputMode="decimal"
                      value={item.rate}
                      onChange={(e) => updateItem(item.key, { rate: Number(sanitizeDecimal(e.target.value)) || 0 })}
                    />
                  </div>
                </div>
              </div>
            ) : (
              <div key={item.key} className="grid grid-cols-1 gap-2 rounded-lg border border-border p-3 sm:grid-cols-[2fr_1fr_1fr_1fr_auto] sm:items-end">
                <div>
                  <Label>{t('inv.material')}</Label>
                  <select
                    value={item.material_id ?? ''}
                    onChange={(e) => (e.target.value ? pickMaterial(item.key, e.target.value) : updateItem(item.key, { material_id: null }))}
                    className="h-10 w-full rounded-lg border border-border bg-card px-3 text-sm outline-none focus:border-accent"
                  >
                    <option value="">{t('inv.customMaterial')}</option>
                    {materials.map((m) => (
                      <option key={m.id} value={m.id}>
                        {mt(m.name)}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <Label>{t('inv.description')}</Label>
                  <Input value={item.description} onChange={(e) => updateItem(item.key, { description: e.target.value })} />
                </div>
                <div>
                  <Label>{t('common.qty')}</Label>
                  <Input
                    type="text"
                    inputMode="numeric"
                    value={item.qty}
                    onChange={(e) => updateItem(item.key, { qty: Number(sanitizeDigits(e.target.value)) || 0 })}
                  />
                </div>
                <div>
                  <Label>{t('common.rate')} (₹)</Label>
                  <Input
                    type="text"
                    inputMode="decimal"
                    value={item.rate}
                    onChange={(e) => updateItem(item.key, { rate: Number(sanitizeDecimal(e.target.value)) || 0 })}
                  />
                  <LastRateHint item={item} />
                </div>
                <button onClick={() => removeItem(item.key)} className="text-muted hover:text-red-600" aria-label="Remove item">
                  <Trash2 size={16} />
                </button>
              </div>
            ),
          )}
        </div>
      </Card>

      <Card className="mb-4">
        <label className="mb-3 flex items-center gap-2 text-sm">
          <input type="checkbox" checked={gstApplicable} onChange={(e) => setGstApplicable(e.target.checked)} />
          {t('inv.applyGst')}
        </label>
        <div className="mb-3">
          <Label htmlFor="transport-labour">{t('inv.transportLabour')}</Label>
          <Input
            id="transport-labour"
            type="text"
            inputMode="decimal"
            placeholder="0"
            value={transportLabour}
            onChange={(e) => setTransportLabour(sanitizeDecimal(e.target.value))}
          />
        </div>
        <div className="flex flex-col gap-1.5 text-sm">
          <div className="flex justify-between">
            <span className="text-muted">{t('inv.subtotal')}</span>
            <span>₹{subtotal.toLocaleString('en-IN')}</span>
          </div>
          {gstApplicable && (
            <div className="flex justify-between">
              <span className="text-muted">{t('inv.gst')}</span>
              <span>₹{gst.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</span>
            </div>
          )}
          {transportLabourAmount > 0 && (
            <div className="flex justify-between">
              <span className="text-muted">{t('inv.transportLabourShort')}</span>
              <span>₹{transportLabourAmount.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</span>
            </div>
          )}
          <div className="mt-1 flex justify-between border-t border-border pt-2 text-base font-bold">
            <span>{t('common.total')}</span>
            <span>₹{total.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</span>
          </div>
        </div>
      </Card>

      {/* Money is only collected when raising a bill. On an edit the payments
          already recorded stay exactly as they are — see updateInvoice. */}
      {!isEdit && (
        <Card className="mb-4">
          <h3 className="mb-3 text-sm font-semibold">{t('inv.paymentNow')}</h3>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="paid-now">{t('inv.amountGiven')}</Label>
              <Input
                id="paid-now"
                type="text"
                inputMode="decimal"
                placeholder="0"
                value={paidNow}
                onChange={(e) => setPaidNow(sanitizeDecimal(e.target.value))}
              />
            </div>
            <div>
              <Label htmlFor="paid-mode">{t('common.mode')}</Label>
              <select
                id="paid-mode"
                disabled={paidNowAmount <= 0}
                value={paidMode}
                onChange={(e) => setPaidMode(e.target.value as PaymentMode)}
                className="h-10 w-full rounded-lg border border-border bg-card px-3 text-sm outline-none focus:border-accent disabled:opacity-50"
              >
                {PAYMENT_MODES.map((m) => (
                  <option key={m} value={m}>
                    {t(`mode.${m}`)}
                  </option>
                ))}
              </select>
            </div>
          </div>
          {paidNowAmount > 0 && (
            <div className="mt-3 flex justify-between border-t border-border pt-3 text-sm">
              <span className="text-muted">{t('inv.remainingAfter')}</span>
              <span className="font-semibold text-red-600">₹{remaining.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</span>
            </div>
          )}
        </Card>
      )}

      {saveError && (
        <p className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">{saveError}</p>
      )}

      <Button onClick={handleSave} disabled={saving || !customerId || billedItems.length === 0} className="w-full sm:w-auto">
        {saving ? t('common.saving') : isEdit ? t('inv.saveEdit') : t('inv.save')}
      </Button>

      {addCustomerOpen && supplier && (
        <AddCustomerModal
          supplierId={supplier.id}
          onClose={() => setAddCustomerOpen(false)}
          onCreated={handleCustomerCreated}
        />
      )}

      {deliveryPrompt && (
        <Modal title={t('inv.delivery')} onClose={() => respondToDeliveryPrompt(false)}>
          <p className="mb-4 text-sm text-ink">{t('inv.deliveryAsk', { no: deliveryPrompt.invoice_no })}</p>
          <p className="mb-4 text-xs text-muted">{t('inv.deliveryHint')}</p>
          <div className="flex gap-2">
            <Button className="flex-1" disabled={confirmingDelivery} onClick={() => respondToDeliveryPrompt(true)}>
              {t('inv.deliveredYes')}
            </Button>
            <Button variant="outline" className="flex-1" disabled={confirmingDelivery} onClick={() => respondToDeliveryPrompt(false)}>
              {t('inv.deliveredNot')}
            </Button>
          </div>
        </Modal>
      )}
    </div>
  )
}
