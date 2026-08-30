import { useEffect, useMemo, useState, type ChangeEvent, type FormEvent } from 'react'
import { Plus, Pencil, Check, X } from 'lucide-react'
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
  listMaterialTypes,
  createMaterialType,
  updateMaterialType,
  listVariants,
  createVariant,
  updateVariant,
  uploadCatalogImage,
  type VariantWithLookups,
} from '@/services/materialCatalog'
import { CATEGORY_ATTRIBUTE_CONFIG, summarizeAttributes } from '@/lib/catalogAttributes'
import type { Brand, MaterialCategory, MaterialType, VariantAttributes } from '@/lib/database.types'

function describeError(err: unknown) {
  return err instanceof Error ? err.message : 'Something went wrong. Please try again.'
}

export default function MaterialCatalog() {
  const [categories, setCategories] = useState<MaterialCategory[]>([])
  const [brands, setBrands] = useState<Brand[]>([])
  const [types, setTypes] = useState<MaterialType[]>([])
  const [variants, setVariants] = useState<VariantWithLookups[]>([])
  const [loading, setLoading] = useState(true)
  const [variantModal, setVariantModal] = useState(false)
  const [editingVariant, setEditingVariant] = useState<VariantWithLookups | null>(null)
  const [newCategoryName, setNewCategoryName] = useState('')
  const [newBrandName, setNewBrandName] = useState('')
  const [newTypeCategoryId, setNewTypeCategoryId] = useState('')
  const [newTypeName, setNewTypeName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [renamingCategory, setRenamingCategory] = useState<string | null>(null)
  const [renamingBrand, setRenamingBrand] = useState<string | null>(null)
  const [renamingType, setRenamingType] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')

  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('')
  const [brandFilter, setBrandFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'disabled'>('all')

  async function refresh() {
    const [cats, brs, tps, vars] = await Promise.all([listCategories(), listBrands(), listMaterialTypes(), listVariants()])
    setCategories(cats)
    setBrands(brs)
    setTypes(tps)
    setVariants(vars)
  }

  useEffect(() => {
    refresh().finally(() => setLoading(false))
  }, [])

  async function handleAddCategory(e: FormEvent) {
    e.preventDefault()
    if (!newCategoryName.trim()) return
    setError(null)
    try {
      await createCategory(newCategoryName.trim())
      setNewCategoryName('')
      await refresh()
    } catch (err) {
      setError(describeError(err))
    }
  }

  async function handleAddBrand(e: FormEvent) {
    e.preventDefault()
    if (!newBrandName.trim()) return
    setError(null)
    try {
      await createBrand(newBrandName.trim())
      setNewBrandName('')
      await refresh()
    } catch (err) {
      setError(describeError(err))
    }
  }

  async function handleAddType(e: FormEvent) {
    e.preventDefault()
    if (!newTypeCategoryId || !newTypeName.trim()) return
    setError(null)
    try {
      await createMaterialType(newTypeCategoryId, newTypeName.trim())
      setNewTypeName('')
      await refresh()
    } catch (err) {
      setError(describeError(err))
    }
  }

  async function toggleCategory(c: MaterialCategory) {
    setError(null)
    try {
      await updateCategory(c.id, { active: !c.active })
      await refresh()
    } catch (err) {
      setError(describeError(err))
    }
  }

  async function toggleBrand(b: Brand) {
    setError(null)
    try {
      await updateBrand(b.id, { active: !b.active })
      await refresh()
    } catch (err) {
      setError(describeError(err))
    }
  }

  async function toggleType(t: MaterialType) {
    setError(null)
    try {
      await updateMaterialType(t.id, { active: !t.active })
      await refresh()
    } catch (err) {
      setError(describeError(err))
    }
  }

  async function toggleVariant(v: VariantWithLookups) {
    setError(null)
    try {
      await updateVariant(v.id, { active: !v.active })
      await refresh()
    } catch (err) {
      setError(describeError(err))
    }
  }

  async function saveCategoryRename(c: MaterialCategory) {
    if (!renameValue.trim()) return
    setError(null)
    try {
      await updateCategory(c.id, { name: renameValue.trim() })
      setRenamingCategory(null)
      await refresh()
    } catch (err) {
      setError(describeError(err))
    }
  }

  async function saveBrandRename(b: Brand) {
    if (!renameValue.trim()) return
    setError(null)
    try {
      await updateBrand(b.id, { name: renameValue.trim() })
      setRenamingBrand(null)
      await refresh()
    } catch (err) {
      setError(describeError(err))
    }
  }

  async function saveTypeRename(t: MaterialType) {
    if (!renameValue.trim()) return
    setError(null)
    try {
      await updateMaterialType(t.id, { name: renameValue.trim() })
      setRenamingType(null)
      await refresh()
    } catch (err) {
      setError(describeError(err))
    }
  }

  const categoryById = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories])
  const typesByCategory = useMemo(() => {
    const map = new Map<string, MaterialType[]>()
    for (const t of types) {
      const list = map.get(t.category_id) ?? []
      list.push(t)
      map.set(t.category_id, list)
    }
    return map
  }, [types])

  const filteredVariants = variants.filter((v) => {
    if (categoryFilter && v.material_types?.category_id !== categoryFilter) return false
    if (brandFilter && v.brand_id !== brandFilter) return false
    if (statusFilter === 'active' && !v.active) return false
    if (statusFilter === 'disabled' && v.active) return false
    if (search.trim()) {
      const text = v.search_text ?? ''
      const words = search.trim().toLowerCase().split(/\s+/).filter(Boolean)
      if (!words.every((w) => text.includes(w))) return false
    }
    return true
  })

  if (loading) return <p className="text-sm text-muted">Loading…</p>

  return (
    <div>
      <PageHeader title="Material Catalog" subtitle="The shared catalog every supplier can price and stock against" />

      {error && <Card className="mb-4 bg-red-50 text-sm text-red-700">{error}</Card>}

      <div className="mb-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
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
              <RenamableRow
                key={c.id}
                label={c.name}
                active={c.active}
                renaming={renamingCategory === c.id}
                renameValue={renameValue}
                onRenameValueChange={setRenameValue}
                onStartRename={() => {
                  setRenamingCategory(c.id)
                  setRenameValue(c.name)
                }}
                onSaveRename={() => saveCategoryRename(c)}
                onCancelRename={() => setRenamingCategory(null)}
                onToggle={() => toggleCategory(c)}
              />
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
          <div className="flex max-h-64 flex-col divide-y divide-border overflow-y-auto">
            {brands.map((b) => (
              <RenamableRow
                key={b.id}
                label={b.name}
                active={b.active}
                renaming={renamingBrand === b.id}
                renameValue={renameValue}
                onRenameValueChange={setRenameValue}
                onStartRename={() => {
                  setRenamingBrand(b.id)
                  setRenameValue(b.name)
                }}
                onSaveRename={() => saveBrandRename(b)}
                onCancelRename={() => setRenamingBrand(null)}
                onToggle={() => toggleBrand(b)}
              />
            ))}
          </div>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Material Types</CardTitle>
          </CardHeader>
          <form onSubmit={handleAddType} className="mb-3 flex flex-col gap-2">
            <select
              value={newTypeCategoryId}
              onChange={(e) => setNewTypeCategoryId(e.target.value)}
              className="h-10 w-full rounded-lg border border-border bg-card px-3 text-sm outline-none focus:border-accent"
            >
              <option value="">Select category…</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <div className="flex gap-2">
              <Input placeholder="New material type" value={newTypeName} onChange={(e) => setNewTypeName(e.target.value)} />
              <Button size="sm" type="submit">
                Add
              </Button>
            </div>
          </form>
          <div className="flex max-h-64 flex-col divide-y divide-border overflow-y-auto">
            {types.map((t) => (
              <RenamableRow
                key={t.id}
                label={`${t.name} (${categoryById.get(t.category_id)?.name ?? '—'})`}
                active={t.active}
                renaming={renamingType === t.id}
                renameValue={renameValue}
                onRenameValueChange={setRenameValue}
                onStartRename={() => {
                  setRenamingType(t.id)
                  setRenameValue(t.name)
                }}
                onSaveRename={() => saveTypeRename(t)}
                onCancelRename={() => setRenamingType(null)}
                onToggle={() => toggleType(t)}
              />
            ))}
          </div>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Materials</CardTitle>
          <Button size="sm" onClick={() => setVariantModal(true)}>
            <Plus size={14} /> Add material
          </Button>
        </CardHeader>

        <div className="mb-4 flex flex-wrap gap-2">
          <Input placeholder="Search materials…" value={search} onChange={(e) => setSearch(e.target.value)} className="max-w-xs" />
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="h-10 rounded-lg border border-border bg-card px-3 text-sm outline-none focus:border-accent"
          >
            <option value="">All categories</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <select
            value={brandFilter}
            onChange={(e) => setBrandFilter(e.target.value)}
            className="h-10 rounded-lg border border-border bg-card px-3 text-sm outline-none focus:border-accent"
          >
            <option value="">All brands</option>
            {brands.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
            className="h-10 rounded-lg border border-border bg-card px-3 text-sm outline-none focus:border-accent"
          >
            <option value="all">All statuses</option>
            <option value="active">Active</option>
            <option value="disabled">Disabled</option>
          </select>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-border text-xs text-muted">
                <th className="py-2 pr-3 font-medium"></th>
                <th className="py-2 pr-3 font-medium">Material</th>
                <th className="py-2 pr-3 font-medium">Category</th>
                <th className="py-2 pr-3 font-medium">Brand</th>
                <th className="py-2 pr-3 font-medium">Variant</th>
                <th className="py-2 pr-3 font-medium">Unit</th>
                <th className="py-2 pr-3 font-medium">Status</th>
                <th className="py-2 pr-3 font-medium"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filteredVariants.length === 0 && (
                <tr>
                  <td colSpan={8} className="py-4 text-muted">
                    No materials match.
                  </td>
                </tr>
              )}
              {filteredVariants.map((v) => (
                <tr key={v.id}>
                  <td className="py-2.5 pr-3">
                    {v.image_url ? (
                      <img src={v.image_url} alt={v.name} className="h-8 w-8 rounded object-cover" />
                    ) : (
                      <div className="h-8 w-8 rounded bg-surface" />
                    )}
                  </td>
                  <td className="py-2.5 pr-3 font-medium text-ink">{v.material_types?.name ?? v.name}</td>
                  <td className="py-2.5 pr-3">{v.material_types?.material_categories?.name ?? '—'}</td>
                  <td className="py-2.5 pr-3">{v.brands?.name ?? '—'}</td>
                  <td className="py-2.5 pr-3">{summarizeAttributes(v.attributes) || '—'}</td>
                  <td className="py-2.5 pr-3">{v.unit ?? '—'}</td>
                  <td className="py-2.5 pr-3">
                    <Badge tone={v.active ? 'success' : 'neutral'}>{v.active ? 'Active' : 'Disabled'}</Badge>
                  </td>
                  <td className="py-2.5 pr-3">
                    <div className="flex items-center gap-3">
                      <button className="text-muted hover:text-ink" aria-label="Edit" onClick={() => setEditingVariant(v)}>
                        <Pencil size={14} />
                      </button>
                      <button className="text-xs font-semibold text-accent" onClick={() => toggleVariant(v)}>
                        {v.active ? 'Disable' : 'Enable'}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {variantModal && (
        <VariantModal categories={categories} typesByCategory={typesByCategory} brands={brands} onClose={() => setVariantModal(false)} onSaved={refresh} />
      )}

      {editingVariant && (
        <VariantModal
          categories={categories}
          typesByCategory={typesByCategory}
          brands={brands}
          editing={editingVariant}
          onClose={() => setEditingVariant(null)}
          onSaved={refresh}
        />
      )}
    </div>
  )
}

function RenamableRow({
  label,
  active,
  renaming,
  renameValue,
  onRenameValueChange,
  onStartRename,
  onSaveRename,
  onCancelRename,
  onToggle,
}: {
  label: string
  active: boolean
  renaming: boolean
  renameValue: string
  onRenameValueChange: (v: string) => void
  onStartRename: () => void
  onSaveRename: () => void
  onCancelRename: () => void
  onToggle: () => void
}) {
  if (renaming) {
    return (
      <div className="flex items-center gap-1.5 py-2 text-sm">
        <Input value={renameValue} onChange={(e) => onRenameValueChange(e.target.value)} className="h-8" autoFocus />
        <button onClick={onSaveRename} className="text-accent" aria-label="Save">
          <Check size={16} />
        </button>
        <button onClick={onCancelRename} className="text-muted" aria-label="Cancel">
          <X size={16} />
        </button>
      </div>
    )
  }
  return (
    <div className="flex items-center justify-between py-2 text-sm">
      <span className={active ? '' : 'text-muted line-through'}>{label}</span>
      <div className="flex items-center gap-3">
        <button className="text-muted hover:text-ink" aria-label="Rename" onClick={onStartRename}>
          <Pencil size={14} />
        </button>
        <button className="text-xs font-semibold text-accent" onClick={onToggle}>
          {active ? 'Disable' : 'Enable'}
        </button>
      </div>
    </div>
  )
}

function VariantModal({
  categories,
  typesByCategory,
  brands,
  editing,
  onClose,
  onSaved,
}: {
  categories: MaterialCategory[]
  typesByCategory: Map<string, MaterialType[]>
  brands: Brand[]
  editing?: VariantWithLookups
  onClose: () => void
  onSaved: () => void
}) {
  const [categoryId, setCategoryId] = useState(editing?.material_types?.category_id ?? '')
  const [typeId, setTypeId] = useState(editing?.material_type_id ?? '')
  const [brandId, setBrandId] = useState(editing?.brand_id ?? '')
  const [attrValues, setAttrValues] = useState<VariantAttributes>(editing?.attributes ?? {})
  const [attrOther, setAttrOther] = useState<Record<string, string>>({})
  const [unit, setUnit] = useState(editing?.unit ?? '')
  const [searchKeywords, setSearchKeywords] = useState(editing?.search_keywords ?? '')
  const [imageUrl, setImageUrl] = useState<string | null>(editing?.image_url ?? null)
  const [uploading, setUploading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const category = categories.find((c) => c.id === categoryId)
  const config = category ? CATEGORY_ATTRIBUTE_CONFIG[category.slug] : undefined
  const typeOptions = categoryId ? (typesByCategory.get(categoryId) ?? []).filter((t) => t.active) : []
  const selectedType = typeOptions.find((t) => t.id === typeId) ?? typesByCategory.get(categoryId)?.find((t) => t.id === typeId)
  const selectedBrand = brands.find((b) => b.id === brandId)

  const composedName = [selectedType?.name, selectedBrand?.name, ...(config ? config.fields.map((f) => attrValues[f.key]).filter(Boolean) : [])]
    .filter(Boolean)
    .join(' — ')

  function setAttr(key: string, value: string) {
    setAttrValues((prev) => ({ ...prev, [key]: value }))
  }

  async function handleImageChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    setError(null)
    try {
      const url = await uploadCatalogImage(file)
      setImageUrl(url)
    } catch (err) {
      setError(describeError(err))
    } finally {
      setUploading(false)
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!typeId) {
      setError('Pick a material type.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      const payload = {
        material_type_id: typeId,
        brand_id: config?.showBrand ? brandId || null : null,
        name: composedName || selectedType?.name || 'Material',
        attributes: attrValues,
        unit: unit || config?.defaultUnit || null,
        search_keywords: searchKeywords || null,
        image_url: imageUrl,
      }
      if (editing) {
        await updateVariant(editing.id, payload)
      } else {
        await createVariant(payload)
      }
      onSaved()
      onClose()
    } catch (err) {
      setError(describeError(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal title={editing ? 'Edit material' : 'Add material to catalog'} onClose={onClose}>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div>
          <Label>Image</Label>
          <div className="flex items-center gap-3">
            {imageUrl ? (
              <img src={imageUrl} alt="" className="h-14 w-14 rounded-lg border border-border object-cover" />
            ) : (
              <div className="flex h-14 w-14 items-center justify-center rounded-lg border border-dashed border-border text-xs text-muted-2">
                None
              </div>
            )}
            <label className="cursor-pointer text-sm font-semibold text-accent">
              {uploading ? 'Uploading…' : 'Upload image'}
              <input type="file" accept="image/*" className="hidden" onChange={handleImageChange} disabled={uploading} />
            </label>
          </div>
        </div>

        <div>
          <Label htmlFor="category">Category</Label>
          <select
            id="category"
            required
            value={categoryId}
            onChange={(e) => {
              setCategoryId(e.target.value)
              setTypeId('')
              setAttrValues({})
            }}
            className="h-10 w-full rounded-lg border border-border bg-card px-3 text-sm outline-none focus:border-accent"
          >
            <option value="">Select category…</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>

        {categoryId && (
          <div>
            <Label htmlFor="type">Material Type</Label>
            <select
              id="type"
              required
              value={typeId}
              onChange={(e) => setTypeId(e.target.value)}
              className="h-10 w-full rounded-lg border border-border bg-card px-3 text-sm outline-none focus:border-accent"
            >
              <option value="">Select type…</option>
              {typeOptions.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>
        )}

        {config?.showBrand && (
          <div>
            <Label htmlFor="brand">Brand</Label>
            <select
              id="brand"
              value={brandId}
              onChange={(e) => setBrandId(e.target.value)}
              className="h-10 w-full rounded-lg border border-border bg-card px-3 text-sm outline-none focus:border-accent"
            >
              <option value="">None</option>
              {brands.filter((b) => b.active).map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </div>
        )}

        {config?.fields.map((field) => {
          const currentValue = String(attrValues[field.key] ?? '')
          const isOtherSelected = currentValue !== '' && !field.options.includes(currentValue)
          if (field.allowCustomValue) {
            return (
              <div key={field.key}>
                <Label htmlFor={field.key}>{field.label}</Label>
                <Input
                  id={field.key}
                  value={currentValue}
                  onChange={(e) => setAttr(field.key, e.target.value)}
                  placeholder={field.options[0]}
                />
              </div>
            )
          }
          return (
            <div key={field.key}>
              <Label htmlFor={field.key}>{field.label}</Label>
              <select
                id={field.key}
                value={isOtherSelected ? '__other__' : currentValue}
                onChange={(e) => {
                  if (e.target.value === '__other__') {
                    setAttr(field.key, attrOther[field.key] ?? '')
                  } else {
                    setAttr(field.key, e.target.value)
                  }
                }}
                className="h-10 w-full rounded-lg border border-border bg-card px-3 text-sm outline-none focus:border-accent"
              >
                <option value="">Select…</option>
                {field.options.map((opt) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))}
                {field.allowOther && <option value="__other__">Other</option>}
              </select>
              {field.allowOther && isOtherSelected && (
                <Input
                  className="mt-2"
                  placeholder={`Other ${field.label.toLowerCase()}`}
                  value={currentValue}
                  onChange={(e) => {
                    setAttrOther((prev) => ({ ...prev, [field.key]: e.target.value }))
                    setAttr(field.key, e.target.value)
                  }}
                />
              )}
            </div>
          )
        })}

        {typeId && (
          <div className="rounded-lg bg-surface p-3 text-xs text-muted">
            Will be listed as: <span className="font-medium text-ink">{composedName || selectedType?.name}</span>
          </div>
        )}

        <div>
          <Label htmlFor="unit">Unit</Label>
          <Input id="unit" placeholder={config?.defaultUnit ?? 'e.g. Bag'} value={unit} onChange={(e) => setUnit(e.target.value)} />
        </div>

        <div>
          <Label htmlFor="keywords">Search keywords (optional)</Label>
          <Input
            id="keywords"
            placeholder="e.g. gitti gitty aggregate"
            value={searchKeywords}
            onChange={(e) => setSearchKeywords(e.target.value)}
          />
        </div>

        {error && <p className="text-xs text-red-600">{error}</p>}
        <Button type="submit" disabled={saving || uploading}>
          {saving ? 'Saving…' : editing ? 'Save changes' : 'Add material'}
        </Button>
      </form>
    </Modal>
  )
}
