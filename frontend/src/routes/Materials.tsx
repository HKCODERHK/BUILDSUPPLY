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
import { searchCatalog, type VariantWithLookups } from '@/services/materialCatalog'
import { summarizeAttributes } from '@/lib/catalogAttributes'
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
  low_stock_threshold: '',
}

type View = 'mine' | 'catalog'

export default function Materials() {
  const { supplier } = useAuth()
  const [view, setView] = useState<View>('mine')
  const [materials, setMaterials] = useState<Material[]>([])
  const [catalog, setCatalog] = useState<VariantWithLookups[]>([])
  const [loading, setLoading] = useState(true)
  const [catalogLoading, setCatalogLoading] = useState(false)
  const [query, setQuery] = useState('')
  const [catalogQuery, setCatalogQuery] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<Material | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)
  const [addingCatalogId, setAddingCatalogId] = useState<string | null>(null)

  async function refresh() {
    setMaterials(await listMaterials())
  }

  useEffect(() => {
    refresh().finally(() => setLoading(false))
  }, [])

  async function runCatalogSearch(q: string) {
    setCatalogLoading(true)
    try {
      setCatalog(await searchCatalog(q, { activeOnly: true }))
    } finally {
      setCatalogLoading(false)
    }
  }

  useEffect(() => {
    if (view !== 'catalog') return
    const handle = setTimeout(() => runCatalogSearch(catalogQuery), 250)
    return () => clearTimeout(handle)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, catalogQuery])

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
      low_stock_threshold: m.low_stock_threshold != null ? String(m.low_stock_threshold) : '',
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
      low_stock_threshold: form.low_stock_threshold ? Number(form.low_stock_threshold) : null,
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

  async function addFromCatalog(item: VariantWithLookups) {
    if (!supplier) return
    setAddingCatalogId(item.id)
    try {
      const label = [item.material_types?.name, item.brands?.name, summarizeAttributes(item.attributes)]
        .filter(Boolean)
        .join(' — ')
      const created = await createMaterial(supplier.id, {
        master_material_id: item.id,
        name: label || item.name,
        category: item.material_types?.material_categories?.name ?? null,
        rate: 0,
        unit_label: item.unit,
        per_label: null,
        stock_qty: 0,
        stock_unit: null,
      })
      await refresh()
      setView('mine')
      openEdit(created)
    } finally {
      setAddingCatalogId(null)
    }
  }

  const filtered = materials.filter(
    (m) => m.name.toLowerCase().includes(query.toLowerCase()) || (m.category ?? '').toLowerCase().includes(query.toLowerCase()),
  )

  const addedMasterIds = new Set(materials.map((m) => m.master_material_id).filter(Boolean))

  return (
    <div>
      <PageHeader
        title="Materials"
        subtitle="Search a rate, or manage your material catalog"
        action={
          view === 'mine' && (
            <Button onClick={openCreate}>
              <Plus size={16} /> Add material
            </Button>
          )
        }
      />

      <div className="mb-4 flex gap-2">
        <button
          onClick={() => setView('mine')}
          className={`rounded-full border px-3 py-1 text-xs font-medium ${view === 'mine' ? 'border-accent bg-accent-bg text-accent-text' : 'border-border text-muted'}`}
        >
          My Materials
        </button>
        <button
          onClick={() => setView('catalog')}
          className={`rounded-full border px-3 py-1 text-xs font-medium ${view === 'catalog' ? 'border-accent bg-accent-bg text-accent-text' : 'border-border text-muted'}`}
        >
          Browse Catalog
        </button>
      </div>

      {view === 'mine' ? (
        <>
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
                    <Badge tone={m.stock_qty <= (m.low_stock_threshold ?? 5) ? 'danger' : 'success'}>
                      {m.stock_qty} {m.stock_unit ?? ''}
                    </Badge>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </>
      ) : (
        <>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-muted">
              Materials your admin has added — pick one to add it to your own list with your own price and stock.
            </p>
            <button onClick={openCreate} className="text-xs font-semibold text-accent whitespace-nowrap">
              Can't find your material? + Add Custom Material
            </button>
          </div>
          <Input
            placeholder="Search — try “cement”, “12mm”, “river”, “400 cft”…"
            value={catalogQuery}
            onChange={(e) => setCatalogQuery(e.target.value)}
            className="mb-4 max-w-md"
          />

          {catalogLoading ? (
            <p className="text-sm text-muted">Searching…</p>
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {catalog.length === 0 && <p className="text-sm text-muted">No catalog materials found.</p>}
              {catalog.map((m) => {
                const alreadyAdded = addedMasterIds.has(m.id)
                const variantSummary = summarizeAttributes(m.attributes)
                return (
                  <Card key={m.id}>
                    <div className="mb-2 flex items-start gap-3">
                      {m.image_url ? (
                        <img src={m.image_url} alt={m.name} className="h-10 w-10 rounded-lg object-cover" />
                      ) : (
                        <div className="h-10 w-10 rounded-lg bg-surface" />
                      )}
                      <div>
                        <div className="font-semibold text-ink">{m.material_types?.name ?? m.name}</div>
                        <div className="text-xs text-muted">
                          {m.material_types?.material_categories?.name ?? '—'} {m.brands?.name ? `· ${m.brands.name}` : ''}
                        </div>
                      </div>
                    </div>
                    {variantSummary && <div className="text-sm font-medium text-ink">{variantSummary}</div>}
                    <div className="text-xs text-muted">{m.unit ?? '—'}</div>
                    <Button
                      size="sm"
                      variant={alreadyAdded ? 'outline' : 'primary'}
                      disabled={alreadyAdded || addingCatalogId === m.id}
                      onClick={() => addFromCatalog(m)}
                      className="mt-3 w-full"
                    >
                      {alreadyAdded ? 'Already added' : addingCatalogId === m.id ? 'Adding…' : 'Add to my materials'}
                    </Button>
                  </Card>
                )
              })}
            </div>
          )}
        </>
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
            <div>
              <Label htmlFor="low_stock_threshold">Low stock alert below</Label>
              <Input
                id="low_stock_threshold"
                type="number"
                min="0"
                step="0.01"
                placeholder="e.g. 5"
                value={form.low_stock_threshold}
                onChange={(e) => setForm({ ...form, low_stock_threshold: e.target.value })}
              />
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
