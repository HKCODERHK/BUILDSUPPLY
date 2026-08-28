import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'

// Reached via the link in the password-reset email. Supabase now sends a
// PKCE `?code=...` param rather than an auto-detected token in the URL
// hash, so we have to explicitly exchange it for a session before
// updateUser() has anything to act on.
export default function ResetPassword() {
  const navigate = useNavigate()
  const [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    const code = new URLSearchParams(window.location.search).get('code')
    if (!code) {
      setError('This reset link is invalid or has already been used.')
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
    <div className="flex min-h-screen items-center justify-center bg-ink p-4">
      <div className="w-full max-w-sm rounded-2xl bg-white p-7">
        <h1 className="mb-1 text-center text-lg font-bold text-ink">Set a new password</h1>
        <p className="mb-5 text-center text-sm text-muted">Choose a new password for your account.</p>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div>
            <Label htmlFor="password">New password</Label>
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
          {error && <p className="text-xs text-red-600">{error}</p>}
          <Button type="submit" disabled={submitting || !ready} className="w-full">
            {submitting ? 'Saving…' : ready ? 'Update password' : 'Verifying link…'}
          </Button>
        </form>
      </div>
    </div>
  )
}
