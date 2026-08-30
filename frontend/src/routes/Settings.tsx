import { useState, type ChangeEvent, type FormEvent } from 'react'
import { PageHeader } from '@/components/layout/PageHeader'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { updateSupplierProfile, uploadLogo } from '@/services/suppliers'
import { useAuth } from '@/context/AuthContext'
import { useLanguage } from '@/context/LanguageContext'
import { LANGUAGES } from '@/lib/i18n'
import { cn } from '@/lib/utils'

export default function Settings() {
  const { supplier } = useAuth()
  const { lang, setLang, t } = useLanguage()
  const [form, setForm] = useState({
    business_name: supplier?.business_name ?? '',
    phone: supplier?.phone ?? '',
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
      <PageHeader title="Business profile" subtitle="Your business details, shown on invoices" />

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
                'rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors',
                lang === l.code ? 'border-accent bg-accent-bg text-accent-text' : 'border-border text-muted hover:text-ink',
              )}
            >
              {l.label}
            </button>
          ))}
        </div>
        <p className="mt-2 text-xs text-muted">{t('set.languageHint')}</p>
      </Card>

      <Card className="mb-4 max-w-lg">
        <Label>Business logo</Label>
        <div className="flex items-center gap-4">
          {supplier?.logo_url ? (
            <img src={supplier.logo_url} alt="Business logo" className="h-16 w-16 rounded-lg border border-border object-cover" />
          ) : (
            <div className="flex h-16 w-16 items-center justify-center rounded-lg border border-dashed border-border text-xs text-muted-2">
              No logo
            </div>
          )}
          <label className="cursor-pointer text-sm font-semibold text-accent">
            {uploading ? 'Uploading…' : 'Upload new logo'}
            <input type="file" accept="image/*" className="hidden" onChange={handleLogoChange} disabled={uploading} />
          </label>
        </div>
      </Card>

      <Card className="max-w-lg">
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div>
            <Label htmlFor="business_name">Business name</Label>
            <Input
              id="business_name"
              required
              value={form.business_name}
              onChange={(e) => setForm({ ...form, business_name: e.target.value })}
            />
          </div>
          <div>
            <Label htmlFor="phone">Phone</Label>
            <Input id="phone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          </div>
          <div>
            {/* Printed in the FROM block of every invoice, estimate and
                statement — without it those PDFs go out with no address. */}
            <Label htmlFor="address">Business address</Label>
            <Input
              id="address"
              placeholder="Shown on every bill and statement"
              value={form.address}
              onChange={(e) => setForm({ ...form, address: e.target.value })}
            />
          </div>
          <div>
            <Label htmlFor="gst">GST number</Label>
            <Input
              id="gst"
              placeholder="Leave blank if you are not GST registered"
              value={form.gst_number}
              onChange={(e) => setForm({ ...form, gst_number: e.target.value })}
            />
            <p className="mt-1.5 text-xs text-muted">
              Leave this blank and new bills will start with GST switched off.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Button type="submit" disabled={saving}>
              {saving ? 'Saving…' : 'Save changes'}
            </Button>
            {saved && <span className="text-xs text-accent">Saved!</span>}
          </div>
        </form>
      </Card>
    </div>
  )
}
