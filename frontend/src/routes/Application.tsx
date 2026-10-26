import { useCallback, useEffect, useRef, useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { LogOut } from 'lucide-react'
import { useAuth } from '@/context/AuthContext'
import { useLanguage } from '@/context/LanguageContext'
import { BrandMark } from '@/components/BrandMark'
import { LanguageToggle } from '@/components/LanguageToggle'
import { ThemeToggle } from '@/components/ThemeToggle'
import { TruckLoader } from '@/components/TruckLoader'
import { PushSwitch } from '@/components/PushSwitch'
import { ComplianceForm } from '@/components/ComplianceForm'
import { WhatsAppIcon } from '@/components/icons/WhatsAppIcon'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { openWhatsAppShare } from '@/lib/whatsapp'
import { ADMIN_WHATSAPP_NUMBER } from '@/lib/adminContact'
import { TRIAL_DAYS } from '@/lib/site'
import type { TranslationKey } from '@/lib/i18n'
import { getMyCompliance, type ComplianceRecord } from '@/services/compliance'

/**
 * What a shop that has applied, but has not been accepted yet, sees after
 * signing in — and nothing else (compliance round 2). Their login has no
 * supplier account behind it until the admin accepts the application, so
 * the app's own screens are not reachable; ProtectedRoute sends them here.
 */
export default function Application() {
  const { session, supplier, loading, signOut, refreshSupplier } = useAuth()
  const { t } = useLanguage()
  const navigate = useNavigate()
  const [record, setRecord] = useState<ComplianceRecord | null | undefined>(undefined)
  const [failed, setFailed] = useState(false)
  const userId = session?.user.id
  // A fresh function on every render of the auth provider; held here so the
  // load below does not re-run because of it.
  const refreshRef = useRef(refreshSupplier)
  useEffect(() => {
    refreshRef.current = refreshSupplier
  })

  const show = useCallback(
    async (r: ComplianceRecord | null) => {
      setRecord(r)
      setFailed(false)
      // Accepted while this screen was open: the shop's account exists now.
      if (r && !r.is_applicant) {
        await refreshRef.current()
        navigate('/dashboard', { replace: true })
      }
    },
    [navigate],
  )
  const load = useCallback(async () => {
    if (!userId) return
    await getMyCompliance(userId).then(show, () => setFailed(true))
  }, [userId, show])

  useEffect(() => {
    if (!userId) return
    let live = true
    getMyCompliance(userId).then(
      (r) => live && void show(r),
      () => live && setFailed(true),
    )
    return () => {
      live = false
    }
  }, [userId, show])

  // Only the first load. An applicant never has a supplier row, so the auth
  // provider's `loading` comes back on with every background profile reload
  // (each return to the app, each token refresh); hiding the page then would
  // throw away what they were typing — the bill-wiping bug of Phase 7.
  if (loading && !session) return <TruckLoader inline className="min-h-app" />
  if (!session) return <Navigate to="/login" replace />
  if (supplier) return <Navigate to="/dashboard" replace />

  const plan = record?.requested_plan
  const planName = plan === 'trial' ? t('apply.planTrial', { days: TRIAL_DAYS }) : plan ? t(`site.plans.${plan}` as TranslationKey) : null

  return (
    <div className="min-h-app bg-surface">
      <header className="sticky top-0 z-20 bg-shell px-4 pb-3 pt-[calc(0.75rem_+_var(--safe-top))] text-white">
        <div className="mx-auto flex max-w-2xl items-center justify-between gap-2">
          <BrandMark textClassName="text-lg text-white" />
          <div className="flex items-center gap-2">
            <LanguageToggle compact className="border-white/20 text-white hover:bg-white/10 hover:text-white" />
            <ThemeToggle className="border-white/20 text-white hover:bg-white/10 hover:text-white" />
          </div>
        </div>
      </header>

      <main className="mx-auto flex max-w-2xl flex-col gap-4 px-4 pb-[calc(2rem_+_var(--safe-bottom))] pt-5">
        {record === undefined && !failed ? (
          <TruckLoader />
        ) : failed || !record ? (
          <Card>
            <p className="text-sm text-ink">{t('account.loadFailed')}</p>
            <p className="mt-1 text-sm text-muted">{t('account.loadFailedHint')}</p>
            <div className="mt-3 flex gap-2">
              <Button variant="outline" onClick={() => void load()}>
                {t('account.retry')}
              </Button>
              <Button variant="ghost" onClick={() => void signOut()}>
                {t('nav.signOut')}
              </Button>
            </div>
          </Card>
        ) : (
          <>
            <div>
              <h1 className="text-2xl font-bold text-ink">{t('app.title')}</h1>
              <p className="mt-1 text-sm text-muted">
                {t('app.hello', { name: record.contact_name || record.legal_name || '' })}
                {record.legal_name ? ` · ${record.legal_name}` : ''}
              </p>
            </div>

            <Card className="flex flex-col gap-3">
              {planName && <p className="text-sm font-medium text-ink">{t('app.plan', { plan: planName })}</p>}
              <p className="text-sm text-muted">{t('app.next')}</p>
              <Button
                variant="outline"
                className="self-start"
                onClick={() => openWhatsAppShare(ADMIN_WHATSAPP_NUMBER, t('app.contactText', { name: record.legal_name || '' }))}
              >
                <WhatsAppIcon size={16} /> {t('app.contact')}
              </Button>
            </Card>

            {/* Told the moment the application is decided (051). */}
            <PushSwitch offText="push.offApplicant" />

            <ComplianceForm record={record} onChanged={load} lockEmail />

            <button
              type="button"
              onClick={() => void signOut()}
              className="mx-auto mt-2 flex items-center gap-1.5 py-2 text-sm font-semibold text-muted hover:text-ink"
            >
              <LogOut size={15} /> {t('nav.signOut')}
            </button>
          </>
        )}
      </main>
    </div>
  )
}
