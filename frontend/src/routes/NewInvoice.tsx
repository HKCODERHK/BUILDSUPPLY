import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Trash2, Plus } from 'lucide-react'
import { PageHeader } from '@/components/layout/PageHeader'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { listCustomers } from '@/services/customers'
import { listMaterials } from '@/services/materials'
import { createInvoice, type NewInvoiceItem } from '@/services/invoices'
import type { Customer, Material } from '@/lib/database.types'
import { useAuth } from '@/context/AuthContext'

const GST_RATE = 0.18

interface LineItem extends NewInvoiceItem {
  key: string
}

export default function NewInvoice() {
  const { supplier } = useAuth()
  const navigate = useNavigate()
  const [customers, setCustomers] = useState<Customer[]>([])
  const [materials, setMaterials] = useState<Material[]>([])
  const [customerId, setCustomerId] = useState('')
  const [items, setItems] = useState<LineItem[]>([])
  const [gstApplicable, setGstApplicable] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    Promise.all([listCustomers(), listMaterials()]).then(([c, m]) => {
      setCustomers(c)
      setMaterials(m)
    })
  }, [])

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

  const subtotal = items.reduce((sum, it) => sum + it.qty * it.rate, 0)
  const gst = gstApplicable ? Math.round(subtotal * GST_RATE) : 0
  const total = subtotal + gst

  async function handleSave() {
    if (!supplier || !customerId || items.length === 0) return
    setSaving(true)
    try {
      const invoice = await createInvoice(supplier.id, {
        customer_id: customerId,
        items: items.map(({ key: _key, ...rest }) => rest),
        gstApplicable,
      })
      navigate(`/invoices?created=${invoice.invoice_no}`)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div>
      <PageHeader title="Create Invoice" subtitle="Site, materials and GST on one screen" />

      <Card className="mb-4">
        <Label htmlFor="customer">Customer</Label>
        <select
          id="customer"
          value={customerId}
          onChange={(e) => setCustomerId(e.target.value)}
          className="h-10 w-full rounded-lg border border-border bg-white px-3 text-sm outline-none focus:border-accent"
        >
          <option value="">Select a customer…</option>
          {customers.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </Card>

      <Card className="mb-4">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold">Items</h3>
          <Button size="sm" variant="outline" onClick={addItem}>
            <Plus size={14} /> Add item
          </Button>
        </div>

        {items.length === 0 && <p className="text-sm text-muted">No items added yet.</p>}

        <div className="flex flex-col gap-3">
          {items.map((item) => (
            <div key={item.key} className="grid grid-cols-1 gap-2 rounded-lg border border-border p-3 sm:grid-cols-[2fr_1fr_1fr_1fr_auto] sm:items-end">
              <div>
                <Label>Material</Label>
                <select
                  value={item.material_id ?? ''}
                  onChange={(e) => (e.target.value ? pickMaterial(item.key, e.target.value) : updateItem(item.key, { material_id: null }))}
                  className="h-10 w-full rounded-lg border border-border bg-white px-3 text-sm outline-none focus:border-accent"
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
                <Input type="number" min="0" step="0.01" value={item.qty} onChange={(e) => updateItem(item.key, { qty: Number(e.target.value) })} />
              </div>
              <div>
                <Label>Rate (₹)</Label>
                <Input type="number" min="0" step="0.01" value={item.rate} onChange={(e) => updateItem(item.key, { rate: Number(e.target.value) })} />
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
          Apply GST (18%)
        </label>
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
          <div className="mt-1 flex justify-between border-t border-border pt-2 text-base font-bold">
            <span>Total</span>
            <span>₹{total.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</span>
          </div>
        </div>
      </Card>

      <Button onClick={handleSave} disabled={saving || !customerId || items.length === 0} className="w-full sm:w-auto">
        {saving ? 'Saving…' : 'Save invoice'}
      </Button>
    </div>
  )
}
