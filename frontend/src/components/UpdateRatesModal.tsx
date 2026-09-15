import { useEffect, useState } from 'react'
import { LoaderCircle } from 'lucide-react'
import { Modal } from '@/components/ui/modal'
import { Button } from '@/components/ui/button'
import { useLanguage } from '@/context/LanguageContext'
import { sanitizeDecimal } from '@/lib/numberInput'
import { cn } from '@/lib/utils'
import type { Material } from '@/lib/database.types'
import { listMaterials, updateMaterial } from '@/services/materials'

function formatINR(n: number) {
  return `₹${n.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`
}

/**
 * The Dashboard's "Update rates", right there: every material in stock with
 * its rate in a box, the ones changed marked with what they were, and one
 * Save for all of them. Only the rates that actually moved are written — the
 * same plain rate update Stock's edit form makes; nothing else about a
 * material changes. An emptied box saves as no rate.
 */
export function UpdateRatesModal({ onClose, onSaved }: { onClose: () => void; onSaved: (count: number) => void }) {
  const { t, mt } = useLanguage()
  const [materials, setMaterials] = useState<Material[] | null>(null)
  const [values, setValues] = useState<Record<string, string>>({})
  const [failed, setFailed] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    listMaterials()
      .then((list) => {
        setMaterials(list)
        setValues(Object.fromEntries(list.map((m) => [m.id, Number(m.rate) > 0 ? String(Number(m.rate)) : ''])))
      })
      .catch(() => setFailed(true))
  }, [])

  const changed = (materials ?? []).filter((m) => (Number(values[m.id]) || 0) !== Number(m.rate))

  async function save() {
    if (saving || changed.length === 0) return
    setSaving(true)
    setFailed(false)
    try {
      await Promise.all(changed.map((m) => updateMaterial(m.id, { rate: Number(values[m.id]) || 0 })))
      onSaved(changed.length)
    } catch {
      // Saving again is safe: each rate is simply set to the number in its box.
      setFailed(true)
      setSaving(false)
    }
  }

  return (
    <Modal title={t('rates.popupTitle')} onClose={onClose}>
      <div className="flex flex-col gap-3">
        <p className="text-xs text-muted">{t('rates.popupHint')}</p>

        {materials === null && !failed ? (
          <div className="flex justify-center py-6">
            <LoaderCircle size={20} className="animate-spin text-muted" />
          </div>
        ) : (
          <div className="-mx-1 flex max-h-[55vh] flex-col divide-y divide-border overflow-y-auto">
            {(materials ?? []).map((m) => {
              const unit = m.unit_label || m.per_label || ''
              const moved = (Number(values[m.id]) || 0) !== Number(m.rate)
              return (
                <label key={m.id} className="flex items-center gap-3 px-1 py-2.5">
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium text-ink">{mt(m.name)}</span>
                    <span className={cn('block text-xs', moved ? 'font-medium text-accent-text' : 'text-muted')}>
                      {moved ? t('rates.was', { amount: formatINR(Number(m.rate)) }) : mt(unit)}
                    </span>
                  </span>
                  <span
                    className={cn(
                      'flex shrink-0 items-center gap-1 rounded-lg border bg-card px-2.5 focus-within:border-accent',
                      moved ? 'border-accent' : 'border-border',
                    )}
                  >
                    <span className="text-sm text-muted">₹</span>
                    <input
                      type="text"
                      inputMode="decimal"
                      placeholder="0"
                      aria-label={t('rates.rateOf', { name: m.name })}
                      value={values[m.id] ?? ''}
                      onFocus={(e) => e.target.select()}
                      onChange={(e) => setValues((v) => ({ ...v, [m.id]: sanitizeDecimal(e.target.value).slice(0, 10) }))}
                      className="h-10 w-20 bg-transparent text-right text-sm font-medium text-ink outline-none"
                    />
                  </span>
                </label>
              )
            })}
          </div>
        )}

        {failed && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">{t('error.generic')}</p>}
        <Button onClick={save} disabled={saving || changed.length === 0} className="w-full">
          {saving ? t('common.saving') : changed.length > 0 ? t('rates.save', { count: changed.length }) : t('rates.saveNone')}
        </Button>
      </div>
    </Modal>
  )
}
