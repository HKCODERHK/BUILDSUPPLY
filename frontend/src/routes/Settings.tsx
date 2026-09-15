import { useState, type ChangeEvent, type FormEvent } from 'react'
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { ArrowLeft, ChevronRight, Inbox, Languages, Lock, QrCode, ShieldCheck, Store, type LucideIcon } from 'lucide-react'
import { PageHeader } from '@/components/layout/PageHeader'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { PhoneInput } from '@/components/ui/phone-input'
import { Label } from '@/components/ui/label'
import { IconTile } from '@/components/IconTile'
import { CustomerAvatar } from '@/components/CustomerAvatar'
import { updateSupplierProfile, uploadLogo } from '@/services/suppliers'
import { sanitizePhone } from '@/lib/numberInput'
import { useAuth } from '@/context/AuthContext'
import { useLanguage } from '@/context/LanguageContext'
import { usePin } from '@/context/PinContext'
import { LANGUAGES } from '@/lib/i18n'
import { cn } from '@/lib/utils'
import { PinSettingsCard } from '@/components/PinSettingsCard'
import { ChangePasswordCard } from '@/components/ChangePasswordCard'
import { OrderSettingsCard } from '@/components/OrderSettingsCard'
import { UpiSettingsCard } from '@/components/UpiSettingsCard'

type Section = 'business' | 'orders' | 'upi' | 'language' | 'pin' | 'password'

interface Row {
  id: Section
  icon: LucideIcon
  colour: string
  label: string
  /** The short status on the right — "On", "English", the UPI ID. */
  detail?: string
}

/**
 * Settings, Telegram-style: the business on a card at the top, then short
 * rows with coloured icons, each opening its own section (`?s=<section>`, so
 * the phone's back gesture returns to the list). Every card inside a section
 * is the one this page always had — nothing was removed, only sorted. Other
 * screens link straight to a section: Orders → `?s=orders`, the UPI QR →
 * `?s=upi`, the Start-here card → `?s=business`.
 */
export default function Settings() {
  const { supplier } = useAuth()
  const { lang, setLang, t } = useLanguage()
  const { hasPin } = usePin()
  const navigate = useNavigate()
  const location = useLocation()
  const [searchParams] = useSearchParams()
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

  // Online orders and UPI are a supplier's; the admin's own settings are the
  // rest (their cards already hide themselves for the admin).
  const isSupplier = supplier?.role === 'supplier'
  const groups: Row[][] = [
    [
      { id: 'business', icon: Store, colour: '#2F76C0', label: t('set.title') },
      ...(isSupplier
        ? [
            {
              id: 'orders' as const,
              icon: Inbox,
              colour: '#2E9150',
              label: t('ord.settingsTitle'),
              detail: t(supplier?.ordering_enabled ? 'set.on' : 'set.off'),
            },
            {
              id: 'upi' as const,
              icon: QrCode,
              colour: '#7A5BC7',
              label: t('upi.settingsTitle'),
              detail: supplier?.upi_id || t('set.notSet'),
            },
          ]
        : []),
    ],
    [
      {
        id: 'language',
        icon: Languages,
        colour: '#D2702A',
        label: t('set.language'),
        detail: LANGUAGES.find((l) => l.code === lang)?.label,
      },
      { id: 'pin', icon: ShieldCheck, colour: '#D14D4D', label: t('pin.title'), detail: t(hasPin ? 'set.on' : 'set.off') },
      { id: 'password', icon: Lock, colour: '#5B6B7A', label: t('set.pwTitle') },
    ],
  ]

  const asked = searchParams.get('s')
  const section = groups.flat().find((r) => r.id === asked)?.id ?? null

  function open(id: Section) {
    navigate(`/settings?s=${id}`, { state: { fromList: true } })
  }

  // Opened from the list: back is simply the previous screen. Opened straight
  // from another screen (Orders' "Set up order link", say): to the list, which
  // takes this section's place so back then returns to that screen.
  function backToList() {
    if ((location.state as { fromList?: boolean } | null)?.fromList) navigate(-1)
    else navigate('/settings', { replace: true })
  }

  if (section) {
    return (
      <div>
        <button
          type="button"
          onClick={backToList}
          className="mb-3 inline-flex items-center gap-1.5 py-1 text-sm font-semibold text-accent-text hover:text-accent"
        >
          <ArrowLeft size={16} /> {t('nav.settings')}
        </button>

        {section === 'business' && (
          <>
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
                  <p className="mt-1.5 text-xs text-muted">{t('set.gstHint')}</p>
                </div>
                <div className="flex items-center gap-3">
                  <Button type="submit" disabled={saving}>
                    {saving ? t('common.saving') : t('cust.saveChanges')}
                  </Button>
                  {saved && <span className="text-xs text-accent">{t('set.saved')}</span>}
                </div>
              </form>
            </Card>
          </>
        )}

        {section === 'orders' && <OrderSettingsCard />}
        {section === 'upi' && <UpiSettingsCard />}

        {/* Documents stay in English on purpose: a bill goes to customers,
            engineers and banks who may not read Devanagari, and a supplier
            switching their own app language shouldn't change what a customer
            receives. */}
        {section === 'language' && (
          <Card className="max-w-lg">
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
        )}

        {section === 'pin' && <PinSettingsCard showPaymentThreshold />}
        {section === 'password' && <ChangePasswordCard />}
      </div>
    )
  }

  return (
    <div>
      <PageHeader title={t('nav.settings')} />

      {/* The business itself, as Telegram puts the account on top. */}
      <button
        type="button"
        onClick={() => open('business')}
        className="mb-4 flex w-full max-w-lg items-center gap-4 rounded-2xl border border-border bg-card p-4 text-left transition-colors hover:bg-surface"
      >
        {supplier?.logo_url ? (
          <img src={supplier.logo_url} alt="" className="h-14 w-14 shrink-0 rounded-full border border-border object-cover" />
        ) : (
          <CustomerAvatar id={supplier?.id ?? ''} name={supplier?.business_name ?? ''} size={56} />
        )}
        <span className="min-w-0 flex-1">
          <span className="block break-words text-base font-bold text-ink">{supplier?.business_name}</span>
          <span className="block text-sm text-muted">{supplier?.phone || supplier?.email}</span>
        </span>
        <ChevronRight size={18} className="shrink-0 text-muted-2" />
      </button>

      {groups.map((group) => (
        <Card key={group[0].id} className="mb-4 max-w-lg overflow-hidden p-0 sm:p-0">
          {group.map((row, i) => (
            <button
              key={row.id}
              type="button"
              onClick={() => open(row.id)}
              className={cn(
                'flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-surface',
                i > 0 && 'border-t border-border',
              )}
            >
              <IconTile icon={row.icon} colour={row.colour} />
              <span className="min-w-0 flex-1 text-sm font-medium text-ink">{row.label}</span>
              {row.detail && <span className="max-w-[45%] truncate text-xs text-muted">{row.detail}</span>}
              <ChevronRight size={16} className="shrink-0 text-muted-2" />
            </button>
          ))}
        </Card>
      ))}
    </div>
  )
}
