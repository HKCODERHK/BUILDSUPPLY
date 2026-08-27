import { useEffect, useState, type FormEvent } from 'react'
import { Plus } from 'lucide-react'
import { PageHeader } from '@/components/layout/PageHeader'
import { Card, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Modal } from '@/components/ui/modal'
import {
  listCategories,
  createCategory,
  updateCategory,
  listBrands,
  createBrand,
  updateBrand,
  listMasterMaterials,
  createMasterMaterial,
  updateMasterMaterial,
  type MasterMaterialWithLookups,
} from '@/services/materialCatalog'
import type { Brand, MaterialCategory } from '@/lib/database.types'

export default function MaterialCatalog() {
  const [categories, setCategories] = useState<MaterialCategory[]>([])
  const [brands, setBrands] = useState<Brand[]>([])
  const [materials, setMaterials] = useState<MasterMaterialWithLookups[]>([])
  const [loading, setLoading] = useState(true)
  const [materialModal, setMaterialModal] = useState(false)
  const [newCategoryName, setNewCategoryName] = useState('')
  const [newBrandName, setNewBrandName] = useState('')

  async function refresh() {
    const [cats, brs, mats] = await Promise.all([listCategories(), listBrands(), listMasterMaterials()])
    setCategories(cats)
    setBrands(brs)
    setMaterials(mats)
  }

  useEffect(() => {
    refresh().finally(() => setLoading(false))
  }, [])

  async function handleAddCategory(e: FormEvent) {
    e.preventDefault()
    if (!newCategoryName.trim()) return
    await createCategory(newCategoryName.trim())
    setNewCategoryName('')
    await refresh()
  }

  async function handleAddBrand(e: FormEvent) {
    e.preventDefault()
    if (!newBrandName.trim()) return
    await createBrand(newBrandName.trim())
    setNewBrandName('')
    await refresh()
  }

  if (loading) return <p className="text-sm text-muted">Loading…</p>

  return (
    <div>
      <PageHeader title="Material Catalog" subtitle="The shared catalog every supplier can price and stock against" />

      <div className="mb-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Categories</CardTitle>
          </CardHeader>
          <form onSubmit={handleAddCategory} className="mb-3 flex gap-2">
            <Input placeholder="New category" value={newCategoryName} onChange={(e) => setNewCategoryName(e.target.value)} />
            <Button size="sm" type="submit">
              Add
            </Button>
          </form>
          <div className="flex flex-col divide-y divide-border">
            {categories.map((c) => (
              <div key={c.id} className="flex items-center justify-between py-2 text-sm">
                <span className={c.active ? '' : 'text-muted line-through'}>{c.name}</span>
                <button
                  className="text-xs font-semibold text-accent"
                  onClick={async () => {
                    await updateCategory(c.id, { active: !c.active })
                    await refresh()
                  }}
                >
                  {c.active ? 'Disable' : 'Enable'}
                </button>
              </div>
            ))}
          </div>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Brands</CardTitle>
          </CardHeader>
          <form onSubmit={handleAddBrand} className="mb-3 flex gap-2">
            <Input placeholder="New brand" value={newBrandName} onChange={(e) => setNewBrandName(e.target.value)} />
            <Button size="sm" type="submit">
              Add
            </Button>
          </form>
          <div className="flex flex-col divide-y divide-border">
            {brands.map((b) => (
              <div key={b.id} className="flex items-center justify-between py-2 text-sm">
                <span className={b.active ? '' : 'text-muted line-through'}>{b.name}</span>
                <button
                  className="text-xs font-semibold text-accent"
                  onClick={async () => {
                    await updateBrand(b.id, { active: !b.active })
                    await refresh()
                  }}
                >
                  {b.active ? 'Disable' : 'Enable'}
                </button>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Materials</CardTitle>
          <Button size="sm" onClick={() => setMaterialModal(true)}>
            <Plus size={14} /> Add material
          </Button>
        </CardHeader>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-border text-xs text-muted">
                <th className="py-2 pr-3 font-medium">Name</th>
                <th className="py-2 pr-3 font-medium">Category</th>
                <th className="py-2 pr-3 font-medium">Brand</th>
                <th className="py-2 pr-3 font-medium">Default unit</th>
                <th className="py-2 pr-3 font-medium">Status</th>
                <th className="py-2 pr-3 font-medium"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {materials.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-4 text-muted">
                    No materials in the catalog yet.
                  </td>
                </tr>
              )}
              {materials.map((m) => (
                <tr key={m.id}>
                  <td className="py-2.5 pr-3 font-medium text-ink">{m.name}</td>
                  <td className="py-2.5 pr-3">{m.material_categories?.name ?? '—'}</td>
                  <td className="py-2.5 pr-3">{m.brands?.name ?? '—'}</td>
                  <td className="py-2.5 pr-3">{m.default_unit_label ?? '—'}</td>
                  <td className="py-2.5 pr-3">
                    <Badge tone={m.active ? 'success' : 'neutral'}>{m.active ? 'Active' : 'Disabled'}</Badge>
                  </td>
                  <td className="py-2.5 pr-3">
                    <button
                      className="text-xs font-semibold text-accent"
                      onClick={async () => {
                        await updateMasterMaterial(m.id, { active: !m.active })
                        await refresh()
                      }}
                    >
                      {m.active ? 'Disable' : 'Enable'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {materialModal && (
        <AddMasterMaterialModal
          categories={categories}
          brands={brands}
          onClose={() => setMaterialModal(false)}
          onCreated={refresh}
        />
      )}
    </div>
  )
}

function AddMasterMaterialModal({
  categories,
  brands,
  onClose,
  onCreated,
}: {
  categories: MaterialCategory[]
  brands: Brand[]
  onClose: () => void
  onCreated: () => void
}) {
  const [form, setForm] = useState({
    name: '',
    category_id: '',
    brand_id: '',
    default_unit_label: '',
    default_per_label: '',
  })
  const [saving, setSaving] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setSaving(true)
    try {
      await createMasterMaterial({
        name: form.name,
        category_id: form.category_id || null,
        brand_id: form.brand_id || null,
        default_unit_label: form.default_unit_label || null,
        default_per_label: form.default_per_label || null,
        image_url: null,
      })
      onCreated()
      onClose()
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal title="Add material to catalog" onClose={onClose}>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div>
          <Label htmlFor="name">Name</Label>
          <Input id="name" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </div>
        <div>
          <Label htmlFor="category">Category</Label>
          <select
            id="category"
            value={form.category_id}
            onChange={(e) => setForm({ ...form, category_id: e.target.value })}
            className="h-10 w-full rounded-lg border border-border bg-white px-3 text-sm outline-none focus:border-accent"
          >
            <option value="">None</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <Label htmlFor="brand">Brand</Label>
          <select
            id="brand"
            value={form.brand_id}
            onChange={(e) => setForm({ ...form, brand_id: e.target.value })}
            className="h-10 w-full rounded-lg border border-border bg-white px-3 text-sm outline-none focus:border-accent"
          >
            <option value="">None</option>
            {brands.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="unit">Default unit</Label>
            <Input
              id="unit"
              placeholder="Truck 400 CFT"
              value={form.default_unit_label}
              onChange={(e) => setForm({ ...form, default_unit_label: e.target.value })}
            />
          </div>
          <div>
            <Label htmlFor="per">Per label</Label>
            <Input
              id="per"
              placeholder="/ truck"
              value={form.default_per_label}
              onChange={(e) => setForm({ ...form, default_per_label: e.target.value })}
            />
          </div>
        </div>
        <Button type="submit" disabled={saving}>
          {saving ? 'Saving…' : 'Add material'}
        </Button>
      </form>
    </Modal>
  )
}
