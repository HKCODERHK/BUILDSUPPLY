import { useEffect, useState, type FormEvent } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Plus, Pencil } from 'lucide-react'
import { WhatsAppIcon } from '@/components/icons/WhatsAppIcon'
import { PageHeader } from '@/components/layout/PageHeader'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Modal } from '@/components/ui/modal'
import { ActionMenu } from '@/components/ui/action-menu'
import { EmptyState } from '@/components/EmptyState'
import { listMaterials, createMaterial, updateMaterial } from '@/services/materials'
import { searchCatalog, type VariantWithLookups } from '@/services/materialCatalog'
import { summarizeAttributes } from '@/lib/catalogAttributes'
import { rateListMaterials, rateListPdfFile } from '@/lib/rateListPdf'
import { shareDocumentOnWhatsApp } from '@/lib/shareDocument'
import { logActivity } from '@/services/activityLog'
import type { Material } from '@/lib/database.types'
import { useAuth } from '@/context/AuthContext'
import { useLanguage } from '@/context/LanguageContext'
import { sanitizeDecimal } from '@/lib/numberInput'
import { useFlash, flashId } from '@/lib/useFlash'
import { TruckLoader } from '@/components/TruckLoader'

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
  const { t, mt } = useLanguage()
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
  // The card just topped up, lit for a moment with how much went in.
  const [stocked, setStocked] = useFlash<{ id: string; added: string }>()
  const [sharingRates, setSharingRates] = useState(false)
  const [rateListNote, setRateListNote] = useState<string | null>(null)
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
    // The dashboard's Start-here card lands a new supplier straight in the
    // catalog: that is where rates and units come filled in, and it already
    // carries "can't find it? add your own" for everything else.
    if (searchParams.get('view') === 'catalog') setView('catalog')
    if (searchParams.get('new') === '1' || searchParams.get('stock') === '1' || searchParams.get('view')) {
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
      setStocked({ id: material.id, added: `+${qty} ${mt(material.stock_unit)}`.trim() })
    } finally {
      setAddingStock(false)
    }
  }

  // "Aaj cement ka rate kya hai?" — the most-typed message in this trade,
  // answered once as a proper document on the supplier's own letterhead.
  async function shareRateList() {
    if (!supplier) return
    const list = rateListMaterials(materials)
    if (list.length === 0) {
      setRateListNote(t('mat.rateListEmpty'))
      return
    }
    setRateListNote(null)
    setSharingRates(true)
    try {
      const file = await rateListPdfFile(supplier, list)
      const outcome = await shareDocumentOnWhatsApp({
        file,
        message: `${supplier.business_name} — today's rate list is attached. Rates may change; GST and transport extra where applicable.`,
        title: 'Rate list',
      })
      if (outcome === 'shared') {
        void logActivity('supplier', 'rate_list_shared', {
          details: { items: list.length, format: 'pdf_share' },
        })
      }
    } finally {
      setSharingRates(false)
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
        title={t('mat.title')}
        subtitle={t('mat.subtitle')}
        action={
          // Both of these need a material to act on — with none, the primary
          // button would be permanently disabled and the menu's two items
          // would do nothing. The empty state below offers the way in instead.
          view === 'mine' &&
          materials.length > 0 && (
            // Topping up stock is the most-used action in the whole app;
            // adding a material or sharing rates is occasional by comparison.
            <div className="flex items-center gap-2">
              <Button onClick={() => setAddStockOpen(true)} disabled={materials.length === 0}>
                <Plus size={16} /> {t('mat.addStock')}
              </Button>
              <ActionMenu
                items={[
                  { label: t('mat.addMaterial'), icon: <Plus size={15} />, onSelect: openCreate },
                  {
                    label: sharingRates ? t('common.preparing') : t('mat.shareRates'),
                    icon: <WhatsAppIcon size={15} />,
                    onSelect: shareRateList,
                    disabled: sharingRates || materials.length === 0,
                  },
                ]}
              />
            </div>
          )
        }
      />

      {rateListNote && (
        <p className="mb-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-700 dark:bg-amber-950 dark:text-amber-300">
          {rateListNote}
        </p>
      )}

      {/* Stock value and low-stock count are both zero before anything is
          added, which is two meaningless figures sitting above an empty
          screen. They appear with the first material. */}
      {view === 'mine' && !loading && materials.length > 0 && (
        <div className="mb-5 grid grid-cols-2 gap-3">
          <Card>
            <div className="text-xs font-medium text-muted">{t('mat.stockValue')}</div>
            <div className="mt-1 text-2xl font-bold text-ink">{formatINR(totalStockValue)}</div>
          </Card>
          <Card>
            <div className="text-xs font-medium text-muted">{t('mat.lowStockItems')}</div>
            <div className={`mt-1 text-2xl font-bold ${lowStockCount > 0 ? 'text-red-600' : 'text-accent'}`}>
              {lowStockCount}
            </div>
          </Card>
        </div>
      )}

      <div className="mb-4 flex gap-2">
        <button
          onClick={() => setView('mine')}
          className={`rounded-full border px-3.5 py-2.5 text-xs font-medium ${view === 'mine' ? 'border-accent bg-accent-bg text-accent-text' : 'border-border text-muted'}`}
        >
          {t('mat.mine')}
        </button>
        <button
          onClick={() => setView('catalog')}
          className={`rounded-full border px-3.5 py-2.5 text-xs font-medium ${view === 'catalog' ? 'border-accent bg-accent-bg text-accent-text' : 'border-border text-muted'}`}
        >
          {t('mat.catalog')}
        </button>
      </div>

      {view === 'mine' ? (
        loading ? (
          <TruckLoader />
        ) : materials.length === 0 ? (
          // The catalog comes first on purpose: picking a variant fills in the
          // unit, the per-label and the rate, which is the whole reason it
          // exists. Adding your own is the fallback for what it doesn't carry.
          <EmptyState
            art="materials"
            title={t('empty.materialsTitle')}
            hint={t('empty.materialsHint')}
            action={
              <>
                <Button onClick={() => setView('catalog')}>{t('mat.catalog')}</Button>
                <Button variant="outline" onClick={openCreate}>
                  <Plus size={16} /> {t('mat.addMaterial')}
                </Button>
              </>
            }
          />
        ) : (
          <>
            <Input placeholder={t('mat.searchPlaceholder')} value={query} onChange={(e) => setQuery(e.target.value)} className="mb-4 max-w-xs" />

            {/* Outside the grid, so it spans the page rather than sitting in
                the first of three columns. */}
            {filtered.length === 0 && <p className="text-sm text-muted">{t('empty.materialsNoMatch')}</p>}

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {filtered.map((m) => (
                <Card key={m.id} id={flashId(m.id)} className={stocked?.id === m.id ? 'flash-success' : undefined}>
                  <div className="mb-2 flex items-start justify-between">
                    <div>
                      <div className="font-semibold text-ink">{mt(m.name)}</div>
                      <div className="text-xs text-muted">{mt(m.category) || '—'}</div>
                    </div>
                    <button onClick={() => openEdit(m)} className="-m-3 p-3 text-muted hover:text-ink" aria-label="Edit">
                      <Pencil size={15} />
                    </button>
                  </div>
                  <div className="text-lg font-bold text-ink">
                    ₹{m.rate.toLocaleString('en-IN')}{' '}
                    <span className="text-xs font-normal text-muted">{mt(m.per_label)}</span>
                  </div>
                  <div className="text-xs text-muted">{mt(m.unit_label)}</div>
                  <div className="mt-3 flex items-center justify-between border-t border-border pt-3 text-sm">
                    <span className="text-muted">{t('common.stock')}</span>
                    <div className="flex items-center gap-2">
                      {stocked?.id === m.id && (
                        <span className="flash-chip text-xs font-bold text-accent-text">{stocked.added}</span>
                      )}
                      <Badge tone={m.stock_qty <= (m.low_stock_threshold ?? 5) ? 'danger' : 'success'}>
                        {m.stock_qty} {mt(m.stock_unit)}
                      </Badge>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          </>
        )
      ) : (
        <>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-muted">{t('mat.catalogBlurb')}</p>
            <button onClick={openCreate} className="-m-2 p-2 text-xs font-semibold text-accent whitespace-nowrap">
              {t('mat.cantFind')}
            </button>
          </div>
          <Input
            placeholder={t('mat.catalogSearch')}
            value={catalogQuery}
            onChange={(e) => setCatalogQuery(e.target.value)}
            className="mb-4 max-w-md"
          />

          {catalogLoading ? (
            <TruckLoader inline label={t('mat.searching')} />
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {catalog.length === 0 && <p className="text-sm text-muted">{t('mat.catalogNone')}</p>}
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
                        <div className="font-semibold text-ink">{mt(m.material_types?.name ?? m.name)}</div>
                        <div className="text-xs text-muted">
                          {mt(m.material_types?.material_categories?.name) || '—'} {m.brands?.name ? `· ${m.brands.name}` : ''}
                        </div>
                      </div>
                    </div>
                    {variantSummary && <div className="text-sm font-medium text-ink">{mt(variantSummary)}</div>}
                    <div className="text-xs text-muted">{mt(m.unit) || '—'}</div>
                    <Button
                      size="sm"
                      variant={alreadyAdded ? 'outline' : 'primary'}
                      disabled={alreadyAdded || addingCatalogId === m.id}
                      onClick={() => addFromCatalog(m)}
                      className="mt-3 w-full"
                    >
                      {alreadyAdded ? t('mat.alreadyAdded') : addingCatalogId === m.id ? t('mat.adding') : t('mat.addToMine')}
                    </Button>
                  </Card>
                )
              })}
            </div>
          )}
        </>
      )}

      {modalOpen && (
        <Modal title={editing ? t('common.edit') : t('mat.addMaterial')} onClose={() => setModalOpen(false)}>
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div>
              <Label htmlFor="name" required>{t('common.name')}</Label>
              <Input id="name" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div>
              <Label htmlFor="category">{t('mat.category')}</Label>
              <Input id="category" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="rate">{t('common.rate')} (₹)</Label>
                <Input
                  id="rate"
                  type="text"
                  inputMode="decimal"
                  value={form.rate}
                  onChange={(e) => setForm({ ...form, rate: sanitizeDecimal(e.target.value) })}
                />
              </div>
              <div>
                <Label htmlFor="per_label">{t('mat.per')}</Label>
                <Input id="per_label" value={form.per_label} onChange={(e) => setForm({ ...form, per_label: e.target.value })} />
              </div>
            </div>
            <div>
              <Label htmlFor="unit_label">{t('mat.unitLabel')}</Label>
              <Input id="unit_label" value={form.unit_label} onChange={(e) => setForm({ ...form, unit_label: e.target.value })} />
            </div>
            <div>
              <Label htmlFor="low_stock_threshold">{t('mat.lowStockBelow')}</Label>
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
              {saving ? t('common.saving') : t('common.save')}
            </Button>
          </form>
        </Modal>
      )}

      {addStockOpen && (
        <Modal title={t('mat.addStock')} onClose={() => setAddStockOpen(false)}>
          <form onSubmit={handleAddStock} className="flex flex-col gap-4">
            <div>
              <Label htmlFor="add-stock-material">{t('inv.material')}</Label>
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
                <option value="">{t('mat.selectMaterial')}</option>
                {materials.map((m) => (
                  <option key={m.id} value={m.id}>
                    {mt(m.name)}
                  </option>
                ))}
              </select>
              {selectedStockMaterial && (
                <p className="mt-1.5 text-xs text-muted">
                  {t('mat.currentlyInStock', { qty: `${selectedStockMaterial.stock_qty} ${mt(selectedStockMaterial.stock_unit)}`.trim() })}
                </p>
              )}
            </div>
            <div>
              <Label htmlFor="add-stock-qty">{t('mat.qtyToAdd')}</Label>
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
                {t('mat.newTotal', {
                  qty: `${Number(selectedStockMaterial.stock_qty) + Number(addStockForm.qty)} ${mt(selectedStockMaterial.stock_unit)}`.trim(),
                })}
              </p>
            )}
            <Button type="submit" disabled={addingStock}>
              {addingStock ? t('common.saving') : t('mat.addStock')}
            </Button>
          </form>
        </Modal>
      )}
    </div>
  )
}
