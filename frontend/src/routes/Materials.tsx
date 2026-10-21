import { useEffect, useState, type FormEvent } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Plus, Pencil, Package, Truck } from 'lucide-react'
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
import { listMaterials, createMaterial, updateMaterial, adjustStock, sellingTypesAvailable } from '@/services/materials'
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
import { StockLogs } from '@/components/StockLogs'
import { VehicleListingForm, type VehicleListingInitial } from '@/components/VehicleListingForm'
import { SALE_UNITS, blankVehicleOption, byLoad, isVehicleOption, listingKey, loadsKey, vehicleOptionLabel, vehicleOptionName, type SoldBy } from '@/lib/sellingType'

const emptyForm = {
  name: '',
  category: '',
  rate: '',
  gst_rate: '18',
  unit_label: '',
  per_label: '',
  low_stock_threshold: '',
  // How the customer may order it (migration 050); empty is no rule.
  min_qty: '',
  qty_step: '',
  delivery_charge: '',
}

type View = 'mine' | 'catalog' | 'logs'

function formatINR(n: number) {
  return `₹${n.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`
}

/** A vehicle listing: every option of it, so the supplier edits them together. */
function listingOf(m: Material, list: Material[]): VehicleListingInitial {
  const siblings = list.filter((x) => isVehicleOption(x) && listingKey(x) === listingKey(m)).sort(byLoad)
  return {
    listing_name: m.listing_name ?? '',
    category: m.category ?? '',
    gst_rate: String(Number(m.gst_rate ?? 18)),
    options: siblings.map((x) => ({
      id: x.id,
      vehicle: x.vehicle ?? '',
      capacity: x.capacity != null ? String(Number(x.capacity)) : '',
      capacity_unit: x.capacity_unit ?? 'CFT',
      rate: String(x.rate),
      delivery_charge: x.delivery_charge != null ? String(Number(x.delivery_charge)) : '',
      available: x.available !== false,
    })),
  }
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
  // 050's columns: until they exist the form is exactly what it always was.
  const [sellingOn, setSellingOn] = useState(false)
  // In the add / edit dialog: how it is sold — null while a new one is still being asked.
  const [soldBy, setSoldBy] = useState<SoldBy | null>('unit')
  const [listing, setListing] = useState<VehicleListingInitial | null>(null)

  async function refresh() {
    setMaterials(await listMaterials())
  }

  useEffect(() => {
    refresh().finally(() => setLoading(false))
    void sellingTypesAvailable().then(setSellingOn)
  }, [])

  useEffect(() => {
    if (searchParams.get('new') === '1') openCreate()
    if (searchParams.get('stock') === '1') setAddStockOpen(true)
    // The dashboard's Start-here card lands a new supplier straight in the
    // catalog: that is where rates and units come filled in, and it already
    // carries "can't find it? add your own" for everything else.
    if (searchParams.get('view') === 'catalog') setView('catalog')
    if (searchParams.get('view') === 'logs') setView('logs')
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
      // Added in the database in one step, so two top-ups at once both count.
      await adjustStock(material, qty)
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
    setListing(null)
    // Asked first, once the database can hold the answer (see shownSoldBy).
    setSoldBy(null)
    setModalOpen(true)
  }

  /**
   * A material sold by its unit becoming a vehicle option: it keeps its id,
   * price and stock, and its name is written from the parts once saved.
   */
  function chooseSoldBy(next: SoldBy) {
    setSoldBy(next)
    if (next === 'vehicle' && !listing) {
      setListing({
        listing_name: editing ? editing.name : form.name,
        category: editing ? (editing.category ?? '') : form.category,
        gst_rate: editing ? String(Number(editing.gst_rate ?? 18)) : form.gst_rate,
        options: editing
          ? [{ ...blankVehicleOption(), id: editing.id, rate: String(editing.rate), available: editing.available !== false }]
          : [],
      })
    }
  }

  function openEdit(m: Material, list: Material[] = materials) {
    if (isVehicleOption(m)) {
      setEditing(m)
      setListing(listingOf(m, list))
      setSoldBy('vehicle')
      setModalOpen(true)
      return
    }
    setListing(null)
    setSoldBy('unit')
    setEditing(m)
    setForm({
      name: m.name,
      category: m.category ?? '',
      rate: String(m.rate),
      gst_rate: String(Number(m.gst_rate ?? 18)),
      unit_label: m.unit_label ?? '',
      per_label: m.per_label ?? '',
      low_stock_threshold: m.low_stock_threshold != null ? String(m.low_stock_threshold) : '',
      min_qty: m.min_qty != null ? String(Number(m.min_qty)) : '',
      qty_step: m.qty_step != null ? String(Number(m.qty_step)) : '',
      delivery_charge: m.delivery_charge != null ? String(Number(m.delivery_charge)) : '',
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
      // The percentage every bill will charge for it (migration 035).
      gst_rate: Math.min(100, Number(form.gst_rate) || 0),
      unit_label: form.unit_label || null,
      per_label: form.per_label || null,
      low_stock_threshold: form.low_stock_threshold ? Number(form.low_stock_threshold) : null,
      // Sold by its unit, said in so many words, with the shop's ordering rules.
      ...(sellingOn
        ? {
            sold_by: 'unit' as const,
            min_qty: Number(form.min_qty) > 0 ? Number(form.min_qty) : null,
            qty_step: Number(form.qty_step) > 0 ? Number(form.qty_step) : null,
            delivery_charge: form.delivery_charge.trim() ? Number(form.delivery_charge) : null,
          }
        : {}),
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
      // A catalog vehicle variant with a capacity ("River Sand · Truck · 400
      // CFT") joins that material's listing as one more option.
      const attrs = (item.attributes ?? {}) as Record<string, unknown>
      const vehicle = typeof attrs.vehicle === 'string' ? attrs.vehicle : ''
      const capacity = Number(attrs.capacity_cft)
      const listingName = item.material_types?.name ?? ''
      const asVehicle = sellingOn && !!vehicle && capacity > 0 && !!listingName
      const created = await createMaterial(supplier.id, {
        master_material_id: item.id,
        name: asVehicle ? vehicleOptionName(listingName, vehicle, capacity, 'CFT') : label || item.name,
        category: item.material_types?.material_categories?.name ?? null,
        rate: 0,
        unit_label: asVehicle ? 'Load' : item.unit,
        per_label: null,
        stock_qty: 0,
        stock_unit: asVehicle ? 'Load' : null,
        ...(asVehicle
          ? { sold_by: 'vehicle' as const, listing_name: listingName, vehicle, capacity, capacity_unit: 'CFT' }
          : {}),
      })
      const list = await listMaterials()
      setMaterials(list)
      setView('mine')
      openEdit(created, list)
    } finally {
      setAddingCatalogId(null)
    }
  }

  const filtered = materials.filter(
    (m) => m.name.toLowerCase().includes(query.toLowerCase()) || (m.category ?? '').toLowerCase().includes(query.toLowerCase()),
  )
  // A new material is asked how it is sold — unless the database cannot
  // hold the answer yet, when it is the form it always was. Worked out here,
  // not when the dialog opens: ?new=1 opens it before that is known.
  const shownSoldBy: SoldBy | null = soldBy ?? (sellingOn ? null : 'unit')

  // A vehicle listing's options are one card; everything else its own.
  const cards: Material[][] = []
  const cardOf = new Map<string, Material[]>()
  for (const m of filtered) {
    const key = listingKey(m)
    const card = cardOf.get(key)
    if (card) card.push(m)
    else {
      const fresh = [m]
      cardOf.set(key, fresh)
      cards.push(fresh)
    }
  }

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

      <div className="mb-4 flex flex-wrap gap-2">
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
        <button
          onClick={() => setView('logs')}
          className={`rounded-full border px-3.5 py-2.5 text-xs font-medium ${view === 'logs' ? 'border-accent bg-accent-bg text-accent-text' : 'border-border text-muted'}`}
        >
          {t('slog.tab')}
        </button>
      </div>

      {view === 'logs' ? (
        <StockLogs materials={materials} />
      ) : view === 'mine' ? (
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
              {cards.map((group) => {
                const m = group[0]
                if (isVehicleOption(m)) {
                  group.sort(byLoad)
                  return (
                    <Card key={listingKey(m)}>
                      <div className="mb-2 flex items-start justify-between">
                        <div>
                          <div className="font-semibold text-ink">{mt(m.listing_name)}</div>
                          <div className="flex items-center gap-1 text-xs text-muted">
                            <Truck size={12} /> {t('sell.byVehicle')} · {mt(m.category) || '—'}
                          </div>
                        </div>
                        <button onClick={() => openEdit(m)} className="-m-3 p-3 text-muted hover:text-ink" aria-label="Edit">
                          <Pencil size={15} />
                        </button>
                      </div>
                      <div className="flex flex-col divide-y divide-border border-t border-border">
                        {group.map((o) => (
                          <div
                            key={o.id}
                            id={flashId(o.id)}
                            className={`flex items-center justify-between gap-2 py-2 text-sm ${stocked?.id === o.id ? 'flash-success' : ''}`}
                          >
                            <div className="min-w-0">
                              <div className="font-medium text-ink">{vehicleOptionLabel(o.vehicle!, o.capacity!, o.capacity_unit!)}</div>
                              <div className="text-xs text-muted">
                                {t('sell.perLoadPrice', { price: formatINR(o.rate) })}
                                {o.available === false && ` · ${t('sell.notAvailable')}`}
                              </div>
                            </div>
                            <div className="flex shrink-0 items-center gap-2">
                              {stocked?.id === o.id && (
                                <span className="flash-chip text-xs font-bold text-accent-text">{stocked.added}</span>
                              )}
                              <Badge tone={o.stock_qty <= (o.low_stock_threshold ?? 5) ? 'danger' : 'success'}>
                                {!o.stock_unit || /^loads?$/i.test(o.stock_unit.trim())
                                  ? t(loadsKey(Number(o.stock_qty)), { count: Number(o.stock_qty) })
                                  : `${o.stock_qty} ${mt(o.stock_unit)}`}
                              </Badge>
                            </div>
                          </div>
                        ))}
                      </div>
                    </Card>
                  )
                }
                return (
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
                )
              })}
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
          {sellingOn && !(editing && isVehicleOption(editing)) && (
            <div className="mb-4">
              <div className="mb-2 text-sm font-semibold text-ink">{t('sell.howSold')}</div>
              <div className="grid grid-cols-1 gap-2" role="radiogroup" aria-label={t('sell.howSold')}>
                {(['vehicle', 'unit'] as const).map((kind) => (
                  <button
                    key={kind}
                    type="button"
                    role="radio"
                    aria-checked={shownSoldBy === kind}
                    onClick={() => chooseSoldBy(kind)}
                    className={`flex items-start gap-3 rounded-xl border p-3 text-left ${shownSoldBy === kind ? 'border-accent bg-accent-bg' : 'border-border'}`}
                  >
                    <span className="mt-0.5 shrink-0 text-accent">{kind === 'vehicle' ? <Truck size={18} /> : <Package size={18} />}</span>
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold text-ink">
                        {t(kind === 'vehicle' ? 'sell.vehicleTitle' : 'sell.unitTitle')}
                      </span>
                      <span className="block text-xs text-muted">{t(kind === 'vehicle' ? 'sell.vehicleHintLong' : 'sell.unitHintLong')}</span>
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}
          {shownSoldBy === 'vehicle' && listing && supplier ? (
            <VehicleListingForm
              supplierId={supplier.id}
              initial={listing}
              notice={
                // A material with stock becoming a vehicle option: its stock
                // is left exactly as counted, in its own unit, to check.
                editing && !isVehicleOption(editing) && Number(editing.stock_qty) > 0
                  ? t('sell.stockKept', { qty: `${Number(editing.stock_qty)} ${mt(editing.stock_unit)}`.trim() })
                  : null
              }
              onSaved={() => {
                setModalOpen(false)
                void refresh()
              }}
            />
          ) : shownSoldBy === 'unit' ? (
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
              <div>
                <Label htmlFor="gst_rate">{t('gst.material')}</Label>
                <Input
                  id="gst_rate"
                  type="text"
                  inputMode="decimal"
                  value={form.gst_rate}
                  onChange={(e) => setForm({ ...form, gst_rate: sanitizeDecimal(e.target.value).slice(0, 5) })}
                />
              </div>
            </div>
            <div>
              <Label htmlFor="unit_label">{t('mat.unitLabel')}</Label>
              <Input
                id="unit_label"
                list="sale-units"
                value={form.unit_label}
                onChange={(e) => setForm({ ...form, unit_label: e.target.value })}
              />
              <datalist id="sale-units">
                {SALE_UNITS.map((u) => (
                  <option key={u} value={u} />
                ))}
              </datalist>
              {form.unit_label.trim() && Number(form.rate) > 0 && (
                <p className="mt-1.5 text-xs text-muted">
                  {t('sell.pricePerUnit', {
                    price: `₹${Number(form.rate).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`,
                    unit: form.unit_label.trim(),
                  })}
                </p>
              )}
            </div>
            {sellingOn && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="min_qty">{t('sell.minOrder')}</Label>
                  <Input
                    id="min_qty"
                    type="text"
                    inputMode="decimal"
                    placeholder={t('sell.optional')}
                    value={form.min_qty}
                    onChange={(e) => setForm({ ...form, min_qty: sanitizeDecimal(e.target.value).slice(0, 8) })}
                  />
                </div>
                <div>
                  <Label htmlFor="qty_step">{t('sell.qtyStep')}</Label>
                  <Input
                    id="qty_step"
                    type="text"
                    inputMode="decimal"
                    placeholder={t('sell.optional')}
                    value={form.qty_step}
                    onChange={(e) => setForm({ ...form, qty_step: sanitizeDecimal(e.target.value).slice(0, 8) })}
                  />
                </div>
                <div className="col-span-2">
                  <Label htmlFor="delivery_charge">{t('sell.deliveryPerOrder')}</Label>
                  <Input
                    id="delivery_charge"
                    type="text"
                    inputMode="decimal"
                    placeholder={t('sell.optional')}
                    value={form.delivery_charge}
                    onChange={(e) => setForm({ ...form, delivery_charge: sanitizeDecimal(e.target.value).slice(0, 9) })}
                  />
                </div>
              </div>
            )}
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
          ) : null}
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
