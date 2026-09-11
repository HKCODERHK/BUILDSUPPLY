import { useState, type FormEvent } from 'react'
import { Modal } from '@/components/ui/modal'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { createCustomer, setOpeningBalance } from '@/services/customers'
import { sanitizeDecimal } from '@/lib/numberInput'
import { useLanguage } from '@/context/LanguageContext'
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
  const { t } = useLanguage()
  const [form, setForm] = useState({
    name: '',
    phone: '',
    site: '',
    address: '',
    credit_limit: '',
    opening: '',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Set once the customer exists. If the old balance then fails to save, Save
  // again only retries that — it must never create the customer twice.
  const [created, setCreated] = useState<Customer | null>(null)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (form.phone && form.phone.length !== 10) {
      setError(t('error.phone10'))
      return
    }
    setSaving(true)
    setError(null)
    let customer = created
    try {
      if (!customer) {
        customer = await createCustomer(supplierId, {
          name: form.name,
          phone: form.phone,
          site: form.site,
          address: form.address,
          credit_limit: form.credit_limit ? Number(form.credit_limit) : null,
        })
        setCreated(customer)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t('error.generic'))
      setSaving(false)
      return
    }
    try {
      const opening = Number(form.opening) || 0
      if (opening > 0) await setOpeningBalance(customer.id, opening)
      onCreated(customer)
    } catch {
      setError(t('cust.openingRetry'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal title={t('cust.addTitle')} onClose={onClose}>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        {error && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">{error}</p>}
        <div>
          <Label htmlFor="new-cust-name" required>{t('common.name')}</Label>
          <Input
            id="new-cust-name"
            required
            disabled={!!created}
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
        </div>
        <div>
          <Label htmlFor="new-cust-phone">{t('common.phone')}</Label>
          <Input
            id="new-cust-phone"
            inputMode="numeric"
            placeholder={t('cust.phoneHint')}
            disabled={!!created}
            value={form.phone}
            onChange={(e) => setForm({ ...form, phone: e.target.value.replace(/\D/g, '').slice(0, 10) })}
          />
        </div>
        <div>
          <Label htmlFor="new-cust-site">{t('cust.usualSite')}</Label>
          <Input id="new-cust-site" disabled={!!created} value={form.site} onChange={(e) => setForm({ ...form, site: e.target.value })} />
        </div>
        <div>
          <Label htmlFor="new-cust-address">{t('common.address')}</Label>
          <Input
            id="new-cust-address"
            disabled={!!created}
            value={form.address}
            onChange={(e) => setForm({ ...form, address: e.target.value })}
          />
        </div>
        <div>
          <Label htmlFor="new-cust-credit-limit">{t('cust.creditLimit')}</Label>
          <Input
            id="new-cust-credit-limit"
            type="text"
            inputMode="decimal"
            placeholder="0"
            disabled={!!created}
            value={form.credit_limit}
            onChange={(e) => setForm({ ...form, credit_limit: sanitizeDecimal(e.target.value) })}
          />
          <p className="mt-1.5 text-xs text-muted">{t('cust.creditLimitHint')}</p>
        </div>
        {/* Their old udhaar from before BuildSupply, so the khata is right
            from the first day instead of starting at zero. */}
        <div>
          <Label htmlFor="new-cust-opening">{t('cust.openingField')}</Label>
          <Input
            id="new-cust-opening"
            type="text"
            inputMode="decimal"
            placeholder="0"
            value={form.opening}
            onChange={(e) => setForm({ ...form, opening: sanitizeDecimal(e.target.value) })}
          />
          <p className="mt-1.5 text-xs text-muted">{t('cust.openingHint')}</p>
        </div>
        <Button type="submit" disabled={saving}>
          {saving ? t('common.saving') : t('cust.saveCustomer')}
        </Button>
      </form>
    </Modal>
  )
}
