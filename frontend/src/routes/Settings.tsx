import { useState, type ChangeEvent, type FormEvent } from 'react'
import { PageHeader } from '@/components/layout/PageHeader'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { PhoneInput } from '@/components/ui/phone-input'
import { Label } from '@/components/ui/label'
import { updateSupplierProfile, uploadLogo } from '@/services/suppliers'
import { sanitizePhone } from '@/lib/numberInput'
import { useAuth } from '@/context/AuthContext'
import { useLanguage } from '@/context/LanguageContext'
import { LANGUAGES } from '@/lib/i18n'
import { cn } from '@/lib/utils'
import { PinSettingsCard } from '@/components/PinSettingsCard'
import { ChangePasswordCard } from '@/components/ChangePasswordCard'
import { OrderSettingsCard } from '@/components/OrderSettingsCard'
import { UpiSettingsCard } from '@/components/UpiSettingsCard'

export default function Settings() {
  const { supplier } = useAuth()
  const { lang, setLang, t } = useLanguage()
  const [form, setForm] = useState({
    business_name: supplier?.business_name ?? '',
    // A number saved before the phone field cleaned itself may still carry
    // "+91 " — tidied here, so saving the form stores just the 10 digits.
    phone: sanitizePhone(supplier?.phone ?? ''),
    address: supplier?.address ?? '',
    gst_number: supplier?.gst_number ?? '',
  })
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [uploading, setUploading] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!supplier) return
    setSaving(true)
    setSaved(false)
    try {
      await updateSupplierProfile(supplier.id, form)
      setSaved(true)
    } finally {
      setSaving(false)
    }
  }

  async function handleLogoChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file || !supplier) return
    setUploading(true)
    try {
      await uploadLogo(supplier.id, file)
    } finally {
      setUploading(false)
    }
  }

  return (
    <div>
      <PageHeader title={t('set.title')} subtitle={t('set.subtitle')} />

      {/* Documents stay in English on purpose: a bill goes to customers,
          engineers and banks who may not read Devanagari, and a supplier
          switching their own app language shouldn't change what a customer
          receives. */}
      <Card className="mb-4 max-w-lg">
        <Label>{t('set.language')}</Label>
        <div className="flex flex-wrap gap-2">
          {LANGUAGES.map((l) => (
            <button
              key={l.code}
              type="button"
              onClick={() => setLang(l.code)}
              className={cn(
                'rounded-full border px-3.5 py-2.5 text-sm font-medium transition-colors',
                lang === l.code ? 'border-accent bg-accent-bg text-accent-text' : 'border-border text-muted hover:text-ink',
              )}
            >
              {l.label}
            </button>
          ))}
        </div>
        <p className="mt-2 text-xs text-muted">{t('set.languageHint')}</p>
      </Card>

      <PinSettingsCard showPaymentThreshold />

      <Card className="mb-4 max-w-lg">
        <Label>{t('set.logo')}</Label>
        <div className="flex items-center gap-4">
          {supplier?.logo_url ? (
            <img src={supplier.logo_url} alt={t('set.logo')} className="h-16 w-16 rounded-lg border border-border object-cover" />
          ) : (
            <div className="flex h-16 w-16 items-center justify-center rounded-lg border border-dashed border-border text-xs text-muted-2">
              {t('set.noLogo')}
            </div>
          )}
          <label className="cursor-pointer text-sm font-semibold text-accent">
            {uploading ? t('set.uploading') : t('set.uploadLogo')}
            <input type="file" accept="image/*" className="hidden" onChange={handleLogoChange} disabled={uploading} />
          </label>
        </div>
      </Card>

      <Card className="max-w-lg">
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div>
            <Label htmlFor="business_name" required>{t('set.businessName')}</Label>
            <Input
              id="business_name"
              required
              value={form.business_name}
              onChange={(e) => setForm({ ...form, business_name: e.target.value })}
            />
          </div>
          <div>
            <Label htmlFor="phone">{t('common.phone')}</Label>
            <PhoneInput id="phone" value={form.phone} onValueChange={(phone) => setForm({ ...form, phone })} />
          </div>
          <div>
            {/* Printed in the FROM block of every invoice, estimate and
                statement — without it those PDFs go out with no address. */}
            <Label htmlFor="address">{t('set.businessAddress')}</Label>
            <Input
              id="address"
              placeholder={t('set.addressHint')}
              value={form.address}
              onChange={(e) => setForm({ ...form, address: e.target.value })}
            />
          </div>
          <div>
            <Label htmlFor="gst">{t('set.gstNumber')}</Label>
            <Input
              id="gst"
              placeholder={t('set.gstPlaceholder')}
              value={form.gst_number}
              onChange={(e) => setForm({ ...form, gst_number: e.target.value })}
            />
            <p className="mt-1.5 text-xs text-muted">
              {t('set.gstHint')}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Button type="submit" disabled={saving}>
              {saving ? t('common.saving') : t('cust.saveChanges')}
            </Button>
            {saved && <span className="text-xs text-accent">{t('set.saved')}</span>}
          </div>
        </form>
      </Card>

      <OrderSettingsCard />
      <UpiSettingsCard />

      <ChangePasswordCard />
    </div>
  )
}
