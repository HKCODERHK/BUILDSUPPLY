import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { Lock, Mail } from 'lucide-react'
import { useAuth } from '@/context/AuthContext'
import { Input } from '@/components/ui/input'
import { PasswordInput } from '@/components/ui/password-input'
import { GradientButton, IconField, iconInputClass } from '@/components/AuthShell'
import { useLanguage } from '@/context/LanguageContext'

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

/**
 * Email + password, and nothing else. One form shared by the sign-in page and
 * the website's front page, so the two can never sign in differently.
 * Redirecting a signed-in visitor is left to the page that holds it.
 */
export function SignInForm({ idPrefix = '' }: { idPrefix?: string }) {
  const { signIn } = useAuth()
  const { t } = useLanguage()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  // Said while typing, once there is enough to judge — the recording's
  // "That email doesn't look right" — and never before the first '@'.
  const emailLooksWrong = email.trim().length > 3 && email.includes('@') && !EMAIL.test(email.trim())

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    const { error } = await signIn(email.trim(), password)
    setSubmitting(false)
    if (error) setError(error)
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <IconField icon={Mail} error={emailLooksWrong ? t('login.badEmail') : null}>
        <Input
          id={`${idPrefix}email`}
          type="email"
          autoComplete="username"
          required
          aria-label={t('auth.email')}
          placeholder={t('auth.email')}
          className={iconInputClass}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </IconField>
      <IconField icon={Lock}>
        <PasswordInput
          id={`${idPrefix}password`}
          autoComplete="current-password"
          required
          aria-label={t('auth.password')}
          placeholder={t('auth.password')}
          className={iconInputClass}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          showLabel={t('auth.showPassword')}
          hideLabel={t('auth.hidePassword')}
        />
      </IconField>
      <div className="-mt-1 flex justify-end">
        <Link to="/forgot-password" className="text-xs font-medium text-accent-text">
          {t('auth.forgot')}
        </Link>
      </div>
      {error && <p className="rounded-lg bg-red-50 p-2.5 text-xs text-red-700 dark:bg-red-950 dark:text-red-300">{error}</p>}
      <GradientButton type="submit" busy={submitting} aria-label={submitting ? t('auth.signingIn') : undefined}>
        {t('auth.signIn')}
      </GradientButton>
    </form>
  )
}
