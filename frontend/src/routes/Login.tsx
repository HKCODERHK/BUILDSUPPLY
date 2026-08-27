import { useState, type FormEvent } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'

export default function Login() {
  const { session, signIn, loading } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  if (!loading && session) return <Navigate to="/dashboard" replace />

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    const { error } = await signIn(email, password)
    setSubmitting(false)
    if (error) setError(error)
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-ink p-4">
      <div className="w-full max-w-sm rounded-2xl bg-white p-7">
        <div className="mb-1 flex items-center justify-center gap-2">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#198A45" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 21h18" />
            <path d="M5 21V8l5-4v17" />
            <path d="M10 21V11l6 3v7" />
            <path d="M16 21v-4l3 1.5V21" />
          </svg>
          <span className="text-lg font-bold text-ink">BuildSupply</span>
        </div>
        <h1 className="mb-5 text-center text-sm text-muted">Sign in to your account</h1>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div>
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              autoComplete="username"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div>
            <div className="flex items-center justify-between">
              <Label htmlFor="password" className="mb-1.5">
                Password
              </Label>
              <Link to="/forgot-password" className="mb-1.5 text-xs font-medium text-accent">
                Forgot password?
              </Link>
            </div>
            <Input
              id="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          {error && <p className="text-xs text-red-600">{error}</p>}
          <Button type="submit" disabled={submitting} className="mt-1 w-full">
            {submitting ? 'Signing in…' : 'Sign in'}
          </Button>
        </form>

        <p className="mt-5 text-center text-xs text-muted-2">
          Don't have an account? Contact the BuildSupply admin to get one created.
        </p>
      </div>
    </div>
  )
}
