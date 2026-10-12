import { Link, Navigate } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'
import { SignInForm } from '@/components/SignInForm'
import { AuthShell } from '@/components/AuthShell'
import { Store } from 'lucide-react'
import { useLanguage } from '@/context/LanguageContext'

/**
 * The shop owner's sign-in (and the admin's), in the phone-style look the user
 * asked for from a recording (2026-10-12). Accounts are made by the admin, so
 * there is no sign-up — a new shop applies (/apply, migration 045), and the
 * admin accepts the application after payment.
 * Customers never come here: they arrive through a shop's QR or link.
 */
export default function Login() {
  const { session, loading } = useAuth()
  const { t } = useLanguage()

  if (!loading && session) return <Navigate to="/dashboard" replace />

  return (
    <AuthShell
      brand={
        <Link to="/" className="flex items-center gap-2">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#5FE08C" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M3 21h18" />
            <path d="M5 21V8l5-4v17" />
            <path d="M10 21V11l6 3v7" />
            <path d="M16 21v-4l3 1.5V21" />
          </svg>
          <span className="text-xl font-bold">BuildSupply</span>
        </Link>
      }
      tagline={t('site.footer.tagline')}
      title={t('login.welcome')}
      subtitle={t('site.hero.signInTitle')}
      footer={
        <div className="text-center">
          <div className="mb-3 flex items-center gap-3 text-xs text-muted-2">
            <span className="h-px flex-1 bg-border" />
            {t('site.hero.new')}
            <span className="h-px flex-1 bg-border" />
          </div>
          {/* A new shop applies here (045): no sign-up, an application the
              admin accepts after payment. */}
          <Link
            to="/apply"
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-border bg-card py-3 text-sm font-semibold text-accent-text hover:bg-accent-bg"
          >
            <Store size={16} /> {t('login.apply')}
          </Link>
        </div>
      }
    >
      <SignInForm />
    </AuthShell>
  )
}
