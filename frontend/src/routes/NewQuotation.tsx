import { useEffect, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Trash2, Plus } from 'lucide-react'
import { PageHeader } from '@/components/layout/PageHeader'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { AddCustomerModal } from '@/components/AddCustomerModal'
import { UnsavedChangesGuard } from '@/components/UnsavedChangesGuard'
import { DraftPrompt } from '@/components/Drafts'
import { clearDraft, readDraft, useDraftAutosave, type BillDraft, type SavedDraft } from '@/lib/drafts'
import { listCustomers } from '@/services/customers'
import { listMaterials } from '@/services/materials'
import { createQuotation } from '@/services/quotations'
import { approveOrder, getOrder } from '@/services/orders'
import type { OrderRequest } from '@/lib/database.types'
import { listKnownSites, type NewInvoiceItem } from '@/services/invoices'
import { newRequestId } from '@/services/db'
import type { Customer, Material } from '@/lib/database.types'
import { useAuth } from '@/context/AuthContext'
import { useLanguage } from '@/context/LanguageContext'
import { sanitizeDigits, sanitizeDecimal } from '@/lib/numberInput'
import { formatRate, gstSlabs, taxLines } from '@/lib/gst'
import { recordAdvance } from '@/services/payments'
import { usePin } from '@/context/PinContext'
import type { PaymentMode } from '@/lib/database.types'


interface LineItem extends NewInvoiceItem {
  key: string
}

// A near-mirror of NewInvoice.tsx's item editor — same materials/qty/rate/GST/
// transport-labour flow — but an estimate never takes payment and never
// touches stock, so those two sections and the post-save delivery prompt are
// deliberately absent here.

const PAYMENT_MODES: PaymentMode[] = ['Cash', 'UPI', 'Bank/Cheque']

function formatINR(n: number) {
  return `₹${n.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`
}
export default function NewQuotation() {
  const { supplier } = useAuth()
  const { t, mt } = useLanguage()
  const { confirmWithPin } = usePin()
  const navigate = useNavigate()
  const [customers, setCustomers] = useState<Customer[]>([])
  const [materials, setMaterials] = useState<Material[]>([])
  const [customerId, setCustomerId] = useState('')
  const [site, setSite] = useState('')
  const [knownSites, setKnownSites] = useState<string[]>([])
  const [items, setItems] = useState<LineItem[]>([])
  // Defaults from whether the supplier is GST-registered — see NewInvoice.
  const [gstApplicable, setGstApplicable] = useState(false)
  // Money taken while the estimate is written (asked for 2026-09-22). An
  // estimate is not a bill, so there is nothing for it to pay off: it is kept
  // as this customer's advance and the bill uses it by itself when it is made
  // (_apply_advance, migration 024). Its own request id, so a retry after the
  // estimate saved records it once.
  const [takingAdvance, setTakingAdvance] = useState(false)
  const [advanceNow, setAdvanceNow] = useState('')
  const [advanceMode, setAdvanceMode] = useState<PaymentMode>('Cash')
  const advanceRequestIdRef = useRef(newRequestId())
  const gstDefaulted = useRef(false)
  const [transportLabour, setTransportLabour] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const savingRef = useRef(false)
  // One id for this estimate — a retry returns it rather than a second one.
  const requestIdRef = useRef(newRequestId())
  const [addCustomerOpen, setAddCustomerOpen] = useState(false)
  const [searchParams] = useSearchParams()
  // Until the lists arrive there is nothing to back up, and a draft could not
  // yet be matched to its customer or materials.
  const [loaded, setLoaded] = useState(false)
  // An estimate left unfinished last time, waiting on Continue or Discard.
  const [pendingDraft, setPendingDraft] = useState<SavedDraft | null>(null)
  // Approving an online order (?order=<id>): the estimate starts from the
  // customer's request at today's rates, and saving it approves the order.
  const orderId = searchParams.get('order')
  const [order, setOrder] = useState<OrderRequest | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)

  useEffect(() => {
    Promise.all([
      listCustomers(),
      listMaterials(),
      listKnownSites(),
      orderId ? getOrder(orderId).catch(() => null) : Promise.resolve(null),
    ]).then(([c, m, siteList, fromOrder]) => {
      setCustomers(c)
      setMaterials(m)
      setKnownSites(Array.from(new Set([...siteList, ...c.map((x) => x.site)].filter((s): s is string => !!s))).sort())
      if (fromOrder) {
        // An order already priced, or rejected: show the order, never a second
        // estimate. An order approved on the spot (037) has no estimate yet,
        // and this screen is exactly where it gets one.
        const priced = !!fromOrder.quotation_id
        if (priced || (fromOrder.status !== 'pending' && fromOrder.status !== 'approved')) {
          navigate(`/orders/${fromOrder.id}`, { replace: true })
          return
        }
        applyOrder(fromOrder, m, c)
      } else {
        // An estimate left unfinished last time — see NewInvoice.
        const draft = supplier ? readDraft(supplier.id, 'quotation') : null
        if (draft) {
          if (searchParams.get('draft') === '1') applyDraft(draft, m, c)
          else setPendingDraft(draft)
        }
      }
      setLoaded(true)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Picking a customer pre-fills their usual site; it stays editable so one
  // contractor can have separate estimates per site.
  useEffect(() => {
    if (supplier && !gstDefaulted.current) {
      gstDefaulted.current = true
      setGstApplicable(!!supplier.gst_number?.trim())
    }
  }, [supplier])

  /** Puts a stored draft back into the form; see NewInvoice. */
  function applyDraft(d: BillDraft, materialList: Material[], customerList: Customer[]) {
    const known = new Set(materialList.map((mat) => mat.id))
    setCustomerId(customerList.some((cust) => cust.id === d.customerId) ? d.customerId : '')
    setSite(d.site)
    setItems(
      d.items.map((it) => ({
        ...it,
        material_id: it.material_id && known.has(it.material_id) ? it.material_id : null,
        key: crypto.randomUUID(),
      })),
    )
    gstDefaulted.current = true
    setGstApplicable(d.gstApplicable)
    setTransportLabour(d.transportLabour)
  }

  /**
   * An online order into the form: the customer who has that phone number
   * (or none — they are added only when this saves), their site, and each
   * line at the supplier's rate today. Nothing the customer sent sets a price.
   */
  function applyOrder(o: OrderRequest, materialList: Material[], customerList: Customer[]) {
    setOrder(o)
    const match = customerList.find((cust) => cust.phone === o.phone)
    setCustomerId(match?.id ?? '')
    setSite(o.site ?? match?.site ?? '')
    const byId = new Map(materialList.map((mat) => [mat.id, mat]))
    setItems(
      o.items.map((it) => {
        const mat = byId.get(it.material_id)
        return {
          key: crypto.randomUUID(),
          material_id: mat ? mat.id : null,
          description: mat ? mat.name : it.name,
          qty: Number(it.qty),
          rate: mat ? Number(mat.rate) : 0,
        }
      }),
    )
  }

  function pickCustomer(id: string) {
    setCustomerId(id)
    setSite(customers.find((c) => c.id === id)?.site ?? '')
  }

  function handleCustomerCreated(customer: Customer) {
    setCustomers((prev) => [customer, ...prev])
    setCustomerId(customer.id)
    setSite(customer.site ?? '')
    setAddCustomerOpen(false)
  }

  function addItem() {
    setItems((prev) => [...prev, { key: crypto.randomUUID(), material_id: null, description: '', qty: 1, rate: 0 }])
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

  const subtotal = items.reduce((sum, it) => sum + it.qty * it.rate, 0)
  // Each line at its own material's percentage (035), as on a bill.
  const taxed = taxLines(items, materials, gstApplicable)
  const gst = taxed.reduce((sum, line) => sum + line.gst, 0)
  const gstByRate = gstSlabs(
    taxed.map((line) => ({ amount: line.amount, gst_rate: line.rate, gst_amount: line.gst })),
  )
  const advanceAmount = takingAdvance ? Number(advanceNow) || 0 : 0
  // The order's number, if the shop already has it. Without one the estimate
  // creates the customer under the name they typed.
  const phoneMatch = order ? (customers.find((c) => c.phone === order.phone) ?? null) : null
  const transportLabourAmount = Number(transportLabour) || 0
  const total = subtotal + gst + transportLabourAmount

  const draftSnapshot: BillDraft | null =
    !saved && items.length > 0
      ? {
          customerId,
          customerName: customers.find((cust) => cust.id === customerId)?.name ?? '',
          site,
          items: items.map(({ material_id, description, qty, rate }) => ({ material_id, description, qty, rate })),
          gstApplicable,
          transportLabour,
          total,
        }
      : null
  // Not for an order: it has its own record to come back to.
  useDraftAutosave(supplier?.id, 'quotation', draftSnapshot, loaded && !pendingDraft && !order)

  /**
   * Keeps money handed over while the estimate was written. It is recorded as
   * the customer's advance, never against this estimate: an estimate is not a
   * bill, and 024's `record_advance` is deliberately only used by bills made
   * after it — it never quietly clears somebody's old dues.
   *
   * Its own request id, so pressing Save again after the estimate saved but
   * this did not records it once and not twice; the estimate's own save is
   * idempotent the same way.
   */
  async function takeAdvance(cid: string | null) {
    if (advanceAmount <= 0 || !cid || !supplier) return
    const threshold = Number(supplier.pin_payment_threshold) || 0
    if (threshold > 0 && advanceAmount >= threshold) {
      if (!(await confirmWithPin(t('pin.reasonLargePayment', { amount: formatINR(advanceAmount) })))) {
        throw new Error(t('est.advanceNotRecorded'))
      }
    }
    try {
      await recordAdvance(advanceRequestIdRef.current, cid, advanceAmount, advanceMode)
    } catch {
      // The estimate is saved; only the money is not. Saying so plainly beats
      // navigating away as though both had worked.
      throw new Error(t('est.advanceFailed'))
    }
  }

  async function handleSave() {
    // From an online order with no customer picked: the order's customer is
    // added as new when this saves (approve_order), and only then.
    const newFromOrder = !!order && !customerId
    if (!supplier || (!customerId && !newFromOrder) || items.length === 0 || savingRef.current) return
    savingRef.current = true
    setSaving(true)
    setSaveError(null)
    try {
      if (order) {
        const result = await approveOrder({
          requestId: requestIdRef.current,
          orderId: order.id,
          customerId: customerId || null,
          newCustomer: newFromOrder ? { name: order.customer_name, phone: order.phone, site: order.site ?? '' } : null,
          site: site || null,
          items: items.map(({ key: _key, ...rest }) => rest),
          gstApplicable,
          transportLabourCharge: transportLabourAmount,
        })
        // A retry after the estimate saved but the money did not: approve_order
        // answers `already` and names no customer, so the order row is asked
        // instead — otherwise the advance would be skipped in silence.
        let cid = result.customerId
        if (advanceAmount > 0 && !cid) cid = (await getOrder(order.id)).customer_id
        await takeAdvance(cid)
        // Commit `saved` before navigating: the unsaved-work guard reads it
        // from the last render, and without this it still sees a dirty form.
        flushSync(() => setSaved(true))
        navigate(`/quotations/${result.quotationId}`)
        return
      }
      const quotation = await createQuotation({
        requestId: requestIdRef.current,
        customer_id: customerId,
        site,
        items: items.map(({ key: _key, ...rest }) => rest),
        gstApplicable,
        transportLabourCharge: transportLabourAmount,
      })
      await takeAdvance(customerId)
      clearDraft(supplier.id, 'quotation')
      // As above: commit `saved` first, or the guard stops the navigation.
      flushSync(() => setSaved(true))
      navigate(`/quotations/${quotation.id}`)
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : t('error.generic'))
    } finally {
      savingRef.current = false
      setSaving(false)
    }
  }

  return (
    <div>
      <PageHeader title={t('quo.new')} subtitle={t('quo.newSubtitle')} />

      {order && (
        <div className="mb-4 rounded-xl bg-accent-bg p-3 text-sm text-accent-text">
          <div className="font-semibold">{t('ord.fromOrder', { name: order.customer_name, phone: order.phone })}</div>
          {!customerId && <div className="mt-1 text-xs">{t('ord.orPickExisting')}</div>}
          {customerId && phoneMatch && (
            <div className="mt-1 text-xs">{t('ord.matchedCustomer', { name: phoneMatch.name })}</div>
          )}
          {order.note && <div className="mt-1 text-xs italic">“{order.note}”</div>}
        </div>
      )}

      <Card className="mb-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <div className="flex items-center justify-between">
              <Label htmlFor="customer" className="mb-1.5">
                {t('common.customer')}
              </Label>
              <button
                type="button"
                onClick={() => setAddCustomerOpen(true)}
                className="-m-2 mb-0 p-2 text-xs font-semibold text-accent-text hover:text-accent"
              >
                {t('inv.newCustomer')}
              </button>
            </div>
            <select
              id="customer"
              value={customerId}
              onChange={(e) => pickCustomer(e.target.value)}
              className="h-10 w-full rounded-lg border border-border bg-card px-3 text-sm outline-none focus:border-accent"
            >
              {/* An online order from a number the shop does not have yet:
                  the box reads the name the customer typed, already chosen,
                  rather than "Select a customer" over a note. That customer
                  is created with exactly that name when this saves
                  (approve_order), and only then. */}
              {order && !phoneMatch ? (
                <option value="">{t('ord.newFromOrder', { name: order.customer_name })}</option>
              ) : (
                <option value="">{t('inv.selectCustomer')}</option>
              )}
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

      <Card className="mb-4">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold">{t('inv.items')}</h3>
          <Button size="sm" variant="outline" onClick={addItem}>
            <Plus size={14} /> {t('inv.addItem')}
          </Button>
        </div>

        {items.length === 0 && <p className="text-sm text-muted">{t('quo.noItems')}</p>}

        <div className="flex flex-col gap-3">
          {items.map((item) => (
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
              </div>
              <button onClick={() => removeItem(item.key)} className="text-muted hover:text-red-600" aria-label="Remove item">
                <Trash2 size={16} />
              </button>
            </div>
          ))}
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
          {gstApplicable &&
            gstByRate.map((slab) => (
              <div key={slab.rate} className="flex justify-between">
                <span className="text-muted">
                  {t('inv.gst')} {formatRate(slab.rate)}
                </span>
                <span>₹{slab.amount.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</span>
              </div>
            ))}
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
          {advanceAmount > 0 && (
            <>
              <div className="flex justify-between">
                <span className="text-muted">{t('est.advanceTaken')}</span>
                <span className="text-accent">−₹{advanceAmount.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</span>
              </div>
              <div className="flex justify-between font-medium">
                <span>{t('est.advanceLeft')}</span>
                <span>₹{Math.max(0, total - advanceAmount).toLocaleString('en-IN', { maximumFractionDigits: 0 })}</span>
              </div>
            </>
          )}
        </div>

        {/* Money taken while the estimate is written. It is the customer's
            advance, not a payment against this estimate — an estimate is not
            a debt — and the bill made from it uses the advance by itself. */}
        {!takingAdvance ? (
          <button
            type="button"
            onClick={() => setTakingAdvance(true)}
            className="mt-3 text-sm font-semibold text-accent"
          >
            + {t('est.takeAdvance')}
          </button>
        ) : (
          <div className="mt-3 border-t border-border pt-3">
            <Label htmlFor="advance-now">{t('est.advanceNow')}</Label>
            <Input
              id="advance-now"
              type="text"
              inputMode="decimal"
              placeholder="0"
              value={advanceNow}
              onChange={(e) => setAdvanceNow(sanitizeDecimal(e.target.value))}
            />
            <div className="mt-2 flex flex-wrap gap-2">
              {PAYMENT_MODES.map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setAdvanceMode(mode)}
                  className={`rounded-full border px-3.5 py-2 text-xs font-medium ${
                    advanceMode === mode ? 'border-accent bg-accent-bg text-accent-text' : 'border-border text-muted'
                  }`}
                >
                  {mode}
                </button>
              ))}
            </div>
            <p className="mt-2 text-xs text-muted">{t('est.advanceHint')}</p>
          </div>
        )}
      </Card>

      {saveError && (
        <p className="mb-3 rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">{saveError}</p>
      )}

      <div className="sticky bottom-[var(--tabbar-h)] z-20 -mx-4 -mb-4 sm:-mb-6 lg:mb-0 flex items-center gap-3 border-t border-border bg-card px-4 py-3 sm:-mx-6 sm:px-6 lg:static lg:mx-0 lg:border-0 lg:bg-transparent lg:px-0 lg:py-0">
        <div className="lg:hidden">
          <div className="text-[11px] text-muted">{t('common.total')}</div>
          <div className="text-base font-bold text-ink">
            ₹{total.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
          </div>
        </div>
        <Button
          onClick={handleSave}
          disabled={saving || (!customerId && !order) || items.length === 0}
          className="ml-auto w-full max-w-56 lg:ml-0 lg:w-auto"
        >
          {saving ? t('common.saving') : t('quo.save')}
        </Button>
      </div>

      {/* Leaving on purpose abandons the estimate, so it is not offered back. */}
      <UnsavedChangesGuard
        when={!saved && items.length > 0}
        message={t('unsaved.estimate')}
        onLeave={supplier ? () => clearDraft(supplier.id, 'quotation') : undefined}
      />

      {pendingDraft && (
        <DraftPrompt
          kind="quotation"
          draft={pendingDraft}
          onContinue={() => {
            applyDraft(pendingDraft, materials, customers)
            setPendingDraft(null)
          }}
          onDiscard={() => {
            if (supplier) clearDraft(supplier.id, 'quotation')
            setPendingDraft(null)
          }}
        />
      )}

      {addCustomerOpen && supplier && (
        <AddCustomerModal
          supplierId={supplier.id}
          onClose={() => setAddCustomerOpen(false)}
          onCreated={handleCustomerCreated}
        />
      )}
    </div>
  )
}
