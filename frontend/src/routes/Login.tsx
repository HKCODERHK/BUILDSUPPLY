import { Link, Navigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'
import { SignInForm } from '@/components/SignInForm'
import { AuthShell } from '@/components/AuthShell'
import { KhataLinkEntry } from '@/components/KhataLinkEntry'
import { BookOpen, Store, UserRound } from 'lucide-react'
import { useLanguage } from '@/context/LanguageContext'
import { hasCustomerSession } from '@/lib/customerAuth'
import { cn } from '@/lib/utils'

/**
 * The shop owner's sign-in (and the admin's), in the phone-style look the user
 * asked for from a recording (2026-10-12). Accounts are made by the admin, so
 * there is no sign-up — a new shop applies (/apply, migration 045), and the
 * admin accepts the application after payment.
 *
 * Two tabs (2026-10-19, the user's request): Shop owner — the sign-in above,
 * the default — and Customer (`?as=customer`), which has no password: a
 * customer gets in with the khata link their shop sent on WhatsApp, the same
 * proof as everywhere else, or opens the shops already saved on this phone.
 */
export default function Login() {
  const { session, loading } = useAuth()
  const { t } = useLanguage()

  const [params, setParams] = useSearchParams()
  if (!loading && session) return <Navigate to="/dashboard" replace />
  const asCustomer = params.get('as') === 'customer'
  // Tabs swap the search param in place, so Back leaves the page rather than
  // stepping between the two.
  const choose = (customer: boolean) => setParams(customer ? { as: 'customer' } : {}, { replace: true })
  const tabs = (
    <div role="tablist" aria-label={t('login.whoTitle')} className="mb-5 grid grid-cols-2 gap-1 rounded-2xl bg-surface p-1">
      {[false, true].map((customer) => (
        <button
          key={String(customer)}
          type="button"
          role="tab"
          aria-selected={asCustomer === customer}
          onClick={() => choose(customer)}
          className={cn(
            'flex min-h-11 items-center justify-center gap-2 rounded-xl text-sm font-semibold transition-colors',
            asCustomer === customer ? 'bg-card text-accent-text shadow-sm' : 'text-muted hover:text-ink',
          )}
        >
          {customer ? <UserRound size={16} /> : <Store size={16} />}
          {customer ? t('login.tabCustomer') : t('login.tabShop')}
        </button>
      ))}
    </div>
  )

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
      title={asCustomer ? t('cw.title') : t('login.welcome')}
      subtitle={asCustomer ? t('login.customerSub') : t('site.hero.signInTitle')}
      footer={
        asCustomer ? undefined : (
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
        )
      }
    >
      {tabs}
      {asCustomer ? (
        <div className="flex flex-col gap-4">
          <KhataLinkEntry />
          {/* Shops already saved on this phone (041): straight to them. */}
          {hasCustomerSession() && (
            <Link
              to="/me"
              className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-border bg-card text-sm font-semibold text-accent-text hover:bg-accent-bg"
            >
              <BookOpen size={16} /> {t('acct.title')}
            </Link>
          )}
        </div>
      ) : (
        <SignInForm />
      )}
    </AuthShell>
  )
}
