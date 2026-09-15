import { useEffect, useState, type FormEvent } from 'react'
import { LoaderCircle, Trash2 } from 'lucide-react'
import { Modal } from '@/components/ui/modal'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { PhoneInput } from '@/components/ui/phone-input'
import { WhatsAppIcon } from '@/components/icons/WhatsAppIcon'
import { useAuth } from '@/context/AuthContext'
import { useLanguage } from '@/context/LanguageContext'
import { openWhatsAppShare } from '@/lib/whatsapp'
import type { Driver, Invoice } from '@/lib/database.types'
import { addDriver, listDrivers, removeDriver } from '@/services/drivers'
import { listItemsForInvoices, type DeliveryItemRow } from '@/services/invoices'
import { listOrderNotesForQuotations } from '@/services/orders'

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
}

/**
 * Send to driver (bill page ⋯, and each bill in Deliveries): tap one of the
 * supplier's saved drivers and WhatsApp opens that driver's own chat with the
 * delivery written out — customer, phone, site, address, materials (no
 * amounts, like the driver's list), the customer's order note, and a map
 * link. A wa.me link, so it is text only, and the supplier presses Send.
 * Drivers are kept in the database (migration 031), so every phone the
 * supplier uses has the same list.
 */
export function SendToDriverModal({
  invoice,
  customer,
  onClose,
}: {
  invoice: Pick<Invoice, 'id' | 'invoice_no' | 'site' | 'quotation_id'>
  customer: { name: string; phone: string | null; address: string | null; site?: string | null } | null
  onClose: () => void
}) {
  const { supplier } = useAuth()
  const { t, mt } = useLanguage()
  const [drivers, setDrivers] = useState<Driver[] | null>(null)
  const [items, setItems] = useState<DeliveryItemRow[] | null>(null)
  const [fromOrder, setFromOrder] = useState<{ note: string | null; delivery_date: string | null } | null>(null)
  const [failed, setFailed] = useState(false)
  const [adding, setAdding] = useState(false)
  const [form, setForm] = useState({ name: '', phone: '' })
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  useEffect(() => {
    Promise.all([
      listDrivers(),
      listItemsForInvoices([invoice.id]),
      invoice.quotation_id ? listOrderNotesForQuotations([invoice.quotation_id]).catch(() => []) : Promise.resolve([]),
    ])
      .then(([driverList, itemList, notes]) => {
        setDrivers(driverList)
        setItems(itemList)
        setFromOrder(notes[0] ?? null)
        // Nobody saved yet: the add form is the first thing to do.
        if (driverList.length === 0) setAdding(true)
      })
      .catch(() => setFailed(true))
  }, [invoice.id, invoice.quotation_id])

  const site = invoice.site ?? customer?.site ?? null
  const place = [site, customer?.address].filter(Boolean).join(', ')
  const message = [
    t('drv.msgTitle', { business: supplier?.business_name ?? '', no: invoice.invoice_no }),
    customer ? t('drv.msgCustomer', { name: customer.name }) : null,
    customer?.phone ? t('drv.msgPhone', { phone: customer.phone }) : null,
    site ? t('drv.msgSite', { site }) : null,
    customer?.address ? t('drv.msgAddress', { address: customer.address }) : null,
    '',
    t('drv.msgMaterials'),
    ...(items ?? []).map((it) =>
      `• ${Number(it.qty).toLocaleString('en-IN')} ${it.materials?.unit_label ?? ''} ${mt(it.description)}`.replace(/\s+/g, ' '),
    ),
    fromOrder?.note ? '' : null,
    fromOrder?.note ? t('drv.msgNote', { note: fromOrder.note }) : null,
    fromOrder?.delivery_date ? t('drv.msgWanted', { date: formatDate(fromOrder.delivery_date) }) : null,
    place ? '' : null,
    place ? t('drv.msgMap', { url: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(place)}` }) : null,
  ]
    .filter((line): line is string => line !== null)
    .join('\n')

  const ready = items !== null

  function send(phone: string | null) {
    if (!ready) return
    openWhatsAppShare(phone, message)
    onClose()
  }

  async function handleAdd(e: FormEvent) {
    e.preventDefault()
    if (saving) return
    if (!form.name.trim() || form.phone.length !== 10) {
      setFormError(t('drv.invalid'))
      return
    }
    setSaving(true)
    setFormError(null)
    try {
      const driver = await addDriver(form.name, form.phone)
      setDrivers((list) => [...(list ?? []), driver].sort((a, b) => a.name.localeCompare(b.name)))
      setForm({ name: '', phone: '' })
      setAdding(false)
    } catch (err) {
      const code = err instanceof Error ? err.message : ''
      setFormError(code === 'driver-exists' ? t('drv.exists') : code === 'driver-invalid' ? t('drv.invalid') : t('error.generic'))
    } finally {
      setSaving(false)
    }
  }

  async function handleRemove(id: string) {
    try {
      await removeDriver(id)
      setDrivers((list) => list?.filter((d) => d.id !== id) ?? null)
    } catch {
      setFailed(true)
    }
  }

  return (
    <Modal title={t('drv.title')} onClose={onClose}>
      <div className="flex flex-col gap-3">
        <p className="text-xs text-muted">{t('drv.hint', { no: invoice.invoice_no })}</p>
        {failed && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">{t('error.generic')}</p>}

        {drivers === null && !failed ? (
          <div className="flex justify-center py-4">
            <LoaderCircle size={20} className="animate-spin text-muted" />
          </div>
        ) : drivers && drivers.length > 0 ? (
          <div className="flex max-h-64 flex-col divide-y divide-border overflow-y-auto rounded-lg border border-border">
            {drivers.map((d) => (
              <div key={d.id} className="flex items-center gap-2 pr-1">
                <button
                  type="button"
                  onClick={() => send(d.phone)}
                  disabled={!ready}
                  className="flex min-w-0 flex-1 items-center gap-3 px-3 py-2.5 text-left disabled:opacity-60"
                >
                  <WhatsAppIcon size={18} className="shrink-0 text-[#25D366]" />
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium text-ink">{d.name}</span>
                    <span className="block text-xs text-muted">{d.phone}</span>
                  </span>
                </button>
                <button
                  type="button"
                  aria-label={t('drv.remove', { name: d.name })}
                  onClick={() => handleRemove(d.id)}
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-muted hover:bg-surface hover:text-red-600"
                >
                  <Trash2 size={15} />
                </button>
              </div>
            ))}
          </div>
        ) : drivers ? (
          <p className="text-sm text-muted">{t('drv.none')}</p>
        ) : null}

        {adding ? (
          <form onSubmit={handleAdd} className="flex flex-col gap-3 rounded-lg border border-border p-3">
            <div>
              <Label htmlFor="driver-name">{t('drv.name')}</Label>
              <Input id="driver-name" value={form.name} maxLength={40} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div>
              <Label htmlFor="driver-phone">{t('drv.phone')}</Label>
              <PhoneInput id="driver-phone" value={form.phone} onValueChange={(phone) => setForm({ ...form, phone })} />
            </div>
            {formError && <p className="text-sm text-red-600 dark:text-red-400">{formError}</p>}
            <div className="flex gap-2">
              <Button type="submit" size="sm" disabled={saving}>
                {saving ? t('common.saving') : t('drv.save')}
              </Button>
              {drivers && drivers.length > 0 && (
                <Button type="button" size="sm" variant="outline" onClick={() => setAdding(false)} disabled={saving}>
                  {t('ord.cancel')}
                </Button>
              )}
            </div>
          </form>
        ) : (
          <button type="button" onClick={() => setAdding(true)} className="self-start text-sm font-semibold text-accent">
            {t('drv.add')}
          </button>
        )}

        {/* A driver not saved here: WhatsApp opens with the message and they pick the chat. */}
        <button
          type="button"
          onClick={() => send(null)}
          disabled={!ready}
          className="self-start text-xs font-semibold text-muted hover:text-accent disabled:opacity-60"
        >
          {t('drv.other')}
        </button>
      </div>
    </Modal>
  )
}
