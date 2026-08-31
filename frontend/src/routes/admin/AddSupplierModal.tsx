import { useEffect, useState, type FormEvent } from 'react'
import { RefreshCw, Copy, Check } from 'lucide-react'
import { Modal } from '@/components/ui/modal'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { WhatsAppIcon } from '@/components/icons/WhatsAppIcon'
import { createSupplierAccount } from '@/services/adminSuppliers'
import { getPlatformSettings } from '@/services/platformSettings'
import { openWhatsAppShare } from '@/lib/whatsapp'
import { generatePassword } from '@/lib/generatePassword'
import { today, todayPlusDays } from '@/lib/subscription'
import type { Plan } from '@/lib/database.types'

const emptyForm = {
  business_name: '',
  owner_name: '',
  email: '',
  password: '',
  phone: '',
  address: '',
  plan: 'starter' as Plan,
  subscription_start: '',
  subscription_expiry: '',
}

// What the admin has to hand over once the account exists. Kept in state
// after creation because the password is never readable again afterwards.
interface Handoff {
  business_name: string
  owner_name: string
  email: string
  password: string
  phone: string
}

export function AddSupplierModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [handoff, setHandoff] = useState<Handoff | null>(null)
  const [copied, setCopied] = useState(false)

  // Dates come from the platform default the admin already configured, so a
  // new account is dated correctly without anyone typing a date. Both fields
  // stay editable for the odd account that needs a different term.
  useEffect(() => {
    let active = true
    getPlatformSettings()
      .then((settings) => {
        if (!active) return
        setForm((prev) => ({
          ...prev,
          password: prev.password || generatePassword(),
          subscription_start: prev.subscription_start || today(),
          subscription_expiry: prev.subscription_expiry || todayPlusDays(settings.default_subscription_days || 30),
        }))
      })
      .catch(() => {
        // Settings unreachable is no reason to block onboarding — fall back
        // to the same 30 days the platform ships with.
        if (!active) return
        setForm((prev) => ({
          ...prev,
          password: prev.password || generatePassword(),
          subscription_start: prev.subscription_start || today(),
          subscription_expiry: prev.subscription_expiry || todayPlusDays(30),
        }))
      })
    return () => {
      active = false
    }
  }, [])

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    try {
      await createSupplierAccount({
        email: form.email,
        password: form.password,
        business_name: form.business_name,
        owner_name: form.owner_name || undefined,
        phone: form.phone || undefined,
        address: form.address || undefined,
        plan: form.plan,
        subscription_start: form.subscription_start || undefined,
        subscription_expiry: form.subscription_expiry || undefined,
      })
      onCreated()
      setHandoff({
        business_name: form.business_name,
        owner_name: form.owner_name,
        email: form.email,
        password: form.password,
        phone: form.phone,
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create supplier')
    } finally {
      setSaving(false)
    }
  }

  function loginMessage(h: Handoff) {
    const owner = h.owner_name.trim() || h.business_name
    return (
      `Hi ${owner}, your BuildSupply account for ${h.business_name} is ready.\n\n` +
      `Login: ${h.email}\n` +
      `Password: ${h.password}\n\n` +
      `Open ${window.location.origin} and sign in. Please change this password from Settings after your first login.`
    )
  }

  async function copyDetails(h: Handoff) {
    try {
      await navigator.clipboard.writeText(loginMessage(h))
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Clipboard blocked — the details are on screen to copy by hand.
    }
  }

  if (handoff) {
    return (
      <Modal title="Supplier created" onClose={onClose}>
        <div className="flex flex-col gap-4">
          <p className="rounded-lg bg-accent-bg p-3 text-sm text-accent-text">
            {handoff.business_name} can sign in now. This password is not stored anywhere you can read it again —
            send it before closing.
          </p>

          <dl className="flex flex-col gap-2 rounded-lg border border-border p-3 text-sm">
            <div className="flex justify-between gap-3">
              <dt className="text-muted">Login</dt>
              <dd className="truncate font-medium text-ink">{handoff.email}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-muted">Password</dt>
              <dd className="font-mono font-medium text-ink">{handoff.password}</dd>
            </div>
          </dl>

          <div className="flex flex-wrap gap-2">
            {handoff.phone && (
              <Button onClick={() => openWhatsAppShare(handoff.phone, loginMessage(handoff))}>
                <WhatsAppIcon size={16} /> Send on WhatsApp
              </Button>
            )}
            <Button variant="outline" onClick={() => copyDetails(handoff)}>
              {copied ? <Check size={16} /> : <Copy size={16} />} {copied ? 'Copied' : 'Copy details'}
            </Button>
          </div>

          <Button variant="outline" onClick={onClose}>
            Done
          </Button>
        </div>
      </Modal>
    )
  }

  return (
    <Modal title="Add supplier" onClose={onClose}>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div>
          <Label htmlFor="business_name">Business name</Label>
          <Input
            id="business_name"
            required
            value={form.business_name}
            onChange={(e) => setForm({ ...form, business_name: e.target.value })}
          />
        </div>
        <div>
          <Label htmlFor="owner_name">Owner name</Label>
          <Input id="owner_name" value={form.owner_name} onChange={(e) => setForm({ ...form, owner_name: e.target.value })} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="email">Login email</Label>
            <Input id="email" type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </div>
          <div>
            <div className="flex items-center justify-between">
              <Label htmlFor="password" className="mb-1.5">
                Password
              </Label>
              <button
                type="button"
                onClick={() => setForm({ ...form, password: generatePassword() })}
                className="mb-1.5 flex items-center gap-1 text-xs font-semibold text-accent hover:text-accent-soft"
              >
                <RefreshCw size={12} /> New
              </button>
            </div>
            <Input
              id="password"
              type="text"
              required
              minLength={6}
              className="font-mono"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
            />
          </div>
        </div>
        <div>
          <Label htmlFor="phone">Phone</Label>
          <Input id="phone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          <p className="mt-1.5 text-xs text-muted">Needed to send the login details over WhatsApp.</p>
        </div>
        <div>
          <Label htmlFor="address">Address</Label>
          <Input id="address" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
        </div>
        <div>
          <Label htmlFor="plan">Plan</Label>
          <select
            id="plan"
            value={form.plan}
            onChange={(e) => setForm({ ...form, plan: e.target.value as Plan })}
            className="h-10 w-full rounded-lg border border-border bg-card px-3 text-sm outline-none focus:border-accent"
          >
            <option value="starter">Starter</option>
            <option value="pro">Pro</option>
          </select>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="sub_start">Subscription start</Label>
            <Input
              id="sub_start"
              type="date"
              value={form.subscription_start}
              onChange={(e) => setForm({ ...form, subscription_start: e.target.value })}
            />
          </div>
          <div>
            <Label htmlFor="sub_expiry">Subscription expiry</Label>
            <Input
              id="sub_expiry"
              type="date"
              value={form.subscription_expiry}
              onChange={(e) => setForm({ ...form, subscription_expiry: e.target.value })}
            />
          </div>
        </div>

        {error && <p className="text-xs text-red-600">{error}</p>}

        <Button type="submit" disabled={saving}>
          {saving ? 'Creating…' : 'Create supplier'}
        </Button>
      </form>
    </Modal>
  )
}
