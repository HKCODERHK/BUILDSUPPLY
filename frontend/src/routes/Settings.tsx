import { useEffect, useRef, useState, type ChangeEvent, type FormEvent, type ReactNode } from 'react'
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { ArrowLeft, BadgeCheck, Camera, ChevronRight, Crown, Inbox, Languages, Lock, LogOut, Palette, Percent, QrCode, ShieldCheck, Store, Type, UserRound, type LucideIcon } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { PhoneInput } from '@/components/ui/phone-input'
import { Label } from '@/components/ui/label'
import { CustomerAvatar } from '@/components/CustomerAvatar'
import { updateSupplierProfile, uploadLogo } from '@/services/suppliers'
import { sanitizePhone } from '@/lib/numberInput'
import { useAuth } from '@/context/AuthContext'
import { useLanguage } from '@/context/LanguageContext'
import { usePin } from '@/context/PinContext'
import { useTopBar } from '@/context/TopBarContext'
import { LANGUAGES, type TranslationKey } from '@/lib/i18n'
import { cn } from '@/lib/utils'
import { PinSettingsCard } from '@/components/PinSettingsCard'
import { ChangePasswordCard } from '@/components/ChangePasswordCard'
import { OrderSettingsCard } from '@/components/OrderSettingsCard'
import { UpiSettingsCard } from '@/components/UpiSettingsCard'
import { MaterialGstCard } from '@/components/MaterialGstCard'
import { DisplaySizeCard } from '@/components/DisplaySizeCard'
import { ShopPageCard } from '@/components/ShopPageCard'
import { YourProfileCard } from '@/components/YourProfileCard'
import { KycSettingsCard } from '@/components/KycSettings'
import { BillPrintCard } from '@/components/BillPrint'
import { shopPageAvailable } from '@/services/shopPage'
import { readDisplaySize } from '@/lib/displaySize'
import { OrderLinkShareModal } from '@/components/OrderLinkShareModal'
import { orderPageUrl } from '@/services/orders'
import { HeroIconButton, HeroPill, ProfileHero } from '@/components/ProfileHero'
import { useMyCompliance } from '@/lib/useMyCompliance'
import { daysUntilExpiry } from '@/lib/subscription'
import { planLabel } from '@/lib/plans'

type Section = 'business' | 'me' | 'kyc' | 'shop' | 'orders' | 'upi' | 'gst' | 'language' | 'size' | 'pin' | 'password'

interface Row {
  id: Section
  icon: LucideIcon
  label: string
  /** The grey line under the title — what it is, or its state. */
  detail?: string
}

/**
 * The Profile tab, after Snapchat's profile (the user's reference,
 * 2026-10-27): the shop across the top (ProfileHero — its cover photo, the
 * logo with a pencil, the name, Order QR where Snapchat has Share), then two
 * pill buttons, Business profile and Owner profile, where Snapchat has My
 * account and Public Profile; a row of chips (plan, KYC, online orders); and
 * the rest as rounded rows under two headings — still plain grey outline
 * icons, never boxed ones. Each row opens its own section (`?s=<section>`, so
 * the phone's back gesture returns to the list). Every card inside a section
 * is the one this page always had. Other screens link straight to a section:
 * Orders → `?s=orders`, the UPI QR → `?s=upi`, the Start-here card →
 * `?s=business`.
 */
export default function Settings() {
  const { supplier, signOut, refreshSupplier } = useAuth()
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
  const [logoRejected, setLogoRejected] = useState(false)
  const [logoVersion, setLogoVersion] = useState(0)
  const logoInput = useRef<HTMLInputElement>(null)
  const { record: kyc } = useMyCompliance()

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!supplier) return
    setSaving(true)
    setSaved(false)
    try {
      await updateSupplierProfile(supplier.id, form)
      // The header shows the name and phone large now; bring them up to date.
      await refreshSupplier()
      setSaved(true)
    } finally {
      setSaving(false)
    }
  }

  async function handleLogoChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file || !supplier) return
    setUploading(true)
    // The bucket refuses anything that is not a PNG, JPG or WebP under 2 MB
    // (migration 039). Until now an upload that failed said nothing at all —
    // the spinner stopped and no logo appeared — so the refusal is worded.
    setLogoRejected(false)
    try {
      await uploadLogo(supplier.id, file)
      // The same address as before (logo.<ext>), so the phone would keep
      // showing its cached copy: a fresh query string fetches the new one.
      setLogoVersion(Date.now())
      setLogoFailed(false)
      await refreshSupplier()
    } catch {
      setLogoRejected(true)
    } finally {
      setUploading(false)
      // Let the same file be chosen again once it has been fixed.
      e.target.value = ''
    }
  }

  // Online orders and UPI are a supplier's; the admin's own settings are the
  // rest (their cards already hide themselves for the admin).
  const isSupplier = supplier?.role === 'supplier'
  // The two profiles are the hero's pill buttons rather than rows.
  const ownerAvailable = isSupplier && !!supplier && 'owner_mobile' in supplier
  const profileRows: Row[] = [
    { id: 'business', icon: Store, label: t('set.title'), detail: t('set.rowBusinessSub') },
    // The owner, apart from the business (migration 043) — only where the
    // database has it.
    ...(ownerAvailable ? [{ id: 'me' as const, icon: UserRound, label: t('me.title'), detail: t('me.rowSub') }] : []),
  ]
  const groups: Row[][] = [
    [
      // Verification (migration 045) — a supplier's own; never locks anything.
      ...(isSupplier ? [{ id: 'kyc' as const, icon: BadgeCheck, label: t('kyc.title'), detail: t('kyc.rowSub') }] : []),
      // The shop's page for customers (migration 042) — only where the
      // database has it, so a build reaching an older one shows no dead row.
      ...(isSupplier && shopPageAvailable(supplier)
        ? [{ id: 'shop' as const, icon: Palette, label: t('shop.settingsTitle'), detail: t('shop.rowSub') }]
        : []),
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
            {
              id: 'gst' as const,
              icon: Percent,
              label: t('gst.title'),
              detail: t('gst.rowSub'),
            },
          ]
        : []),
    ],
    [
      { id: 'language', icon: Languages, label: t('set.language'), detail: LANGUAGES.find((l) => l.code === lang)?.label },
      {
        id: 'size',
        icon: Type,
        label: t('set.sizeTitle'),
        detail: t(
          readDisplaySize() === 'small' ? 'set.sizeSmall' : readDisplaySize() === 'large' ? 'set.sizeLarge' : 'set.sizeMedium',
        ),
      },
      { id: 'pin', icon: ShieldCheck, label: t('pin.title'), detail: `${t(hasPin ? 'set.on' : 'set.off')} · ${t('set.pinSub')}` },
      { id: 'password', icon: Lock, label: t('set.pwTitle'), detail: t('set.pwSub') },
    ],
  ]

  const asked = searchParams.get('s')
  const sectionRow = [...profileRows, ...groups.flat()].find((r) => r.id === asked)
  const section = sectionRow?.id ?? null
  // No PageHeader here, so name the screen for the phone's top bar directly.
  // The Profile tab (its logo in the tab bar) opens this page. Once the
  // business's own name has scrolled up under the top bar, the bar shows its
  // logo and name instead of "Profile" — as Telegram's profile does — and
  // "Profile" again back at the top.
  const nameRef = useRef<HTMLHeadingElement>(null)
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
  const logoUrl = supplier?.logo_url ? (logoVersion ? `${supplier.logo_url}?v=${logoVersion}` : supplier.logo_url) : null
  const barLogo = logoUrl && !logoFailed ? logoUrl : undefined
  const showBusiness = !sectionRow && nameGone && !!businessName
  useTopBar({
    title: sectionRow?.label ?? (showBusiness ? businessName : t('nav.profile')),
    image: showBusiness ? barLogo : undefined,
    avatar: showBusiness && !barLogo ? { id: supplier?.id ?? '', name: businessName } : undefined,
  })

  // The cover photo lives on the Shop page (migration 042), which shows it to
  // customers too; the camera on the picture goes there.
  const coverButton =
    isSupplier && shopPageAvailable(supplier) ? (
      <HeroIconButton label={t('prof.changeCover')} onClick={() => open('shop')}>
        <Camera size={19} strokeWidth={1.9} />
      </HeroIconButton>
    ) : undefined

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
          <div className="max-w-lg">
            {/* The shop as customers and bills show it: the cover, the logo —
                its pencil uploads a new one — the name and the phone. */}
            <ProfileHero
              cover={supplier?.cover_url}
              photo={logoUrl}
              fallback={<CustomerAvatar id={supplier?.id ?? ''} name={businessName} size={80} />}
              title={businessName}
              subtitle={supplier?.phone || supplier?.email}
              onPhoto={() => logoInput.current?.click()}
              photoLabel={t('prof.changeLogo')}
              onPhotoError={() => setLogoFailed(true)}
              busy={uploading}
              topLeft={coverButton}
            />
            <input
              ref={logoInput}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="hidden"
              onChange={handleLogoChange}
              disabled={uploading}
            />
            {logoRejected && (
              <p role="alert" className="mt-3 text-xs font-medium text-red-600 dark:text-red-400">{t('set.logoRejected')}</p>
            )}
            {!supplier?.logo_url && !logoRejected && <p className="mt-3 text-xs text-muted">{t('prof.logoHint')}</p>}

            <Card className="mt-4">
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
            {/* What prints on new bills (migration 043). */}
            <BillPrintCard />
          </div>
        )}
        {section === 'me' && <YourProfileCard />}
        {section === 'kyc' && <KycSettingsCard />}

        {section === 'shop' && <ShopPageCard />}
        {section === 'orders' && <OrderSettingsCard />}
        {section === 'upi' && <UpiSettingsCard />}
        {section === 'gst' && <MaterialGstCard />}
        {section === 'size' && <DisplaySizeCard />}

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

  // The chips under the two profile buttons, as Snapchat has them under its
  // own: the plan and its days left, verification, and online orders. Each
  // one that leads somewhere opens it.
  const days = daysUntilExpiry(supplier?.subscription_expiry)
  const plan = supplier ? planLabel(supplier) : ''
  const planText =
    days === null
      ? plan
      : days < 0
        ? t('prof.planExpired', { plan })
        : days === 0
          ? t('prof.planToday', { plan })
          : days === 1
            ? t('prof.planOneDay', { plan })
            : t('prof.planDays', { plan, days })
  const kycChip: { key: TranslationKey; tone: ChipTone } | null = !kyc
    ? null
    : kyc.status === 'APPROVED'
      ? { key: 'prof.kycApproved', tone: 'good' }
      : kyc.status === 'UNDER_REVIEW'
        ? { key: 'prof.kycReview', tone: 'neutral' }
        : kyc.status === 'SUSPENDED'
          ? { key: 'prof.kycSuspended', tone: 'bad' }
          : kyc.status === 'REJECTED' || kyc.correction_reason
            ? { key: 'prof.kycFix', tone: 'warn' }
            : { key: 'prof.kycPending', tone: 'warn' }

  const ownerPhoto = ownerAvailable ? supplier?.owner_photo_url : null

  return (
    <div className="max-w-lg">
      <ProfileHero
        cover={supplier?.cover_url}
        photo={logoUrl}
        fallback={<CustomerAvatar id={supplier?.id ?? ''} name={businessName} size={80} />}
        title={businessName}
        subtitle={supplier?.phone || supplier?.email}
        onPhoto={() => open('business')}
        photoLabel={t('set.title')}
        onPhotoError={() => setLogoFailed(true)}
        titleRef={nameRef}
        topLeft={coverButton}
        topRight={
          supplier?.role !== 'admin' ? (
            // Snapchat's Share: here the full-screen QR a walk-in customer
            // scans — the same one the Dashboard logo opens on a long press.
            // Until ordering is set up it opens Online orders instead.
            <HeroPill onClick={() => (orderUrl ? setQrOpen(true) : open('orders'))}>
              <QrCode size={17} strokeWidth={1.9} /> {t('set.orderQr')}
            </HeroPill>
          ) : undefined
        }
      />

      {qrOpen && orderUrl && <OrderLinkShareModal url={orderUrl} initialStep="qr" onClose={() => setQrOpen(false)} />}

      {/* The two profiles, where Snapchat has My account and Public Profile. */}
      <div className={cn('mt-3 grid gap-2.5', ownerAvailable ? 'grid-cols-2' : 'grid-cols-1')}>
        <ProfileButton onClick={() => open('business')} label={t('set.title')}>
          <Store size={17} strokeWidth={1.9} className="shrink-0" />
        </ProfileButton>
        {ownerAvailable && (
          <ProfileButton onClick={() => open('me')} label={t('me.title')}>
            {ownerPhoto ? (
              <img src={ownerPhoto} alt="" className="h-6 w-6 shrink-0 rounded-full object-cover" />
            ) : (
              <UserRound size={17} strokeWidth={1.9} className="shrink-0" />
            )}
          </ProfileButton>
        )}
      </div>

      {isSupplier && (
        <div className="mt-3 flex flex-wrap gap-2">
          <Chip tone={days !== null && days < 0 ? 'bad' : days !== null && days <= 7 ? 'warn' : 'neutral'}>
            <Crown size={14} strokeWidth={2} /> {planText}
          </Chip>
          {kycChip && (
            <Chip tone={kycChip.tone} onClick={() => open('kyc')}>
              <BadgeCheck size={14} strokeWidth={2} /> {t(kycChip.key)}
            </Chip>
          )}
          <Chip tone={supplier?.ordering_enabled ? 'good' : 'neutral'} onClick={() => open('orders')}>
            <Inbox size={14} strokeWidth={2} /> {t(supplier?.ordering_enabled ? 'prof.ordersOn' : 'prof.ordersOff')}
          </Chip>
        </div>
      )}

      {groups.map((group, gi) =>
        group.length === 0 ? null : (
          <section key={gi}>
            <h3 className="mb-2 mt-6 px-1 text-[15px] font-bold text-ink">
              {t(gi === 0 && isSupplier ? 'prof.sectionShop' : 'prof.sectionApp')}
            </h3>
            <div className="flex flex-col gap-2">
              {group.map((row) => (
                <button
                  key={row.id}
                  type="button"
                  onClick={() => open(row.id)}
                  className="flex w-full items-center gap-4 rounded-2xl border border-border bg-card px-4 py-3.5 text-left transition-colors hover:bg-surface active:bg-surface"
                >
                  <row.icon size={22} strokeWidth={1.75} className="shrink-0 text-muted" />
                  <span className="min-w-0 flex-1">
                    <span className="block text-[15px] text-ink">{row.label}</span>
                    {row.detail && <span className="mt-0.5 block break-words text-sm text-muted">{row.detail}</span>}
                  </span>
                  <ChevronRight size={18} className="shrink-0 text-muted-2" />
                </button>
              ))}
            </div>
          </section>
        ),
      )}

      {/* Sign out, at the foot of the profile, where Snapchat, WhatsApp and Telegram put it. */}
      <button
        type="button"
        onClick={handleSignOut}
        className="mt-6 flex w-full items-center gap-4 rounded-2xl border border-border bg-card px-4 py-3.5 text-left text-red-600 transition-colors hover:bg-surface active:bg-surface dark:text-red-400"
      >
        <LogOut size={22} strokeWidth={1.75} className="shrink-0" />
        <span className="text-[15px]">{t('nav.signOut')}</span>
      </button>
    </div>
  )
}

type ChipTone = 'neutral' | 'good' | 'warn' | 'bad'

const CHIP_TONES: Record<ChipTone, string> = {
  neutral: 'border-border bg-card text-ink',
  good: 'border-green-200 bg-green-50 text-green-800 dark:border-green-900 dark:bg-green-950 dark:text-green-300',
  warn: 'border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200',
  bad: 'border-red-200 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300',
}

/** One of the chips under the profile buttons: a small rounded label, a button when it leads somewhere. */
function Chip({ tone, onClick, children }: { tone: ChipTone; onClick?: () => void; children: ReactNode }) {
  const className = cn('inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-xs font-medium', CHIP_TONES[tone])
  return onClick ? (
    <button type="button" onClick={onClick} className={className}>
      {children}
    </button>
  ) : (
    <span className={className}>{children}</span>
  )
}

/**
 * Business profile / Owner profile: two pills side by side. On a narrow phone
 * the icon steps aside, and a long label ("बिज़नेस की जानकारी" at 320px) takes
 * a second line inside the same pill rather than being cut off.
 */
function ProfileButton({ onClick, label, children }: { onClick: () => void; label: string; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex h-11 min-w-0 items-center justify-center gap-2 rounded-full border border-border bg-card px-3 text-[13px] font-semibold text-ink shadow-sm transition-colors hover:bg-surface active:bg-surface min-[380px]:text-sm"
    >
      <span className="hidden shrink-0 min-[380px]:inline-flex">{children}</span>
      <span className="line-clamp-2 min-w-0 text-center leading-tight">{label}</span>
    </button>
  )
}
