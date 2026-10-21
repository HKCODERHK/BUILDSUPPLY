import { useState, type FormEvent } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useLanguage } from '@/context/LanguageContext'
import { sanitizeDecimal } from '@/lib/numberInput'
import { CAPACITY_UNITS, TRUCK_CFT_SIZES, VEHICLE_SUGGESTIONS, blankVehicleOption as blankOption, vehicleOptionLabel, vehicleOptionName, type VehicleOptionDraft } from '@/lib/sellingType'
import { removeVehicleOption, saveVehicleListing, type VehicleOptionInput } from '@/services/materials'
import { cn } from '@/lib/utils'

interface OptionDraft extends VehicleOptionDraft {
  key: string
}

export interface VehicleListingInitial {
  listing_name: string
  category: string
  gst_rate: string
  options: VehicleOptionDraft[]
}

type RowProblem = 'vehicle' | 'capacity' | 'rate'

function formatINR(n: number) {
  return `₹${n.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`
}

/**
 * A vehicle-based material (migration 050): one name — "River Sand" — and
 * the vehicles the shop delivers it in, each with what one load carries and
 * its price per load. Every option is its own material underneath, so a bill,
 * stock and GST treat it exactly as any other material.
 */
export function VehicleListingForm({
  supplierId,
  initial,
  notice,
  onSaved,
}: {
  supplierId: string
  initial: VehicleListingInitial
  /** Something the supplier should know before saving, e.g. stock to recount. */
  notice?: string | null
  onSaved: () => void
}) {
  const { t } = useLanguage()
  const [name, setName] = useState(initial.listing_name)
  const [category, setCategory] = useState(initial.category)
  const [gst, setGst] = useState(initial.gst_rate)
  const [options, setOptions] = useState<OptionDraft[]>(() =>
    (initial.options.length ? initial.options : [blankOption()]).map((o) => ({ ...o, key: crypto.randomUUID() })),
  )
  const [problems, setProblems] = useState<Record<string, RowProblem[]>>({})
  const [error, setError] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [removing, setRemoving] = useState<string | null>(null)

  function update(key: string, patch: Partial<OptionDraft>) {
    setOptions((prev) => prev.map((o) => (o.key === key ? { ...o, ...patch } : o)))
    setProblems((prev) => ({ ...prev, [key]: [] }))
    setError(null)
  }

  async function remove(o: OptionDraft) {
    setNote(null)
    if (!o.id) {
      setOptions((prev) => prev.filter((x) => x.key !== o.key))
      return
    }
    setRemoving(o.key)
    try {
      // On a bill or in the stock history it stays, switched off, so those
      // records still lead back to it; otherwise it goes.
      const outcome = await removeVehicleOption(o.id)
      if (outcome === 'disabled') {
        update(o.key, { available: false })
        setNote(t('sell.keptOff'))
      } else {
        setOptions((prev) => prev.filter((x) => x.key !== o.key))
      }
    } catch {
      setError(t('error.generic'))
    } finally {
      setRemoving(null)
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (saving) return
    setNote(null)
    if (!name.trim()) return setError(t('sell.nameNeeded'))
    if (options.length === 0) return setError(t('sell.optionNeeded'))
    const found: Record<string, RowProblem[]> = {}
    for (const o of options) {
      const list: RowProblem[] = []
      if (!o.vehicle.trim()) list.push('vehicle')
      if (!(Number(o.capacity) > 0) || !o.capacity_unit.trim()) list.push('capacity')
      if (!(Number(o.rate) > 0)) list.push('rate')
      if (list.length) found[o.key] = list
    }
    // The same vehicle and capacity twice is two prices for one thing.
    const seen = new Set<string>()
    for (const o of options) {
      const sig = `${o.vehicle.trim().toLowerCase()}|${Number(o.capacity)}|${o.capacity_unit.trim().toLowerCase()}`
      if (seen.has(sig)) found[o.key] = [...(found[o.key] ?? []), 'capacity']
      seen.add(sig)
    }
    setProblems(found)
    if (Object.keys(found).length) return setError(t('sell.fixOptions'))

    const inputs: VehicleOptionInput[] = options.map((o) => ({
      id: o.id,
      vehicle: o.vehicle,
      capacity: Number(o.capacity),
      capacity_unit: o.capacity_unit,
      rate: Number(o.rate),
      delivery_charge: o.delivery_charge.trim() ? Number(o.delivery_charge) : null,
      available: o.available,
    }))
    setSaving(true)
    setError(null)
    try {
      await saveVehicleListing(
        supplierId,
        { listing_name: name, category: category.trim() || null, gst_rate: Math.min(100, Number(gst) || 0), options: inputs },
        (o) => vehicleOptionName(name, o.vehicle, o.capacity, o.capacity_unit),
      )
      onSaved()
    } catch (err) {
      setError(err instanceof Error && err.message === 'duplicate-option' ? t('sell.duplicateOption') : t('error.generic'))
    } finally {
      // Whatever saved keeps its id, so Save again never adds it twice.
      setOptions((prev) => prev.map((o, i) => ({ ...o, id: inputs[i]?.id ?? o.id })))
      setSaving(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div>
        <Label htmlFor="listing-name" required>{t('sell.materialName')}</Label>
        <Input id="listing-name" value={name} maxLength={80} placeholder={t('sell.materialNameHint')} onChange={(e) => setName(e.target.value)} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label htmlFor="listing-category">{t('mat.category')}</Label>
          <Input id="listing-category" value={category} onChange={(e) => setCategory(e.target.value)} />
        </div>
        <div>
          <Label htmlFor="listing-gst">{t('gst.material')}</Label>
          <Input
            id="listing-gst"
            type="text"
            inputMode="decimal"
            value={gst}
            onChange={(e) => setGst(sanitizeDecimal(e.target.value).slice(0, 5))}
          />
        </div>
      </div>

      {notice && <p className="rounded-lg bg-amber-50 p-3 text-xs text-amber-700 dark:bg-amber-950 dark:text-amber-300">{notice}</p>}
      <div>
        <div className="text-sm font-semibold text-ink">{t('sell.vehicleOptions')}</div>
        <p className="mt-0.5 text-xs text-muted">{t('sell.vehicleOptionsHint')}</p>
      </div>

      <datalist id="vehicle-suggestions">
        {VEHICLE_SUGGESTIONS.map((v) => (
          <option key={v} value={v} />
        ))}
      </datalist>

      {options.map((o, i) => {
        const bad = problems[o.key] ?? []
        const ready = o.vehicle.trim() && Number(o.capacity) > 0 && o.capacity_unit.trim()
        return (
          <div key={o.key} className={cn('flex flex-col gap-3 rounded-xl border p-3', o.available ? 'border-border' : 'border-dashed border-border bg-surface')}>
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-semibold text-muted">{t('sell.optionN', { n: i + 1 })}</span>
              <button
                type="button"
                onClick={() => remove(o)}
                disabled={removing === o.key}
                className="-m-2 flex items-center gap-1 p-2 text-xs font-medium text-red-600 disabled:opacity-50"
              >
                <Trash2 size={13} /> {t('sell.remove')}
              </button>
            </div>
            <div>
              <Label htmlFor={`veh-${o.key}`} required>{t('sell.vehicle')}</Label>
              <Input
                id={`veh-${o.key}`}
                list="vehicle-suggestions"
                maxLength={40}
                placeholder={t('sell.vehicleHint')}
                value={o.vehicle}
                aria-invalid={bad.includes('vehicle')}
                onChange={(e) => update(o.key, { vehicle: e.target.value })}
              />
              {bad.includes('vehicle') && <p className="mt-1 text-xs text-red-600">{t('sell.vehicleNeeded')}</p>}
            </div>
            <div>
              <Label htmlFor={`cap-${o.key}`} required>{t('sell.capacity')}</Label>
              <div className="grid grid-cols-2 gap-2">
                <Input
                  id={`cap-${o.key}`}
                  type="text"
                  inputMode="decimal"
                  placeholder="800"
                  value={o.capacity}
                  aria-invalid={bad.includes('capacity')}
                  onChange={(e) => update(o.key, { capacity: sanitizeDecimal(e.target.value).slice(0, 9) })}
                />
                <select
                  aria-label={t('sell.capacityUnit')}
                  value={o.capacity_unit}
                  onChange={(e) => update(o.key, { capacity_unit: e.target.value })}
                  className="h-10 w-full rounded-lg border border-border bg-card px-3 text-sm outline-none focus:border-accent"
                >
                  {[...new Set([...CAPACITY_UNITS, o.capacity_unit].filter(Boolean))].map((u) => (
                    <option key={u} value={u}>
                      {u}
                    </option>
                  ))}
                </select>
              </div>
              {/* The sizes trucks commonly carry here, one tap each (the user's ask). */}
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                <span className="text-[11px] text-muted">{t('sell.quickSizes')}:</span>
                {TRUCK_CFT_SIZES.map((cft) => (
                  <button
                    key={cft}
                    type="button"
                    onClick={() => update(o.key, { capacity: String(cft), capacity_unit: 'CFT' })}
                    className={cn(
                      'h-8 rounded-full border px-2.5 text-xs font-semibold',
                      Number(o.capacity) === cft && o.capacity_unit === 'CFT' ? 'border-accent bg-accent text-white' : 'border-border text-ink',
                    )}
                  >
                    {cft.toLocaleString('en-IN')} CFT
                  </button>
                ))}
              </div>
              {bad.includes('capacity') && <p className="mt-1 text-xs text-red-600">{t('sell.capacityNeeded')}</p>}
            </div>
            {/* Bottom-aligned: a label that wraps (Hindi, Marathi) must not push its box out of line. */}
            <div className="grid grid-cols-2 items-end gap-2">
              <div>
                <Label htmlFor={`rate-${o.key}`} required>{t('sell.pricePerLoad')}</Label>
                <Input
                  id={`rate-${o.key}`}
                  type="text"
                  inputMode="decimal"
                  value={o.rate}
                  aria-invalid={bad.includes('rate')}
                  onChange={(e) => update(o.key, { rate: sanitizeDecimal(e.target.value).slice(0, 10) })}
                />
              </div>
              <div>
                <Label htmlFor={`del-${o.key}`}>{t('sell.deliveryPerLoad')}</Label>
                <Input
                  id={`del-${o.key}`}
                  type="text"
                  inputMode="decimal"
                  placeholder={t('sell.optional')}
                  value={o.delivery_charge}
                  onChange={(e) => update(o.key, { delivery_charge: sanitizeDecimal(e.target.value).slice(0, 9) })}
                />
              </div>
            </div>
            {bad.includes('rate') && <p className="-mt-2 text-xs text-red-600">{t('sell.rateNeeded')}</p>}
            <label className="flex items-center gap-2 text-sm text-ink">
              <input
                type="checkbox"
                checked={o.available}
                onChange={(e) => update(o.key, { available: e.target.checked })}
                className="h-4 w-4 accent-[var(--color-accent)]"
              />
              {t('sell.availableToOrder')}
            </label>
            {ready && (
              <p className="rounded-lg bg-accent-bg px-3 py-2 text-xs text-accent-text">
                {vehicleOptionLabel(o.vehicle, o.capacity, o.capacity_unit)}
                {Number(o.rate) > 0 && ` — ${t('sell.perLoadPrice', { price: formatINR(Number(o.rate)) })}`}
                {!o.available && ` · ${t('sell.notAvailable')}`}
              </p>
            )}
          </div>
        )
      })}

      <Button type="button" variant="outline" onClick={() => setOptions((prev) => [...prev, { ...blankOption(), key: crypto.randomUUID() }])}>
        <Plus size={16} /> {t('sell.addOption')}
      </Button>

      {note && <p className="rounded-lg bg-amber-50 p-3 text-xs text-amber-700 dark:bg-amber-950 dark:text-amber-300">{note}</p>}
      {error && (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      )}
      <Button type="submit" disabled={saving}>
        {saving ? t('common.saving') : t('common.save')}
      </Button>
    </form>
  )
}
