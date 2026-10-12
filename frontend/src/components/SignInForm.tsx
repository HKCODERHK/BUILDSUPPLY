import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'
import { Input } from '@/components/ui/input'
import { PasswordInput } from '@/components/ui/password-input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { useLanguage } from '@/context/LanguageContext'

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

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    const { error } = await signIn(email, password)
    setSubmitting(false)
    if (error) setError(error)
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div>
        <Label htmlFor={`${idPrefix}email`} required>{t('auth.email')}</Label>
        <Input
          id={`${idPrefix}email`}
          type="email"
          autoComplete="username"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </div>
      <div>
        <div className="flex items-center justify-between">
          <Label htmlFor={`${idPrefix}password`} className="mb-1.5">
            {t('auth.password')}
          </Label>
          <Link to="/forgot-password" className="mb-1.5 text-xs font-medium text-accent">
            {t('auth.forgot')}
          </Link>
        </div>
        <PasswordInput
          id={`${idPrefix}password`}
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          showLabel={t('auth.showPassword')}
          hideLabel={t('auth.hidePassword')}
        />
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
      <Button type="submit" disabled={submitting} className="mt-1 w-full">
        {submitting ? t('auth.signingIn') : t('auth.signIn')}
      </Button>
    </form>
  )
}
