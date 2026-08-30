import { useEffect, useState, type FormEvent } from 'react'
import { useSearchParams } from 'react-router-dom'
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
import { sanitizeDecimal } from '@/lib/numberInput'

const emptyForm = {
  name: '',
  category: '',
  rate: '',
  unit_label: '',
  per_label: '',
  low_stock_threshold: '',
}

type View = 'mine' | 'catalog'

function formatINR(n: number) {
  return `₹${n.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`
}

function isLowStock(m: Material) {
  return m.stock_qty <= (m.low_stock_threshold ?? 5)
}

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
  const [addStockOpen, setAddStockOpen] = useState(false)
  const [addStockForm, setAddStockForm] = useState({ materialId: '', qty: '' })
  const [addingStock, setAddingStock] = useState(false)
  const [searchParams, setSearchParams] = useSearchParams()

  async function refresh() {
    setMaterials(await listMaterials())
  }

  useEffect(() => {
    refresh().finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    if (searchParams.get('new') === '1') openCreate()
    if (searchParams.get('stock') === '1') setAddStockOpen(true)
    if (searchParams.get('new') === '1' || searchParams.get('stock') === '1') {
      setSearchParams({}, { replace: true })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function handleAddStock(e: FormEvent) {
    e.preventDefault()
    const material = materials.find((m) => m.id === addStockForm.materialId)
    const qty = Number(addStockForm.qty)
    if (!material || !qty || qty <= 0) return
    setAddingStock(true)
    try {
      await updateMaterial(material.id, { stock_qty: Number(material.stock_qty) + qty })
      setAddStockForm({ materialId: '', qty: '' })
      setAddStockOpen(false)
      await refresh()
    } finally {
      setAddingStock(false)
    }
  }

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
  const selectedStockMaterial = materials.find((m) => m.id === addStockForm.materialId) ?? null
  const totalStockValue = materials.reduce((sum, m) => sum + m.rate * m.stock_qty, 0)
  const lowStockCount = materials.filter(isLowStock).length

  return (
    <div>
      <PageHeader
        title="Materials & Stock"
        subtitle="Your items, their rates and how much you have"
        action={
          view === 'mine' && (
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={openCreate}>
                <Plus size={16} /> Add material
              </Button>
              <Button onClick={() => setAddStockOpen(true)} disabled={materials.length === 0}>
                <Plus size={16} /> Add stock
              </Button>
            </div>
          )
        }
      />

      {view === 'mine' && !loading && (
        <div className="mb-5 grid grid-cols-2 gap-3">
          <Card>
            <div className="text-xs font-medium text-muted">Stock value</div>
            <div className="mt-1 text-2xl font-bold text-ink">{formatINR(totalStockValue)}</div>
          </Card>
          <Card>
            <div className="text-xs font-medium text-muted">Low stock items</div>
            <div className={`mt-1 text-2xl font-bold ${lowStockCount > 0 ? 'text-red-600' : 'text-accent'}`}>
              {lowStockCount}
            </div>
          </Card>
        </div>
      )}

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
                <Input
                  id="rate"
                  type="text"
                  inputMode="decimal"
                  value={form.rate}
                  onChange={(e) => setForm({ ...form, rate: sanitizeDecimal(e.target.value) })}
                />
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
            <div>
              <Label htmlFor="low_stock_threshold">Low stock alert below</Label>
              <Input
                id="low_stock_threshold"
                type="text"
                inputMode="decimal"
                placeholder="e.g. 5"
                value={form.low_stock_threshold}
                onChange={(e) => setForm({ ...form, low_stock_threshold: sanitizeDecimal(e.target.value) })}
              />
            </div>
            <Button type="submit" disabled={saving}>
              {saving ? 'Saving…' : 'Save material'}
            </Button>
          </form>
        </Modal>
      )}

      {addStockOpen && (
        <Modal title="Add stock" onClose={() => setAddStockOpen(false)}>
          <form onSubmit={handleAddStock} className="flex flex-col gap-4">
            <div>
              <Label htmlFor="add-stock-material">Material</Label>
              {/* Option text stays just the material name — appending the
                  current stock made the native dropdown wider than a phone
                  screen. The quantity is shown as a hint below instead. */}
              <select
                id="add-stock-material"
                required
                value={addStockForm.materialId}
                onChange={(e) => setAddStockForm({ ...addStockForm, materialId: e.target.value })}
                className="h-10 w-full max-w-full truncate rounded-lg border border-border bg-card px-3 text-sm outline-none focus:border-accent"
              >
                <option value="">Select from your materials…</option>
                {materials.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
              {selectedStockMaterial && (
                <p className="mt-1.5 text-xs text-muted">
                  Currently {selectedStockMaterial.stock_qty} {selectedStockMaterial.stock_unit ?? ''} in stock
                </p>
              )}
            </div>
            <div>
              <Label htmlFor="add-stock-qty">Quantity to add</Label>
              <Input
                id="add-stock-qty"
                type="text"
                inputMode="decimal"
                required
                value={addStockForm.qty}
                onChange={(e) => setAddStockForm({ ...addStockForm, qty: sanitizeDecimal(e.target.value) })}
              />
            </div>
            {selectedStockMaterial && Number(addStockForm.qty) > 0 && (
              <p className="rounded-lg bg-accent-bg px-3 py-2 text-xs text-accent-text">
                New total will be {Number(selectedStockMaterial.stock_qty) + Number(addStockForm.qty)}{' '}
                {selectedStockMaterial.stock_unit ?? ''}
              </p>
            )}
            <Button type="submit" disabled={addingStock}>
              {addingStock ? 'Adding…' : 'Add stock'}
            </Button>
          </form>
        </Modal>
      )}
    </div>
  )
}
