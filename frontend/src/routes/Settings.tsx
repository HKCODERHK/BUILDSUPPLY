import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from 'react'
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { ArrowLeft, Inbox, Languages, Lock, LogOut, Pencil, QrCode, ShieldCheck, Store, type LucideIcon } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { PhoneInput } from '@/components/ui/phone-input'
import { Label } from '@/components/ui/label'
import { CustomerAvatar } from '@/components/CustomerAvatar'
import { updateSupplierProfile, uploadLogo } from '@/services/suppliers'
import { sanitizePhone } from '@/lib/numberInput'
import { patternCssUrl } from '@/lib/qrPattern'
import { useAuth } from '@/context/AuthContext'
import { useLanguage } from '@/context/LanguageContext'
import { usePin } from '@/context/PinContext'
import { useTopBar } from '@/context/TopBarContext'
import { LANGUAGES } from '@/lib/i18n'
import { cn } from '@/lib/utils'
import { PinSettingsCard } from '@/components/PinSettingsCard'
import { ChangePasswordCard } from '@/components/ChangePasswordCard'
import { OrderSettingsCard } from '@/components/OrderSettingsCard'
import { UpiSettingsCard } from '@/components/UpiSettingsCard'
import { OrderLinkShareModal } from '@/components/OrderLinkShareModal'
import { orderPageUrl } from '@/services/orders'

type Section = 'business' | 'orders' | 'upi' | 'language' | 'pin' | 'password'

interface Row {
  id: Section
  icon: LucideIcon
  label: string
  /** The grey line under the title — what it is, or its state. */
  detail?: string
}

/**
 * Settings, the way WhatsApp lays out its own: the business on a doodled band
 * at the top — the logo large, the name under it — then plain rows, each a
 * grey outline icon, a title and a line saying what it is or its state, each
 * opening its own section (`?s=<section>`, so the phone's back gesture returns
 * to the list). Every card inside a section is the one this page always had —
 * nothing was removed, only sorted. Other screens link straight to a section:
 * Orders → `?s=orders`, the UPI QR → `?s=upi`, the Start-here card →
 * `?s=business`.
 */
export default function Settings() {
  const { supplier, signOut } = useAuth()
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
  const [logoFailed, setLogoFailed] = useState(false)

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
      { id: 'business', icon: Store, label: t('set.title'), detail: t('set.rowBusinessSub') },
      ...(isSupplier
        ? [
            {
              id: 'orders' as const,
              icon: Inbox,
              label: t('ord.settingsTitle'),
              detail: `${t(supplier?.ordering_enabled ? 'set.on' : 'set.off')} · ${t('set.ordersSub')}`,
            },
            {
              id: 'upi' as const,
              icon: QrCode,
              label: t('upi.settingsTitle'),
              detail: supplier?.upi_id || t('set.notSet'),
            },
          ]
        : []),
    ],
    [
      { id: 'language', icon: Languages, label: t('set.language'), detail: LANGUAGES.find((l) => l.code === lang)?.label },
      { id: 'pin', icon: ShieldCheck, label: t('pin.title'), detail: `${t(hasPin ? 'set.on' : 'set.off')} · ${t('set.pinSub')}` },
      { id: 'password', icon: Lock, label: t('set.pwTitle'), detail: t('set.pwSub') },
    ],
  ]

  const asked = searchParams.get('s')
  const sectionRow = groups.flat().find((r) => r.id === asked)
  const section = sectionRow?.id ?? null
  // No PageHeader here, so name the screen for the phone's top bar directly.
  // The Profile tab (its logo in the tab bar) opens this page. Once the
  // business's own name has scrolled up under the top bar, the bar shows its
  // logo and name instead of "Profile" — as Telegram's profile does — and
  // "Profile" again back at the top.
  const nameRef = useRef<HTMLButtonElement>(null)
  const [nameGone, setNameGone] = useState(false)
  useEffect(() => {
    let frame = 0
    const check = () => {
      frame = 0
      const name = nameRef.current?.getBoundingClientRect()
      const bar = document.querySelector('[data-app-header]')?.getBoundingClientRect()
      setNameGone(!!name && !!bar && bar.height > 0 && name.bottom <= bar.bottom)
    }
    const onChange = () => {
      if (!frame) frame = requestAnimationFrame(check)
    }
    frame = requestAnimationFrame(check)
    window.addEventListener('scroll', onChange, { passive: true })
    window.addEventListener('resize', onChange)
    return () => {
      window.removeEventListener('scroll', onChange)
      window.removeEventListener('resize', onChange)
      if (frame) cancelAnimationFrame(frame)
    }
  }, [])
  const businessName = supplier?.business_name ?? ''
  // "Order QR" under the name: the full-screen QR a walk-in customer scans —
  // the same one the Dashboard logo opens on a long press. Until ordering is
  // set up it opens Online orders instead.
  const orderUrl = supplier?.order_link && supplier.ordering_enabled ? orderPageUrl(supplier.order_link) : null
  const [qrOpen, setQrOpen] = useState(false)
  const barLogo = supplier?.logo_url && !logoFailed ? supplier.logo_url : undefined
  const showBusiness = !sectionRow && nameGone && !!businessName
  useTopBar({
    title: sectionRow?.label ?? (showBusiness ? businessName : t('nav.profile')),
    image: showBusiness ? barLogo : undefined,
    avatar: showBusiness && !barLogo ? { id: supplier?.id ?? '', name: businessName } : undefined,
  })

  async function handleSignOut() {
    await signOut()
    navigate('/login', { replace: true })
  }

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
          // Phones have ← in the top bar instead.
          className="mb-3 hidden items-center gap-1.5 py-1 text-sm font-semibold text-accent-text hover:text-accent lg:inline-flex"
        >
          <ArrowLeft size={16} /> {t('nav.profile')}
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

  const logo = !logoFailed ? supplier?.logo_url : null

  return (
    <div className="max-w-lg">
      {/* The doodled band — the app's own building-trade doodles, soft green
          in light, barely there in dark — running edge to edge on a phone. */}
      <div className="relative -mx-4 -mt-2 sm:-mx-6 lg:mx-0 lg:mt-0 lg:overflow-hidden lg:rounded-t-3xl">
        <div className="h-32 dark:hidden" style={{ backgroundColor: '#E4F1E8', backgroundImage: patternCssUrl('rgba(31, 122, 69, 0.16)') }} />
        <div className="hidden h-32 dark:block" style={{ backgroundColor: '#15261F', backgroundImage: patternCssUrl('rgba(255, 255, 255, 0.07)') }} />
        <button
          type="button"
          onClick={() => open('business')}
          aria-label={t('common.edit')}
          className="absolute right-3 top-3 flex h-10 w-10 items-center justify-center rounded-full text-ink/70 transition-colors hover:bg-black/5 dark:text-white/80 dark:hover:bg-white/10"
        >
          <Pencil size={20} strokeWidth={1.75} />
        </button>

        {/* The page itself, rising over the band with a rounded top edge. */}
        <div className="relative -mt-7 rounded-t-3xl bg-surface px-4 pb-1 pt-16 text-center sm:px-6">
          <button
            type="button"
            onClick={() => open('business')}
            className="absolute -top-14 left-1/2 flex h-28 w-28 -translate-x-1/2 items-center justify-center overflow-hidden rounded-full bg-white ring-4 ring-surface"
          >
            {logo ? (
              <img src={logo} alt="" onError={() => setLogoFailed(true)} className="h-full w-full object-cover" />
            ) : (
              <CustomerAvatar id={supplier?.id ?? ''} name={supplier?.business_name ?? ''} size={112} />
            )}
          </button>
          <button ref={nameRef} type="button" onClick={() => open('business')} className="w-full">
            <span className="block break-words text-2xl font-semibold leading-tight text-ink">{supplier?.business_name}</span>
            <span className="mt-1 block text-sm text-muted">{supplier?.phone || supplier?.email}</span>
          </button>
          {supplier?.role !== 'admin' && (
            <button
              type="button"
              onClick={() => (orderUrl ? setQrOpen(true) : open('orders'))}
              className="mt-3 inline-flex items-center gap-2 rounded-full border border-border bg-card px-4 py-2 text-sm font-medium text-accent-text shadow-sm transition-colors hover:bg-accent-bg active:bg-accent-bg"
            >
              <QrCode size={18} strokeWidth={1.75} /> {t('set.orderQr')}
            </button>
          )}
        </div>
      </div>

      {qrOpen && orderUrl && <OrderLinkShareModal url={orderUrl} initialStep="qr" onClose={() => setQrOpen(false)} />}

      {/* Plain rows: a grey outline icon, the title, and a line under it. */}
      <div className="mt-4">
        {groups.map((group, gi) => (
          <div key={group[0].id} className={cn(gi > 0 && 'mt-2 border-t border-border pt-2')}>
            {group.map((row) => (
              <button
                key={row.id}
                type="button"
                onClick={() => open(row.id)}
                className="flex w-full items-start gap-5 rounded-xl px-2 py-3.5 text-left transition-colors hover:bg-card active:bg-card"
              >
                <row.icon size={24} strokeWidth={1.75} className="mt-0.5 shrink-0 text-muted" />
                <span className="min-w-0 flex-1">
                  <span className="block text-[15px] text-ink">{row.label}</span>
                  {row.detail && <span className="mt-0.5 block break-words text-sm text-muted">{row.detail}</span>}
                </span>
              </button>
            ))}
          </div>
        ))}
      </div>

      {/* Sign out, at the foot of the profile, where WhatsApp and Telegram put it. */}
      <div className="mt-2 border-t border-border pt-2">
        <button
          type="button"
          onClick={handleSignOut}
          className="flex w-full items-center gap-5 rounded-xl px-2 py-3.5 text-left text-red-600 transition-colors hover:bg-card active:bg-card"
        >
          <LogOut size={24} strokeWidth={1.75} className="shrink-0" />
          <span className="text-[15px]">{t('nav.signOut')}</span>
        </button>
      </div>
    </div>
  )
}
