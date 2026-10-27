import { useState, type FormEvent } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { Lock, Mail, MapPin, Phone, Store, UserRound } from 'lucide-react'
import { useAuth } from '@/context/AuthContext'
import { useLanguage } from '@/context/LanguageContext'
import { AuthShell, GradientButton, IconField, iconInputClass } from '@/components/AuthShell'
import { BrandMark } from '@/components/BrandMark'
import { Input } from '@/components/ui/input'
import { PasswordInput } from '@/components/ui/password-input'
import { PhoneInput } from '@/components/ui/phone-input'
import { PLAN_CHOICES } from '@/lib/plans'
import { TRIAL_DAYS, rupees } from '@/lib/site'
import { MIN_PASSWORD_LENGTH, isPasswordLeaked } from '@/lib/passwordRules'
import type { TranslationKey } from '@/lib/i18n'
import { cn } from '@/lib/utils'
import { applyAsSupplier, type RequestedPlan } from '@/services/compliance'
import { ADMIN_WHATSAPP_NUMBER } from '@/lib/adminContact'
import { openWhatsAppShare } from '@/lib/whatsapp'

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/
const KNOWN_ERRORS = new Set(['email_taken', 'busy', 'bad_mobile', 'bad_email', 'bad_password'])

/**
 * A new shop applies to join (compliance round 2, 2026-10-13). There is no
 * sign-up: this sends an application with the email and password the shop
 * chooses. They can sign in straight away, but see only their application
 * — documents, agreement, status — until the admin accepts it after payment
 * on WhatsApp. The longer KYC is done there, signed in, not here.
 */
export default function Apply() {
  const { session, loading, signIn } = useAuth()
  const { t } = useLanguage()
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const [owner, setOwner] = useState('')
  const [mobile, setMobile] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [district, setDistrict] = useState('')
  const [state, setState] = useState('')
  const [plan, setPlan] = useState<RequestedPlan>('trial')
  const [website, setWebsite] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sent, setSent] = useState(false)

  if (!loading && session) return <Navigate to="/dashboard" replace />

  const emailLooksWrong = email.trim().length > 3 && email.includes('@') && !EMAIL.test(email.trim())

  async function submit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    if (![name, owner, district, state].every((v) => v.trim().length >= 2) || !email.trim()) return setError(t('apply.err.fill'))
    if (!/^[6-9][0-9]{9}$/.test(mobile)) return setError(t('apply.err.bad_mobile'))
    if (!EMAIL.test(email.trim())) return setError(t('apply.err.bad_email'))
    if (password.length < MIN_PASSWORD_LENGTH) return setError(t('apply.err.bad_password'))
    setBusy(true)
    try {
      if ((await isPasswordLeaked(password)) === true) {
        setError(t('apply.err.leaked'))
        return
      }
      await applyAsSupplier({
        business_name: name.trim(),
        owner_name: owner.trim(),
        mobile,
        email: email.trim().toLowerCase(),
        password,
        district: district.trim(),
        state: state.trim(),
        plan,
        website,
      })
      setSent(true)
      // Straight into their application. If that sign-in fails for any
      // reason, the screen says the application is in and how to sign in.
      const { error: signInError } = await signIn(email.trim().toLowerCase(), password)
      if (!signInError) navigate('/application', { replace: true })
    } catch (err) {
      const code = err instanceof Error ? err.message : ''
      setError(KNOWN_ERRORS.has(code) ? t(`apply.err.${code}` as TranslationKey) : t('apply.err.generic'))
    } finally {
      setBusy(false)
    }
  }

  const planOptions: { id: RequestedPlan; label: string; price: string }[] = [
    { id: 'trial', label: t('apply.planTrial', { days: TRIAL_DAYS }), price: rupees(0) },
    ...PLAN_CHOICES.map((p) => ({
      id: p.id as RequestedPlan,
      label: t(`site.plans.${p.id}` as TranslationKey),
      price: `${rupees(p.price)}${t(p.period === 'year' ? 'site.plans.year' : 'site.plans.month')}`,
    })),
  ]

  return (
    <AuthShell
      brand={
        <Link to="/">
          <BrandMark textClassName="text-xl text-white" />
        </Link>
      }
      tagline={t('site.footer.tagline')}
      title={t('apply.title')}
      subtitle={t('apply.sub')}
      footer={
        <p className="text-center text-sm text-muted">
          {t('apply.have')}{' '}
          <Link to="/login" className="font-semibold text-accent-text hover:underline">
            {t('apply.signIn')}
          </Link>
        </p>
      }
    >
      {sent ? (
        <div className="rounded-xl border border-accent/30 bg-accent-bg p-4 text-sm text-accent-text">
          {t('apply.sentSignIn')}{' '}
          <Link to="/login" className="font-semibold underline">
            {t('apply.signIn')}
          </Link>
        </div>
      ) : (
        <form onSubmit={submit} className="flex flex-col gap-3.5" noValidate>
          <IconField icon={Store}>
            <Input aria-label={t('apply.shopName')} placeholder={t('apply.shopName')} className={iconInputClass} maxLength={200} autoComplete="organization" value={name} onChange={(e) => setName(e.target.value)} />
          </IconField>
          <IconField icon={UserRound}>
            <Input aria-label={t('apply.ownerName')} placeholder={t('apply.ownerName')} className={iconInputClass} maxLength={120} autoComplete="name" value={owner} onChange={(e) => setOwner(e.target.value)} />
          </IconField>
          <IconField icon={Phone}>
            <PhoneInput aria-label={t('apply.mobile')} placeholder={t('apply.mobile')} className={iconInputClass} autoComplete="tel-national" value={mobile} onValueChange={setMobile} />
          </IconField>
          <div className="grid grid-cols-2 gap-3">
            <IconField icon={MapPin}>
              <Input aria-label={t('apply.district')} placeholder={t('apply.district')} className={iconInputClass} maxLength={80} autoComplete="address-level2" value={district} onChange={(e) => setDistrict(e.target.value)} />
            </IconField>
            <Input aria-label={t('apply.state')} placeholder={t('apply.state')} className="h-12 rounded-xl text-base sm:text-sm" maxLength={80} autoComplete="address-level1" value={state} onChange={(e) => setState(e.target.value)} />
          </div>
          <IconField icon={Mail} error={emailLooksWrong ? t('login.badEmail') : null}>
            <Input type="email" aria-label={t('apply.email')} placeholder={t('apply.email')} className={iconInputClass} maxLength={254} autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} />
          </IconField>
          <IconField icon={Lock}>
            <PasswordInput
              aria-label={t('apply.password')}
              placeholder={t('apply.password')}
              className={iconInputClass}
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              showLabel={t('auth.showPassword')}
              hideLabel={t('auth.hidePassword')}
            />
          </IconField>

          <fieldset className="mt-1">
            <legend className="mb-2 text-sm font-semibold text-ink">{t('apply.plan')}</legend>
            <div className="grid grid-cols-2 gap-2">
              {planOptions.map((o) => (
                <label
                  key={o.id}
                  className={cn(
                    'cursor-pointer rounded-xl border px-3 py-2.5 text-sm transition-colors',
                    plan === o.id ? 'border-accent bg-accent-bg text-accent-text' : 'border-border bg-card text-ink hover:bg-surface',
                  )}
                >
                  <input type="radio" name="plan" value={o.id} checked={plan === o.id} onChange={() => setPlan(o.id)} className="sr-only" />
                  <span className="block font-semibold">{o.label}</span>
                  <span className="block text-xs opacity-80">{o.price}</span>
                </label>
              ))}
            </div>
            <p className="mt-2 text-xs text-muted">{t('apply.payNote')}</p>
          </fieldset>

          {/* The bot trap: off-screen, out of the tab order, never filled by a person. */}
          <input
            type="text"
            name="website"
            tabIndex={-1}
            autoComplete="off"
            aria-hidden="true"
            className="absolute -left-[9999px] h-0 w-0 opacity-0"
            value={website}
            onChange={(e) => setWebsite(e.target.value)}
          />

          {error && (
            <p role="alert" className="text-sm text-red-600 dark:text-red-400">
              {error}
              {/* Turned away for the hour (F-10): a shop can still reach us. */}
              {error === t('apply.err.busy') && (
                <>
                  {' '}
                  <button
                    type="button"
                    onClick={() => openWhatsAppShare(ADMIN_WHATSAPP_NUMBER, t('apply.busyMessage'))}
                    className="font-semibold underline"
                  >
                    {t('apply.busyWhatsapp')}
                  </button>
                </>
              )}
            </p>
          )}
          <GradientButton type="submit" busy={busy}>
            {t('apply.submit')}
          </GradientButton>
        </form>
      )}
    </AuthShell>
  )
}
