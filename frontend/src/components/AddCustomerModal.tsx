import { useState, type FormEvent } from 'react'
import { BookUser } from 'lucide-react'
import { Modal } from '@/components/ui/modal'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { PhoneInput } from '@/components/ui/phone-input'
import { Label } from '@/components/ui/label'
import { createCustomer, setOpeningBalance } from '@/services/customers'
import { sanitizeDecimal } from '@/lib/numberInput'
import { canPickContacts, pickContacts, type PickedContact } from '@/lib/contacts'
import { cn } from '@/lib/utils'
import { useLanguage } from '@/context/LanguageContext'
import type { Customer } from '@/lib/database.types'

type PickedRow = PickedContact & { key: number; use: boolean }

// One customer form shared by the Customers page and by billing, so a
// customer added mid-bill lands in the customer list with exactly the same
// fields and validation as one added from the Customers page.
//
// "Pick from phone contacts" (Android): one contact fills the form; on the
// Customers page (`onCreatedMany`) several can be picked, checked over in a
// list — names editable, anyone without a 10-digit mobile left out — and
// added in one go. Any that can't be (a number already in use, say) are
// listed with the reason; the rest are added.
export function AddCustomerModal({
  supplierId,
  onClose,
  onCreated,
  onCreatedMany,
}: {
  supplierId: string
  onClose: () => void
  onCreated: (customer: Customer) => void
  /** The Customers page: several contacts can be picked and added at once. */
  onCreatedMany?: (customers: Customer[]) => void
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
  const [picked, setPicked] = useState<PickedRow[] | null>(null)
  const [result, setResult] = useState<{ added: Customer[]; skipped: { name: string; why: string }[] } | null>(null)
  const contactsAvailable = !created && canPickContacts()

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

  async function fromContacts() {
    setError(null)
    let list: PickedContact[]
    try {
      list = await pickContacts(!!onCreatedMany)
    } catch {
      return // the phone refused, or the picker was shut — nothing to do
    }
    if (list.length === 0) return
    if (list.length === 1 || !onCreatedMany) {
      const [contact] = list
      setForm((f) => ({ ...f, name: contact.name || f.name, phone: contact.phone || f.phone }))
      return
    }
    setPicked(list.map((c, i) => ({ ...c, key: i, use: c.phone.length === 10 && c.name !== '' })))
  }

  function updateRow(key: number, patch: Partial<PickedRow>) {
    setPicked((rows) => rows?.map((r) => (r.key === key ? { ...r, ...patch } : r)) ?? null)
  }

  const chosen = picked?.filter((r) => r.use && r.name.trim() !== '' && r.phone.length === 10) ?? []

  async function addPicked() {
    if (saving || chosen.length === 0) return
    setSaving(true)
    const added: Customer[] = []
    const skipped: { name: string; why: string }[] = []
    // One at a time, so a duplicate number fails only that contact.
    for (const row of chosen) {
      try {
        added.push(await createCustomer(supplierId, { name: row.name.trim(), phone: row.phone }))
      } catch (err) {
        skipped.push({ name: row.name, why: err instanceof Error ? err.message : t('error.generic') })
      }
    }
    setSaving(false)
    if (skipped.length === 0) onCreatedMany?.(added)
    else setResult({ added, skipped })
  }

  if (result) {
    return (
      <Modal title={t('cust.pickedTitle')} onClose={() => onCreatedMany?.(result.added)}>
        <div className="flex flex-col gap-3">
          <p className="text-sm font-semibold text-ink">{t('cust.addedMany', { count: result.added.length })}</p>
          <div>
            <p className="text-sm text-muted">{t('cust.skippedMany')}</p>
            <ul className="mt-1 flex flex-col gap-1 text-sm">
              {result.skipped.map((s) => (
                <li key={s.name + s.why}>
                  <span className="font-medium text-ink">{s.name}</span> <span className="text-muted">— {s.why}</span>
                </li>
              ))}
            </ul>
          </div>
          <Button onClick={() => onCreatedMany?.(result.added)}>{t('common.done')}</Button>
        </div>
      </Modal>
    )
  }

  if (picked) {
    return (
      <Modal title={t('cust.pickedTitle')} onClose={onClose}>
        <div className="flex flex-col gap-3">
          <div className="-mx-2 flex vh-cap-55 flex-col overflow-y-auto">
            {picked.map((row) => {
              const hasPhone = row.phone.length === 10
              return (
                <label key={row.key} className={cn('flex items-center gap-3 rounded-lg px-2 py-2', !hasPhone && 'opacity-60')}>
                  <input
                    type="checkbox"
                    checked={row.use && hasPhone}
                    disabled={!hasPhone}
                    onChange={(e) => updateRow(row.key, { use: e.target.checked })}
                  />
                  <span className="min-w-0 flex-1">
                    <input
                      value={row.name}
                      onChange={(e) => updateRow(row.key, { name: e.target.value })}
                      aria-label={t('common.name')}
                      className="w-full border-b border-transparent bg-transparent text-sm font-medium text-ink outline-none focus:border-accent"
                    />
                    <span className="block text-xs text-muted">{hasPhone ? row.phone : t('cust.pickedNoPhone')}</span>
                  </span>
                </label>
              )
            })}
          </div>
          <Button onClick={addPicked} disabled={saving || chosen.length === 0}>
            {saving ? t('common.saving') : t('cust.addMany', { count: chosen.length })}
          </Button>
          <button
            type="button"
            onClick={() => setPicked(null)}
            className="self-start text-xs font-semibold text-accent-text hover:text-accent"
          >
            ← {t('common.back')}
          </button>
        </div>
      </Modal>
    )
  }

  return (
    <Modal title={t('cust.addTitle')} onClose={onClose}>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        {error && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">{error}</p>}
        {/* Android's own contact picker; not offered where the phone has none. */}
        {contactsAvailable && (
          <Button type="button" variant="outline" onClick={fromContacts}>
            <BookUser size={16} /> {t('cust.pickContacts')}
          </Button>
        )}
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
          <PhoneInput
            id="new-cust-phone"
            placeholder={t('cust.phoneHint')}
            disabled={!!created}
            value={form.phone}
            onValueChange={(phone) => setForm({ ...form, phone })}
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
