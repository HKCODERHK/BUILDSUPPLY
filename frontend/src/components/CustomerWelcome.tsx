import { useState, type FormEvent } from 'react'
import { Building2, MapPin, Phone, ShieldCheck, UserRound } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { PhoneInput } from '@/components/ui/phone-input'
import { AuthShell, GradientButton, IconField, iconInputClass } from '@/components/AuthShell'
import { useLanguage } from '@/context/LanguageContext'
import { saveProfile, type CustomerProfile } from '@/lib/customerProfile'

/**
 * The first thing a customer sees on a shop's QR or order link, once per
 * phone (2026-10-12, the user's request): name, mobile, site and city. Saved
 * on their phone only (lib/customerProfile), it fills in every order after.
 * It is not a sign-in and unlocks nothing — bills and balance still open only
 * from the customer's own khata link — and it says so at the foot.
 */
export function CustomerWelcome({
  shopName,
  logoUrl,
  initial,
  onDone,
}: {
  shopName: string
  logoUrl?: string | null
  initial?: Partial<CustomerProfile> | null
  onDone: (profile: CustomerProfile) => void
}) {
  const { t } = useLanguage()
  const [form, setForm] = useState<CustomerProfile>({
    name: initial?.name ?? '',
    phone: initial?.phone ?? '',
    site: initial?.site ?? '',
    city: initial?.city ?? '',
  })
  const [keep, setKeep] = useState(true)
  const [tried, setTried] = useState(false)
  const [busy, setBusy] = useState(false)

  const nameBad = form.name.trim().length < 2
  // Warned as soon as they leave the box with a short number — the
  // recording's "doesn't look right" — or press Continue.
  const [phoneLeft, setPhoneLeft] = useState(false)
  const phoneBad = form.phone.length !== 10
  const phoneError = (tried || (phoneLeft && form.phone.length > 0)) && phoneBad ? t('cw.badPhone') : null

  function submit(e: FormEvent) {
    e.preventDefault()
    setTried(true)
    if (nameBad || phoneBad) return
    setBusy(true)
    const profile = { name: form.name.trim(), phone: form.phone, site: form.site.trim(), city: form.city.trim() }
    saveProfile(profile, keep)
    // A beat for the spinner, so the step feels taken rather than skipped.
    window.setTimeout(() => onDone(profile), 350)
  }

  const set = (k: keyof CustomerProfile) => (v: string) => setForm((f) => ({ ...f, [k]: v }))

  return (
    <AuthShell
      brand={
        <div className="flex min-w-0 items-center gap-2.5">
          {logoUrl ? (
            <img src={logoUrl} alt="" className="h-10 w-10 shrink-0 rounded-xl bg-white object-cover" />
          ) : (
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/15 text-lg font-bold">
              {shopName.trim().charAt(0).toUpperCase()}
            </span>
          )}
          <div className="min-w-0">
            <div className="text-[11px] uppercase tracking-wide text-white/60">{t('cw.orderFrom')}</div>
            <div className="line-clamp-2 break-words text-base font-bold leading-tight">{shopName}</div>
          </div>
        </div>
      }
      tagline={t('cw.tagline')}
      title={t('cw.title')}
      subtitle={t('cw.sub')}
      footer={
        <p className="flex items-start gap-2 rounded-xl bg-accent-bg p-3 text-xs text-accent-text">
          <ShieldCheck size={16} className="mt-0.5 shrink-0" />
          {t('cw.private')}
        </p>
      }
    >
      <form onSubmit={submit} className="flex flex-col gap-3.5" noValidate>
        <IconField icon={UserRound} error={tried && nameBad ? t('order.nameInvalid') : null}>
          <Input
            autoComplete="name"
            maxLength={60}
            aria-label={t('order.name')}
            placeholder={t('order.name')}
            className={iconInputClass}
            value={form.name}
            onChange={(e) => set('name')(e.target.value)}
          />
        </IconField>
        <IconField icon={Phone} error={phoneError}>
          <PhoneInput
            autoComplete="tel-national"
            aria-label={t('order.phone')}
            placeholder={t('order.phone')}
            className={iconInputClass}
            value={form.phone}
            onValueChange={set('phone')}
            onBlur={() => setPhoneLeft(true)}
          />
        </IconField>
        <IconField icon={MapPin}>
          <Input
            maxLength={120}
            aria-label={t('cw.site')}
            placeholder={t('cw.site')}
            className={iconInputClass}
            value={form.site}
            onChange={(e) => set('site')(e.target.value)}
          />
        </IconField>
        <IconField icon={Building2}>
          <Input
            autoComplete="address-level2"
            maxLength={60}
            aria-label={t('cw.city')}
            placeholder={t('cw.city')}
            className={iconInputClass}
            value={form.city}
            onChange={(e) => set('city')(e.target.value)}
          />
        </IconField>
        <label className="flex items-center gap-2 text-sm text-ink">
          <input type="checkbox" checked={keep} onChange={(e) => setKeep(e.target.checked)} className="accent-[#198a45]" />
          {t('cw.keep')}
        </label>
        <GradientButton type="submit" busy={busy} className="mt-1">
          {t('cw.continue')}
        </GradientButton>
      </form>
    </AuthShell>
  )
}
