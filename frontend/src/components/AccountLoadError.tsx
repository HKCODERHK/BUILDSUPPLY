import { useEffect } from 'react'
import { useAuth } from '@/context/AuthContext'
import { useLanguage } from '@/context/LanguageContext'

/**
 * Signed in, but the account's own profile didn't load — a dropped
 * connection, or a login with no supplier row behind it. Shown in place of
 * the app rather than sending the person to /login: Login sends anyone with
 * a session straight back to /dashboard, and the two used to bounce off each
 * other until React gave up ("Maximum update depth exceeded").
 */
export function AccountLoadError() {
  const { refreshSupplier, signOut } = useAuth()
  const { t } = useLanguage()

  // The usual cause is the signal dropping, so try again by itself the moment
  // the phone is back online.
  useEffect(() => {
    const retry = () => void refreshSupplier()
    window.addEventListener('online', retry)
    return () => window.removeEventListener('online', retry)
  }, [refreshSupplier])

  return (
    <div className="flex min-h-app flex-col items-center justify-center gap-4 bg-shell p-4 text-center">
      <p className="text-lg font-semibold text-white">{t('account.loadFailed')}</p>
      <p className="max-w-sm text-sm text-sidebar-text">{t('account.loadFailedHint')}</p>
      <div className="flex flex-wrap justify-center gap-2">
        <button
          onClick={() => void refreshSupplier()}
          className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white"
        >
          {t('account.retry')}
        </button>
        <button
          onClick={() => signOut()}
          className="rounded-lg border border-white/20 px-4 py-2 text-sm font-semibold text-white hover:bg-white/10"
        >
          {t('nav.signOut')}
        </button>
      </div>
    </div>
  )
}
