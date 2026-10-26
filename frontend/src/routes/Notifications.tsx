import { PageHeader } from '@/components/layout/PageHeader'
import { NotificationList } from '@/components/NotificationList'
import { PushSwitch } from '@/components/PushSwitch'
import { useAuth } from '@/context/AuthContext'
import { useLanguage } from '@/context/LanguageContext'
import { translate } from '@/lib/i18n'

/**
 * The bell's screen (migration 051), for a supplier and for the admin: the
 * phone-alerts switch, then everything that happened, newest first. The admin
 * sees only applications, KYC and renewals — never a shop's business.
 */
export default function Notifications() {
  const { supplier } = useAuth()
  const { lang } = useLanguage()
  const english = supplier?.role === 'admin'
  return (
    <div>
      <PageHeader title={translate(english ? 'en' : lang, 'notif.title')} />
      <PushSwitch offText="push.offSupplier" english={english} className="mb-4" />
      <NotificationList english={english} />
    </div>
  )
}
