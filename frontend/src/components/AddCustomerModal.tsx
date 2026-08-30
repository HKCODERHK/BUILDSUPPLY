import { useState, type FormEvent } from 'react'
import { Modal } from '@/components/ui/modal'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { createCustomer } from '@/services/customers'
import type { Customer } from '@/lib/database.types'

// One customer form shared by the Customers page and by billing, so a
// customer added mid-bill lands in the customer list with exactly the same
// fields and validation as one added from the Customers page.
export function AddCustomerModal({
  supplierId,
  onClose,
  onCreated,
}: {
  supplierId: string
  onClose: () => void
  onCreated: (customer: Customer) => void
}) {
  const [form, setForm] = useState({ name: '', phone: '', site: '', address: '' })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (form.phone && form.phone.length !== 10) {
      setError('Phone number must be exactly 10 digits.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      const customer = await createCustomer(supplierId, form)
      onCreated(customer)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal title="Add customer" onClose={onClose}>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        {error && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">{error}</p>}
        <div>
          <Label htmlFor="new-cust-name">Name</Label>
          <Input id="new-cust-name" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </div>
        <div>
          <Label htmlFor="new-cust-phone">Phone</Label>
          <Input
            id="new-cust-phone"
            inputMode="numeric"
            placeholder="10-digit mobile number"
            value={form.phone}
            onChange={(e) => setForm({ ...form, phone: e.target.value.replace(/\D/g, '').slice(0, 10) })}
          />
        </div>
        <div>
          <Label htmlFor="new-cust-site">Usual site (optional)</Label>
          <Input id="new-cust-site" value={form.site} onChange={(e) => setForm({ ...form, site: e.target.value })} />
        </div>
        <div>
          <Label htmlFor="new-cust-address">Address</Label>
          <Input id="new-cust-address" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
        </div>
        <Button type="submit" disabled={saving}>
          {saving ? 'Saving…' : 'Save customer'}
        </Button>
      </form>
    </Modal>
  )
}
