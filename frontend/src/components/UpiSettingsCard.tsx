import { useState } from 'react'
import { Card, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useAuth } from '@/context/AuthContext'
import { useLanguage } from '@/context/LanguageContext'
import { isValidUpiId, sanitizeUpiId } from '@/lib/upi'
import { saveUpiSettings } from '@/services/suppliers'

/**
 * Settings → UPI payments (migration 029): the supplier's UPI ID, and whether
 * their customers' khata links show "Pay by UPI" — off unless switched on.
 * The ID alone is enough for Show UPI QR on the customer page.
 */
export function UpiSettingsCard() {
  const { supplier, refreshSupplier } = useAuth()
  const { t } = useLanguage()
  const [upiId, setUpiId] = useState(supplier?.upi_id ?? '')
  const [enabled, setEnabled] = useState(supplier?.khata_upi_enabled ?? false)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!supplier || supplier.role !== 'supplier') return null

  async function save() {
    if (!supplier || saving) return
    const id = upiId.trim()
    if (id && !isValidUpiId(id)) {
      setError(t('upi.idInvalid'))
      return
    }
    if (enabled && !id) {
      setError(t('upi.needId'))
      return
    }
    setSaving(true)
    setSaved(false)
    setError(null)
    try {
      await saveUpiSettings(supplier.id, { upi_id: id || null, khata_upi_enabled: enabled })
      await refreshSupplier()
      setSaved(true)
    } catch (err) {
      setError(err instanceof Error && err.message === 'upi-invalid' ? t('upi.idInvalid') : t('error.generic'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card className="mt-4 max-w-lg">
      <CardHeader>
        <CardTitle>{t('upi.settingsTitle')}</CardTitle>
      </CardHeader>
      <p className="-mt-2 mb-4 text-xs text-muted">{t('upi.settingsHint')}</p>
      <div className="flex flex-col gap-4">
        <div>
          <Label htmlFor="upi-id">{t('upi.id')}</Label>
          <Input
            id="upi-id"
            value={upiId}
            inputMode="email"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            placeholder="name@okaxis"
            onChange={(e) => {
              setUpiId(sanitizeUpiId(e.target.value))
              setSaved(false)
              setError(null)
            }}
          />
          <p className="mt-1.5 text-xs text-muted">{t('upi.idHint')}</p>
        </div>
        <label className="flex items-start gap-2 text-sm text-ink">
          <input
            type="checkbox"
            className="mt-1"
            checked={enabled}
            onChange={(e) => {
              setEnabled(e.target.checked)
              setSaved(false)
              setError(null)
            }}
          />
          <span>
            <span className="font-medium">{t('upi.khataSwitch')}</span>
            <span className="block text-xs text-muted">{t('upi.khataSwitchHint')}</span>
          </span>
        </label>
        {error && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">{error}</p>}
        <div className="flex items-center gap-3">
          <Button onClick={save} disabled={saving}>
            {saving ? t('common.saving') : t('cust.saveChanges')}
          </Button>
          {saved && <span className="text-xs text-accent">{t('set.saved')}</span>}
        </div>
      </div>
    </Card>
  )
}
