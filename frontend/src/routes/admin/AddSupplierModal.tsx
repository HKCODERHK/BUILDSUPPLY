import { useState, type FormEvent } from 'react'
import { Modal } from '@/components/ui/modal'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { createSupplierAccount } from '@/services/adminSuppliers'
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

export function AddSupplierModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

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
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create supplier')
    } finally {
      setSaving(false)
    }
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
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="text"
              required
              minLength={6}
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
            />
          </div>
        </div>
        <div>
          <Label htmlFor="phone">Phone</Label>
          <Input id="phone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
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
            className="h-10 w-full rounded-lg border border-border bg-white px-3 text-sm outline-none focus:border-accent"
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
