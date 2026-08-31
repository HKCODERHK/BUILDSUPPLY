import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { ThemeToggle } from '@/components/ThemeToggle'
import { LanguageToggle } from '@/components/LanguageToggle'
import { useLanguage } from '@/context/LanguageContext'

// Reached via the link in the password-reset email. Supabase now sends a
// PKCE `?code=...` param rather than an auto-detected token in the URL
// hash, so we have to explicitly exchange it for a session before
// updateUser() has anything to act on.
export default function ResetPassword() {
  const navigate = useNavigate()
  const { t } = useLanguage()
  const [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Kept as a flag rather than a stored message so it re-renders in the
  // chosen language if the supplier switches while looking at this screen.
  const [linkInvalid, setLinkInvalid] = useState(false)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    const code = new URLSearchParams(window.location.search).get('code')
    if (!code) {
      setLinkInvalid(true)
      return
    }
    supabase.auth.exchangeCodeForSession(code).then(({ error }) => {
      if (error) setError(error.message)
      else setReady(true)
    })
  }, [])

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    setError(null)
    const { error } = await supabase.auth.updateUser({ password })
    setSubmitting(false)
    if (error) {
      setError(error.message)
      return
    }
    navigate('/dashboard', { replace: true })
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center bg-shell p-4">
      <div className="absolute right-4 top-4 flex items-center gap-2">
        <LanguageToggle className="border-white/20 text-white hover:bg-white/10 hover:text-white" />
        <ThemeToggle className="border-white/20 text-white hover:bg-white/10 hover:text-white" />
      </div>
      <div className="w-full max-w-sm rounded-2xl bg-card p-7">
        <h1 className="mb-1 text-center text-lg font-bold text-ink">{t('auth.setNewTitle')}</h1>
        <p className="mb-5 text-center text-sm text-muted">{t('auth.setNewSubtitle')}</p>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div>
            <Label htmlFor="password">{t('auth.newPassword')}</Label>
            <Input
              id="password"
              type="password"
              required
              minLength={6}
              disabled={!ready}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          {(linkInvalid || error) && (
            <p className="text-xs text-red-600">{linkInvalid ? t('auth.invalidLink') : error}</p>
          )}
          <Button type="submit" disabled={submitting || !ready} className="w-full">
            {submitting ? t('common.saving') : ready ? t('auth.updatePassword') : t('auth.verifying')}
          </Button>
        </form>
      </div>
    </div>
  )
}
