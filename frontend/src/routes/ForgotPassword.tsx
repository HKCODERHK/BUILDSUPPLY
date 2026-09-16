import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { ThemeToggle } from '@/components/ThemeToggle'
import { LanguageToggle } from '@/components/LanguageToggle'
import { useLanguage } from '@/context/LanguageContext'

export default function ForgotPassword() {
  const { t } = useLanguage()
  const [email, setEmail] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    setError(null)
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    })
    setSubmitting(false)
    if (error) setError(error.message)
    else setSent(true)
  }

  return (
    <div className="relative flex min-h-app items-center justify-center bg-shell p-4">
      <div className="absolute right-4 top-4 flex items-center gap-2">
        <LanguageToggle className="border-white/20 text-white hover:bg-white/10 hover:text-white" />
        <ThemeToggle className="border-white/20 text-white hover:bg-white/10 hover:text-white" />
      </div>
      <div className="w-full max-w-sm rounded-2xl bg-card p-7">
        <h1 className="mb-1 text-center text-lg font-bold text-ink">{t('auth.resetTitle')}</h1>
        <p className="mb-5 text-center text-sm text-muted">{t('auth.resetSubtitle')}</p>

        {sent ? (
          <p className="rounded-lg bg-accent-bg p-3 text-center text-sm text-accent-text">{t('auth.checkInbox')}</p>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div>
              <Label htmlFor="email">{t('auth.email')}</Label>
              <Input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            {error && <p className="text-xs text-red-600">{error}</p>}
            <Button type="submit" disabled={submitting} className="w-full">
              {submitting ? t('auth.sending') : t('auth.sendLink')}
            </Button>
          </form>
        )}

        <p className="mt-5 text-center text-xs text-muted-2">
          <Link to="/login" className="font-medium text-accent">
            {t('auth.backToSignIn')}
          </Link>
        </p>
      </div>
    </div>
  )
}
