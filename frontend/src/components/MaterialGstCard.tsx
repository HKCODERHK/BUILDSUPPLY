import { useEffect, useState } from 'react'
import { LoaderCircle } from 'lucide-react'
import { Card, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/context/AuthContext'
import { useLanguage } from '@/context/LanguageContext'
import { sanitizeDecimal } from '@/lib/numberInput'
import { formatRate } from '@/lib/gst'
import { cn } from '@/lib/utils'
import type { Material } from '@/lib/database.types'
import { listMaterials, updateMaterial } from '@/services/materials'

/** The slabs a building-material supplier actually meets, in one tap. */
const SLABS = [0, 5, 12, 18, 28]

/**
 * Settings → Material GST (migration 035): the percentage each material is
 * taxed at, set once and then used by every bill — cement at 28, sand at 5,
 * and no picking a rate while billing.
 *
 * Only the materials whose percentage actually moved are written, the way
 * UpdateRatesModal writes only the rates that moved. Changing one here never
 * touches a bill that already exists: `invoice_items` keeps the percentage it
 * was saved with.
 */
export function MaterialGstCard() {
  const { supplier } = useAuth()
  const { t, mt } = useLanguage()
  const [materials, setMaterials] = useState<Material[] | null>(null)
  const [values, setValues] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(0)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    listMaterials()
      .then((list) => {
        setMaterials(list)
        setValues(Object.fromEntries(list.map((m) => [m.id, String(Number(m.gst_rate ?? 18))])))
      })
      .catch(() => setFailed(true))
  }, [])

  if (!supplier || supplier.role !== 'supplier') return null

  const rateOf = (id: string) => Math.min(100, Number(values[id]) || 0)
  const changed = (materials ?? []).filter((m) => rateOf(m.id) !== Number(m.gst_rate ?? 18))

  async function save() {
    if (saving || changed.length === 0) return
    setSaving(true)
    setFailed(false)
    try {
      await Promise.all(changed.map((m) => updateMaterial(m.id, { gst_rate: rateOf(m.id) })))
      const list = await listMaterials()
      setMaterials(list)
      setSaved(changed.length)
    } catch {
      // Saving again is safe: each percentage is simply set to what is typed.
      setFailed(true)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('gst.title')}</CardTitle>
      </CardHeader>
      <p className="mb-3 text-xs text-muted">{t('gst.intro')}</p>

      {materials === null && !failed ? (
        <div className="flex justify-center py-6">
          <LoaderCircle size={20} className="animate-spin text-muted" />
        </div>
      ) : materials && materials.length === 0 ? (
        <p className="py-4 text-sm text-muted">{t('gst.noMaterials')}</p>
      ) : (
        <div className="-mx-1 flex flex-col divide-y divide-border">
          {(materials ?? []).map((m) => {
            const moved = rateOf(m.id) !== Number(m.gst_rate ?? 18)
            return (
              <div key={m.id} className="px-1 py-3">
                <div className="flex items-center gap-3">
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium text-ink">{mt(m.name)}</span>
                    <span className={cn('block text-xs', moved ? 'font-medium text-accent-text' : 'text-muted')}>
                      {moved ? t('gst.was', { rate: formatRate(Number(m.gst_rate ?? 18)) }) : mt(m.unit_label || m.per_label || '')}
                    </span>
                  </span>
                  <span
                    className={cn(
                      'flex shrink-0 items-center rounded-lg border bg-card px-2.5 focus-within:border-accent',
                      moved ? 'border-accent' : 'border-border',
                    )}
                  >
                    <input
                      type="text"
                      inputMode="decimal"
                      placeholder="0"
                      aria-label={t('gst.rateOf', { name: m.name })}
                      value={values[m.id] ?? ''}
                      onFocus={(e) => e.target.select()}
                      onChange={(e) => setValues((v) => ({ ...v, [m.id]: sanitizeDecimal(e.target.value).slice(0, 5) }))}
                      className="h-10 w-14 bg-transparent text-right text-sm font-medium text-ink outline-none"
                    />
                    <span className="text-sm text-muted">%</span>
                  </span>
                </div>
                {/* The four slabs plus nil, so the common case is one tap. */}
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {SLABS.map((slab) => (
                    <button
                      key={slab}
                      type="button"
                      onClick={() => setValues((v) => ({ ...v, [m.id]: String(slab) }))}
                      className={cn(
                        'rounded-full border px-2.5 py-1 text-xs transition-colors',
                        rateOf(m.id) === slab ? 'border-accent bg-accent-bg font-medium text-accent-text' : 'border-border text-muted',
                      )}
                    >
                      {slab}%
                    </button>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {failed && <p className="mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">{t('error.generic')}</p>}
      {saved > 0 && changed.length === 0 && (
        <p className="mt-3 text-sm font-medium text-accent-text">{t('gst.saved', { count: saved })}</p>
      )}
      {materials !== null && materials.length > 0 && (
        <Button onClick={save} disabled={saving || changed.length === 0} className="mt-3 w-full">
          {saving ? t('common.saving') : changed.length > 0 ? t('gst.save', { count: changed.length }) : t('gst.saveNone')}
        </Button>
      )}
    </Card>
  )
}
