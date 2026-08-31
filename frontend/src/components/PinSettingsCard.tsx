import { useEffect, useState } from 'react'
import { Card, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { setPin, clearPin } from '@/services/pin'
import { updateSupplierProfile } from '@/services/suppliers'
import { sanitizeDigits } from '@/lib/numberInput'
import { usePin } from '@/context/PinContext'
import { useAuth } from '@/context/AuthContext'
import { useLanguage } from '@/context/LanguageContext'

/**
 * Turning the confirmation PIN on, changing it, or turning it off. Shared by
 * the supplier's Settings and the admin's Platform Settings — both are the
 * same account model, so there is no reason for two of these.
 *
 * The payment threshold is supplier-only: an admin never records payments.
 */
export function PinSettingsCard({ showPaymentThreshold = false }: { showPaymentThreshold?: boolean }) {
  const { hasPin, refreshPinStatus } = usePin()
  const { supplier, refreshSupplier } = useAuth()
  const { t } = useLanguage()
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [threshold, setThreshold] = useState('')
  const [savingThreshold, setSavingThreshold] = useState(false)

  useEffect(() => {
    if (supplier?.pin_payment_threshold != null) setThreshold(String(supplier.pin_payment_threshold))
  }, [supplier?.pin_payment_threshold])

  function reset() {
    setCurrent('')
    setNext('')
  }

  async function save() {
    if (next.length !== 4) return
    setBusy(true)
    setError(null)
    setNotice(null)
    try {
      const result = await setPin(next, hasPin ? current : undefined)
      if (!result.ok) {
        setError(result.error ?? t('pin.failed'))
        return
      }
      setNotice(t('pin.saved'))
      reset()
      await refreshPinStatus()
    } catch {
      setError(t('pin.failed'))
    } finally {
      setBusy(false)
    }
  }

  async function remove() {
    if (current.length !== 4) return
    setBusy(true)
    setError(null)
    setNotice(null)
    try {
      const result = await clearPin(current)
      if (!result.ok) {
        setError(result.error ?? t('pin.failed'))
        return
      }
      setNotice(t('pin.removed'))
      reset()
      await refreshPinStatus()
    } catch {
      setError(t('pin.failed'))
    } finally {
      setBusy(false)
    }
  }

  async function saveThreshold() {
    if (!supplier) return
    setSavingThreshold(true)
    try {
      await updateSupplierProfile(supplier.id, { pin_payment_threshold: Number(threshold) || 0 })
      await refreshSupplier()
    } finally {
      setSavingThreshold(false)
    }
  }

  return (
    <Card className="mb-4 max-w-lg">
      <CardHeader>
        <CardTitle>{t('pin.title')}</CardTitle>
        <Badge tone={hasPin ? 'success' : 'neutral'}>{hasPin ? t('pin.isSet') : t('pin.notSet')}</Badge>
      </CardHeader>
      <p className="mb-4 text-xs text-muted">{t('pin.hint')}</p>

      <div className="flex flex-col gap-3">
        {hasPin && (
          <div>
            <Label htmlFor="pin-current">{t('pin.currentPin')}</Label>
            <Input
              id="pin-current"
              type="password"
              inputMode="numeric"
              autoComplete="off"
              maxLength={4}
              className="max-w-32 tracking-[0.4em]"
              value={current}
              onChange={(e) => setCurrent(sanitizeDigits(e.target.value).slice(0, 4))}
            />
          </div>
        )}
        <div>
          <Label htmlFor="pin-new">{t('pin.newPin')}</Label>
          <Input
            id="pin-new"
            type="password"
            inputMode="numeric"
            autoComplete="off"
            maxLength={4}
            className="max-w-32 tracking-[0.4em]"
            value={next}
            onChange={(e) => setNext(sanitizeDigits(e.target.value).slice(0, 4))}
          />
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}
        {notice && <p className="text-sm text-accent">{notice}</p>}

        <div className="flex flex-wrap gap-2">
          <Button size="sm" disabled={busy || next.length !== 4 || (hasPin && current.length !== 4)} onClick={save}>
            {hasPin ? t('pin.changeIt') : t('pin.setIt')}
          </Button>
          {hasPin && (
            <Button size="sm" variant="outline" disabled={busy || current.length !== 4} onClick={remove}>
              {t('pin.removeIt')}
            </Button>
          )}
        </div>
      </div>

      {showPaymentThreshold && hasPin && (
        <div className="mt-5 border-t border-border pt-4">
          <Label htmlFor="pin-threshold">{t('pin.threshold')}</Label>
          <div className="flex items-center gap-2">
            <Input
              id="pin-threshold"
              type="text"
              inputMode="decimal"
              className="max-w-40"
              value={threshold}
              onChange={(e) => setThreshold(sanitizeDigits(e.target.value))}
            />
            <Button size="sm" variant="outline" disabled={savingThreshold} onClick={saveThreshold}>
              {savingThreshold ? t('common.saving') : t('common.save')}
            </Button>
          </div>
        </div>
      )}
    </Card>
  )
}
