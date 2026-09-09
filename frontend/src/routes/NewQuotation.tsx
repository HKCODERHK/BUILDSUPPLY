import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Trash2, Plus } from 'lucide-react'
import { PageHeader } from '@/components/layout/PageHeader'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { AddCustomerModal } from '@/components/AddCustomerModal'
import { UnsavedChangesGuard } from '@/components/UnsavedChangesGuard'
import { listCustomers } from '@/services/customers'
import { listMaterials } from '@/services/materials'
import { createQuotation } from '@/services/quotations'
import { listInvoices, type NewInvoiceItem } from '@/services/invoices'
import type { Customer, Material } from '@/lib/database.types'
import { useAuth } from '@/context/AuthContext'
import { useLanguage } from '@/context/LanguageContext'
import { sanitizeDigits, sanitizeDecimal } from '@/lib/numberInput'

const GST_RATE = 0.18

interface LineItem extends NewInvoiceItem {
  key: string
}

// A near-mirror of NewInvoice.tsx's item editor — same materials/qty/rate/GST/
// transport-labour flow — but an estimate never takes payment and never
// touches stock, so those two sections and the post-save delivery prompt are
// deliberately absent here.
export default function NewQuotation() {
  const { supplier } = useAuth()
  const { t, mt } = useLanguage()
  const navigate = useNavigate()
  const [customers, setCustomers] = useState<Customer[]>([])
  const [materials, setMaterials] = useState<Material[]>([])
  const [customerId, setCustomerId] = useState('')
  const [site, setSite] = useState('')
  const [knownSites, setKnownSites] = useState<string[]>([])
  const [items, setItems] = useState<LineItem[]>([])
  // Defaults from whether the supplier is GST-registered — see NewInvoice.
  const [gstApplicable, setGstApplicable] = useState(false)
  const gstDefaulted = useRef(false)
  const [transportLabour, setTransportLabour] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const savingRef = useRef(false)
  const [addCustomerOpen, setAddCustomerOpen] = useState(false)

  useEffect(() => {
    Promise.all([listCustomers(), listMaterials(), listInvoices()]).then(([c, m, inv]) => {
      setCustomers(c)
      setMaterials(m)
      setKnownSites(
        Array.from(
          new Set([...inv.map((i) => i.site), ...c.map((x) => x.site)].filter((s): s is string => !!s)),
        ).sort(),
      )
    })
  }, [])

  // Picking a customer pre-fills their usual site; it stays editable so one
  // contractor can have separate estimates per site.
  useEffect(() => {
    if (supplier && !gstDefaulted.current) {
      gstDefaulted.current = true
      setGstApplicable(!!supplier.gst_number?.trim())
    }
  }, [supplier])

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
  const gst = gstApplicable ? Math.round(subtotal * GST_RATE) : 0
  const transportLabourAmount = Number(transportLabour) || 0
  const total = subtotal + gst + transportLabourAmount

  async function handleSave() {
    if (!supplier || !customerId || items.length === 0 || savingRef.current) return
    savingRef.current = true
    setSaving(true)
    try {
      const quotation = await createQuotation(supplier.id, {
        customer_id: customerId,
        site,
        items: items.map(({ key: _key, ...rest }) => rest),
        gstApplicable,
        transportLabourCharge: transportLabourAmount,
      })
      setSaved(true)
      navigate(`/quotations/${quotation.id}`)
    } finally {
      savingRef.current = false
      setSaving(false)
    }
  }

  return (
    <div>
      <PageHeader title={t('quo.new')} subtitle={t('quo.newSubtitle')} />

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

      <div className="sticky bottom-[var(--tabbar-h)] z-20 -mx-4 -mb-4 sm:-mb-6 lg:mb-0 flex items-center gap-3 border-t border-border bg-card px-4 py-3 sm:-mx-6 sm:px-6 lg:static lg:mx-0 lg:border-0 lg:bg-transparent lg:px-0 lg:py-0">
        <div className="lg:hidden">
          <div className="text-[11px] text-muted">{t('common.total')}</div>
          <div className="text-base font-bold text-ink">
            ₹{total.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
          </div>
        </div>
        <Button
          onClick={handleSave}
          disabled={saving || !customerId || items.length === 0}
          className="ml-auto w-full max-w-56 lg:ml-0 lg:w-auto"
        >
          {saving ? t('common.saving') : t('quo.save')}
        </Button>
      </div>

      <UnsavedChangesGuard when={!saved && items.length > 0} message={t('unsaved.estimate')} />

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
