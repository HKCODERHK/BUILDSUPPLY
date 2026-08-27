import { useEffect, useState, type FormEvent } from 'react'
import { Plus, Pencil } from 'lucide-react'
import { PageHeader } from '@/components/layout/PageHeader'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Modal } from '@/components/ui/modal'
import { listMaterials, createMaterial, updateMaterial } from '@/services/materials'
import type { Material } from '@/lib/database.types'
import { useAuth } from '@/context/AuthContext'

const emptyForm = {
  name: '',
  category: '',
  rate: '',
  unit_label: '',
  per_label: '',
  stock_qty: '',
  stock_unit: '',
}

export default function Materials() {
  const { supplier } = useAuth()
  const [materials, setMaterials] = useState<Material[]>([])
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<Material | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)

  async function refresh() {
    setMaterials(await listMaterials())
  }

  useEffect(() => {
    refresh().finally(() => setLoading(false))
  }, [])

  function openCreate() {
    setEditing(null)
    setForm(emptyForm)
    setModalOpen(true)
  }

  function openEdit(m: Material) {
    setEditing(m)
    setForm({
      name: m.name,
      category: m.category ?? '',
      rate: String(m.rate),
      unit_label: m.unit_label ?? '',
      per_label: m.per_label ?? '',
      stock_qty: String(m.stock_qty),
      stock_unit: m.stock_unit ?? '',
    })
    setModalOpen(true)
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!supplier) return
    setSaving(true)
    const payload = {
      name: form.name,
      category: form.category || null,
      rate: Number(form.rate) || 0,
      unit_label: form.unit_label || null,
      per_label: form.per_label || null,
      stock_qty: Number(form.stock_qty) || 0,
      stock_unit: form.stock_unit || null,
    }
    try {
      if (editing) {
        await updateMaterial(editing.id, payload)
      } else {
        await createMaterial(supplier.id, payload)
      }
      setModalOpen(false)
      await refresh()
    } finally {
      setSaving(false)
    }
  }

  const filtered = materials.filter(
    (m) => m.name.toLowerCase().includes(query.toLowerCase()) || (m.category ?? '').toLowerCase().includes(query.toLowerCase()),
  )

  return (
    <div>
      <PageHeader
        title="Materials"
        subtitle="Search a rate, or manage your material catalog"
        action={
          <Button onClick={openCreate}>
            <Plus size={16} /> Add material
          </Button>
        }
      />

      <Input placeholder="Search materials…" value={query} onChange={(e) => setQuery(e.target.value)} className="mb-4 max-w-xs" />

      {loading ? (
        <p className="text-sm text-muted">Loading…</p>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.length === 0 && <p className="text-sm text-muted">No materials found.</p>}
          {filtered.map((m) => (
            <Card key={m.id}>
              <div className="mb-2 flex items-start justify-between">
                <div>
                  <div className="font-semibold text-ink">{m.name}</div>
                  <div className="text-xs text-muted">{m.category ?? '—'}</div>
                </div>
                <button onClick={() => openEdit(m)} className="text-muted hover:text-ink" aria-label="Edit">
                  <Pencil size={15} />
                </button>
              </div>
              <div className="text-lg font-bold text-ink">
                ₹{m.rate.toLocaleString('en-IN')}{' '}
                <span className="text-xs font-normal text-muted">{m.per_label ?? ''}</span>
              </div>
              <div className="text-xs text-muted">{m.unit_label}</div>
              <div className="mt-3 flex items-center justify-between border-t border-border pt-3 text-sm">
                <span className="text-muted">Stock</span>
                <Badge tone={m.stock_qty <= 5 ? 'danger' : 'success'}>
                  {m.stock_qty} {m.stock_unit ?? ''}
                </Badge>
              </div>
            </Card>
          ))}
        </div>
      )}

      {modalOpen && (
        <Modal title={editing ? 'Edit material' : 'Add material'} onClose={() => setModalOpen(false)}>
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div>
              <Label htmlFor="name">Name</Label>
              <Input id="name" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div>
              <Label htmlFor="category">Category</Label>
              <Input id="category" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="rate">Rate (₹)</Label>
                <Input id="rate" type="number" min="0" step="0.01" value={form.rate} onChange={(e) => setForm({ ...form, rate: e.target.value })} />
              </div>
              <div>
                <Label htmlFor="per_label">Per (e.g. / truck)</Label>
                <Input id="per_label" value={form.per_label} onChange={(e) => setForm({ ...form, per_label: e.target.value })} />
              </div>
            </div>
            <div>
              <Label htmlFor="unit_label">Unit label (e.g. Truck 400 CFT)</Label>
              <Input id="unit_label" value={form.unit_label} onChange={(e) => setForm({ ...form, unit_label: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="stock_qty">Stock quantity</Label>
                <Input id="stock_qty" type="number" min="0" step="0.01" value={form.stock_qty} onChange={(e) => setForm({ ...form, stock_qty: e.target.value })} />
              </div>
              <div>
                <Label htmlFor="stock_unit">Stock unit (e.g. trucks)</Label>
                <Input id="stock_unit" value={form.stock_unit} onChange={(e) => setForm({ ...form, stock_unit: e.target.value })} />
              </div>
            </div>
            <Button type="submit" disabled={saving}>
              {saving ? 'Saving…' : 'Save material'}
            </Button>
          </form>
        </Modal>
      )}
    </div>
  )
}
