import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Trash2, Plus } from 'lucide-react'
import { PageHeader } from '@/components/layout/PageHeader'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Modal } from '@/components/ui/modal'
import { AddCustomerModal } from '@/components/AddCustomerModal'
import { listCustomers } from '@/services/customers'
import { listMaterials } from '@/services/materials'
import { createInvoice, listInvoices, markInvoiceDelivered, type NewInvoiceItem } from '@/services/invoices'
import { recordPayment } from '@/services/payments'
import type { Customer, Material, PaymentMode } from '@/lib/database.types'
import { useAuth } from '@/context/AuthContext'
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

function formatINR(n: number) {
  return `₹${n.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`
}

export default function NewInvoice() {
  const { supplier } = useAuth()
  const navigate = useNavigate()
  const [customers, setCustomers] = useState<Customer[]>([])
  const [materials, setMaterials] = useState<Material[]>([])
  const [customerId, setCustomerId] = useState('')
  const [site, setSite] = useState('')
  const [knownSites, setKnownSites] = useState<string[]>([])
  const [items, setItems] = useState<LineItem[]>([])
  // Starts on only for a GST-registered supplier. Anyone without a GST
  // number had to untick this on every single bill, and forgetting once
  // meant overcharging the customer 18% on a PDF already sent.
  const [gstApplicable, setGstApplicable] = useState(false)
  const gstDefaulted = useRef(false)
  const [transportLabour, setTransportLabour] = useState('')
  const [paidNow, setPaidNow] = useState('')
  const [paidMode, setPaidMode] = useState<PaymentMode>('Cash')
  const [saving, setSaving] = useState(false)
  // React state updates aren't synchronous, so a second click landing before
  // the re-render that disables the button would slip through `saving`
  // alone; this ref blocks re-entry immediately, in the same tick.
  const savingRef = useRef(false)
  const [deliveryPrompt, setDeliveryPrompt] = useState<{ id: string; invoice_no: string } | null>(null)
  const [confirmingDelivery, setConfirmingDelivery] = useState(false)
  const [addCustomerOpen, setAddCustomerOpen] = useState(false)

  useEffect(() => {
    Promise.all([listCustomers(), listMaterials(), listInvoices()]).then(([c, m, inv]) => {
      setCustomers(c)
      setMaterials(m)
      // Every material the supplier stocks is laid out ready to bill.
      setItems(
        m.map((mat) => ({
          key: crypto.randomUUID(),
          material_id: mat.id,
          description: mat.name,
          qty: 0,
          rate: mat.rate,
          preset: true,
        })),
      )
      // Sites already used before, offered as type-ahead suggestions so a
      // repeat site never has to be typed out twice.
      setKnownSites(
        Array.from(
          new Set([...inv.map((i) => i.site), ...c.map((x) => x.site)].filter((s): s is string => !!s)),
        ).sort(),
      )
    })
  }, [])

  useEffect(() => {
    if (supplier && !gstDefaulted.current) {
      gstDefaulted.current = true
      setGstApplicable(!!supplier.gst_number?.trim())
    }
  }, [supplier])

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
  const paidNowAmount = Number(paidNow) || 0
  const remaining = Math.max(0, total - paidNowAmount)

  async function handleSave() {
    if (!supplier || !customerId || billedItems.length === 0 || savingRef.current) return
    savingRef.current = true
    setSaving(true)
    try {
      const invoice = await createInvoice(supplier.id, {
        customer_id: customerId,
        site,
        items: billedItems.map(({ key: _key, preset: _preset, ...rest }) => rest),
        gstApplicable,
        transportLabourCharge: transportLabourAmount,
      })
      if (paidNowAmount > 0) {
        await recordPayment(supplier.id, invoice.id, [{ amount: paidNowAmount, mode: paidMode }])
      }
      // Stock isn't touched yet — ask before deducting it, since billing and
      // delivery often happen at different times.
      setDeliveryPrompt({ id: invoice.id, invoice_no: invoice.invoice_no })
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

  return (
    <div>
      <PageHeader title="Create Invoice" subtitle="Site, materials and GST on one screen" />

      <Card className="mb-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <div className="flex items-center justify-between">
              <Label htmlFor="customer" className="mb-1.5">
                Customer
              </Label>
              <button
                type="button"
                onClick={() => setAddCustomerOpen(true)}
                className="mb-1.5 text-xs font-semibold text-accent hover:text-accent-soft"
              >
                + New customer
              </button>
            </div>
            <select
              id="customer"
              value={customerId}
              onChange={(e) => pickCustomer(e.target.value)}
              className="h-10 w-full rounded-lg border border-border bg-card px-3 text-sm outline-none focus:border-accent"
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
            <Label htmlFor="site">Site / delivery place</Label>
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
        <div className="mb-1 flex items-center justify-between">
          <h3 className="text-sm font-semibold">Items</h3>
          <Button size="sm" variant="outline" onClick={addItem}>
            <Plus size={14} /> Add item
          </Button>
        </div>
        <p className="mb-3 text-xs text-muted">
          {items.some((it) => it.preset)
            ? `Your materials are listed below — just type the quantity for what you're selling. ${billedItems.length} on this bill.`
            : 'Add the items for this bill.'}
        </p>

        {items.length === 0 && <p className="text-sm text-muted">No materials in your list yet — use "Add item".</p>}

        <div className="flex flex-col gap-2">
          {items.map((item) =>
            item.preset ? (
              // Pre-filled from the material list: name is fixed, so only the
              // numbers are editable. Highlighted once it's actually on the bill.
              <div
                key={item.key}
                className={cn(
                  'grid grid-cols-[minmax(0,1fr)_4.5rem_5.5rem] items-center gap-2 rounded-lg border border-border p-2.5 transition-colors',
                  item.qty > 0 && 'border-accent bg-accent-bg',
                )}
              >
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium text-ink">{item.description}</div>
                  <div className="text-xs text-muted">
                    {item.qty > 0 ? formatINR(item.qty * item.rate) : 'Not on this bill'}
                  </div>
                </div>
                <div>
                  <Label className="mb-0.5 text-[10px]">Qty</Label>
                  <Input
                    type="text"
                    inputMode="numeric"
                    value={item.qty}
                    onChange={(e) => updateItem(item.key, { qty: Number(sanitizeDigits(e.target.value)) || 0 })}
                  />
                </div>
                <div>
                  <Label className="mb-0.5 text-[10px]">Rate (₹)</Label>
                  <Input
                    type="text"
                    inputMode="decimal"
                    value={item.rate}
                    onChange={(e) => updateItem(item.key, { rate: Number(sanitizeDecimal(e.target.value)) || 0 })}
                  />
                </div>
              </div>
            ) : (
              <div key={item.key} className="grid grid-cols-1 gap-2 rounded-lg border border-border p-3 sm:grid-cols-[2fr_1fr_1fr_1fr_auto] sm:items-end">
                <div>
                  <Label>Material</Label>
                  <select
                    value={item.material_id ?? ''}
                    onChange={(e) => (e.target.value ? pickMaterial(item.key, e.target.value) : updateItem(item.key, { material_id: null }))}
                    className="h-10 w-full rounded-lg border border-border bg-card px-3 text-sm outline-none focus:border-accent"
                  >
                    <option value="">Custom / choose material…</option>
                    {materials.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <Label>Description</Label>
                  <Input value={item.description} onChange={(e) => updateItem(item.key, { description: e.target.value })} />
                </div>
                <div>
                  <Label>Qty</Label>
                  <Input
                    type="text"
                    inputMode="numeric"
                    value={item.qty}
                    onChange={(e) => updateItem(item.key, { qty: Number(sanitizeDigits(e.target.value)) || 0 })}
                  />
                </div>
                <div>
                  <Label>Rate (₹)</Label>
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
            ),
          )}
        </div>
      </Card>

      <Card className="mb-4">
        <label className="mb-3 flex items-center gap-2 text-sm">
          <input type="checkbox" checked={gstApplicable} onChange={(e) => setGstApplicable(e.target.checked)} />
          Apply GST (18%)
        </label>
        <div className="mb-3">
          <Label htmlFor="transport-labour">Transport + Labour (₹, optional)</Label>
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
            <span className="text-muted">Subtotal</span>
            <span>₹{subtotal.toLocaleString('en-IN')}</span>
          </div>
          {gstApplicable && (
            <div className="flex justify-between">
              <span className="text-muted">GST (18%)</span>
              <span>₹{gst.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</span>
            </div>
          )}
          {transportLabourAmount > 0 && (
            <div className="flex justify-between">
              <span className="text-muted">Transport + Labour</span>
              <span>₹{transportLabourAmount.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</span>
            </div>
          )}
          <div className="mt-1 flex justify-between border-t border-border pt-2 text-base font-bold">
            <span>Total</span>
            <span>₹{total.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</span>
          </div>
        </div>
      </Card>

      <Card className="mb-4">
        <h3 className="mb-3 text-sm font-semibold">Payment received now (optional)</h3>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <Label htmlFor="paid-now">Amount given by customer</Label>
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
            <Label htmlFor="paid-mode">Mode</Label>
            <select
              id="paid-mode"
              disabled={paidNowAmount <= 0}
              value={paidMode}
              onChange={(e) => setPaidMode(e.target.value as PaymentMode)}
              className="h-10 w-full rounded-lg border border-border bg-card px-3 text-sm outline-none focus:border-accent disabled:opacity-50"
            >
              {PAYMENT_MODES.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </div>
        </div>
        {paidNowAmount > 0 && (
          <div className="mt-3 flex justify-between border-t border-border pt-3 text-sm">
            <span className="text-muted">Remaining after this</span>
            <span className="font-semibold text-red-600">₹{remaining.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</span>
          </div>
        )}
      </Card>

      <Button onClick={handleSave} disabled={saving || !customerId || billedItems.length === 0} className="w-full sm:w-auto">
        {saving ? 'Saving…' : 'Save invoice'}
      </Button>

      {addCustomerOpen && supplier && (
        <AddCustomerModal
          supplierId={supplier.id}
          onClose={() => setAddCustomerOpen(false)}
          onCreated={handleCustomerCreated}
        />
      )}

      {deliveryPrompt && (
        <Modal title="Delivery" onClose={() => respondToDeliveryPrompt(false)}>
          <p className="mb-4 text-sm text-ink">
            {deliveryPrompt.invoice_no} is saved. Have you delivered the material to the customer?
          </p>
          <p className="mb-4 text-xs text-muted">
            If yes, stock will be reduced now to match this bill. If not yet, you can mark it delivered later from the Invoices list.
          </p>
          <div className="flex gap-2">
            <Button className="flex-1" disabled={confirmingDelivery} onClick={() => respondToDeliveryPrompt(true)}>
              Yes, delivered
            </Button>
            <Button variant="outline" className="flex-1" disabled={confirmingDelivery} onClick={() => respondToDeliveryPrompt(false)}>
              Not yet
            </Button>
          </div>
        </Modal>
      )}
    </div>
  )
}
