import { useState, type FormEvent } from 'react'
import { Card, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { PasswordInput } from '@/components/ui/password-input'
import { changeOwnPassword, WrongPasswordError } from '@/services/account'
import { useAuth } from '@/context/AuthContext'
import { useLanguage } from '@/context/LanguageContext'

// Supabase's default minimum, and what the admin's own card asks for.
const MIN_LENGTH = 6

/**
 * Settings → Change password. A supplier starts with a password the admin
 * generated and sent them; this is how they swap it for one only they know.
 * The current password is asked for first, so someone holding an unlocked
 * phone can't lock the owner out.
 */
export function ChangePasswordCard() {
  const { session } = useAuth()
  const { t } = useLanguage()
  const [form, setForm] = useState({ current: '', next: '', confirm: '' })
  const [saving, setSaving] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const tooShort = form.next.length > 0 && form.next.length < MIN_LENGTH
  const mismatch = form.confirm.length > 0 && form.confirm !== form.next
  const ready = form.current.length > 0 && form.next.length >= MIN_LENGTH && form.confirm === form.next

  function update(field: keyof typeof form, value: string) {
    setForm({ ...form, [field]: value })
    setDone(false)
    setError(null)
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    const email = session?.user.email
    if (!email || !ready || saving) return
    if (form.next === form.current) {
      setError(t('set.pwSame'))
      return
    }
    setSaving(true)
    setError(null)
    try {
      await changeOwnPassword(email, form.current, form.next)
      setForm({ current: '', next: '', confirm: '' })
      setDone(true)
    } catch (err) {
      const code = (err as { code?: string }).code
      setError(
        err instanceof WrongPasswordError
          ? t('set.pwWrong')
          : code === 'same_password'
            ? t('set.pwSame')
            : code === 'weak_password'
              ? t('set.pwShort', { min: MIN_LENGTH })
              : t('error.generic'),
      )
    } finally {
      setSaving(false)
    }
  }

  const eye = { showLabel: t('auth.showPassword'), hideLabel: t('auth.hidePassword') }

  return (
    <Card className="mt-4 max-w-lg">
      <CardHeader>
        <CardTitle>{t('set.pwTitle')}</CardTitle>
      </CardHeader>
      <p className="-mt-2 mb-4 text-xs text-muted">{t('set.pwHint')}</p>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div>
          <Label htmlFor="pw-current">{t('set.pwCurrent')}</Label>
          <PasswordInput
            id="pw-current"
            autoComplete="current-password"
            value={form.current}
            onChange={(e) => update('current', e.target.value)}
            {...eye}
          />
        </div>
        <div>
          <Label htmlFor="pw-new">{t('set.pwNew')}</Label>
          <PasswordInput
            id="pw-new"
            autoComplete="new-password"
            value={form.next}
            onChange={(e) => update('next', e.target.value)}
            {...eye}
          />
          {tooShort && <p className="mt-1.5 text-xs text-muted">{t('set.pwShort', { min: MIN_LENGTH })}</p>}
        </div>
        <div>
          <Label htmlFor="pw-confirm">{t('set.pwConfirm')}</Label>
          <PasswordInput
            id="pw-confirm"
            autoComplete="new-password"
            value={form.confirm}
            onChange={(e) => update('confirm', e.target.value)}
            {...eye}
          />
          {mismatch && <p className="mt-1.5 text-xs text-red-600">{t('set.pwMismatch')}</p>}
        </div>
        {error && (
          <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">{error}</p>
        )}
        {done && <p className="rounded-lg bg-accent-bg p-3 text-sm font-medium text-accent-text">{t('set.pwChanged')}</p>}
        <div>
          <Button type="submit" disabled={!ready || saving}>
            {saving ? t('common.saving') : t('set.pwSave')}
          </Button>
        </div>
      </form>
    </Card>
  )
}
