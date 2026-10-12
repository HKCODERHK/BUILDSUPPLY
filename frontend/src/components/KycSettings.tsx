import { useState } from 'react'
import { Link } from 'react-router-dom'
import { AlertTriangle, ShieldCheck } from 'lucide-react'
import { useMyCompliance } from '@/lib/useMyCompliance'
import { useLanguage } from '@/context/LanguageContext'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { TruckLoader } from '@/components/TruckLoader'
import { ComplianceForm } from '@/components/ComplianceForm'
import type { TranslationKey } from '@/lib/i18n'
import { startCompliance } from '@/services/compliance'

/**
 * A working supplier's own verification (migration 045). The three shops
 * that were on BuildSupply before it are "grandfathered": they keep every
 * feature while they complete it — nothing here ever locks a shop out.
 */

/** Settings → Verification (KYC). */
export function KycSettingsCard() {
  const { t } = useLanguage()
  const { record, reload } = useMyCompliance()
  const [starting, setStarting] = useState(false)
  const [failed, setFailed] = useState(false)

  // A shop the admin created after 045 has no record yet; one is opened the
  // first time it comes here.
  async function start() {
    setStarting(true)
    setFailed(false)
    try {
      await startCompliance()
      await reload()
    } catch {
      setFailed(true)
    } finally {
      setStarting(false)
    }
  }

  if (record === undefined) return <TruckLoader />
  if (record === null) {
    return (
      <Card className="max-w-lg">
        <p className="text-sm text-muted">{t('kyc.intro')}</p>
        <Button className="mt-3" disabled={starting} onClick={() => void start()}>
          <ShieldCheck size={16} /> {starting ? t('common.saving') : t('dash.kycStart')}
        </Button>
        {failed && <p className="mt-2 text-sm text-red-600 dark:text-red-400">{t('kyc.failed')}</p>}
      </Card>
    )
  }
  return (
    <div className="max-w-2xl">
      <ComplianceForm record={record} onChanged={reload} />
    </div>
  )
}

/**
 * The Dashboard's notice: "Complete your KYC" while it is open, "correct
 * it" when BuildSupply asked, and the reason while a soft suspension is on.
 * Nothing once it is sent or verified.
 */
export function KycNotice() {
  const { t } = useLanguage()
  const { record } = useMyCompliance()
  if (!record) return null
  const s = record.status

  if (s === 'SUSPENDED') {
    const reason = record.suspension_note || (record.suspension_code ? t(`kyc.code.${record.suspension_code}` as TranslationKey) : '')
    return (
      <Link
        to="/settings?s=kyc"
        className="mb-4 flex items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 dark:border-red-900 dark:bg-red-950"
      >
        <div className="flex items-center gap-2.5">
          <AlertTriangle size={18} className="shrink-0 text-red-600 dark:text-red-400" />
          <span className="text-sm font-medium text-red-700 dark:text-red-300">{t('dash.kycSuspended', { reason })}</span>
        </div>
      </Link>
    )
  }
  if (s !== 'PENDING' && s !== 'REJECTED') return null
  const fix = s === 'REJECTED' || !!record.correction_reason
  return (
    <Link
      to="/settings?s=kyc"
      className="mb-4 flex items-center justify-between gap-3 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 dark:border-amber-900 dark:bg-amber-950"
    >
      <div className="flex items-center gap-2.5">
        <ShieldCheck size={18} className="shrink-0 text-amber-700 dark:text-amber-400" />
        <span className="text-sm font-medium text-amber-900 dark:text-amber-200">{t(fix ? 'dash.kycFix' : 'dash.kyc')}</span>
      </div>
      <span className="shrink-0 text-xs font-semibold text-amber-800 dark:text-amber-300">{t('dash.kycStart')}</span>
    </Link>
  )
}
