import { useState } from 'react'
import { Lock } from 'lucide-react'
import { Card, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Modal } from '@/components/ui/modal'
import { useAuth } from '@/context/AuthContext'
import { useLanguage } from '@/context/LanguageContext'
import type { Invoice, Supplier } from '@/lib/database.types'
import { PRINT_CHOICES, billIssuer, lockedChoices, printedSupplier, type PrintChoice, type PrintOptions } from '@/lib/billPrint'
import { saveBillDefaults, setInvoicePrintOptions } from '@/services/shopPage'

// What prints on bills (migration 043): the shop's defaults in Settings, and
// one bill's own choice from its page. Both use the rule in lib/billPrint.ts.

type Details = Pick<Supplier, 'business_name' | 'address' | 'phone' | 'gst_number' | 'logo_url'>

/** The top of the bill as it will print: the FROM block of the PDF. */
export function BillHeaderPreview({ details }: { details: Details }) {
  const { t } = useLanguage()
  return (
    <div>
      <div className="mb-1.5 text-xs font-medium text-muted">{t('bp.preview')}</div>
      <div className="flex items-center gap-3 rounded-xl border border-dashed border-border bg-surface p-3">
        {details.logo_url && <img src={details.logo_url} alt="" className="h-11 w-11 shrink-0 rounded-lg border border-border bg-white object-cover" />}
        <div className="min-w-0">
          <div className="break-words text-sm font-bold text-ink">{details.business_name}</div>
          {details.address && <div className="break-words text-xs text-muted">{details.address}</div>}
          {details.gst_number && <div className="text-xs text-muted">GST: {details.gst_number}</div>}
          {details.phone && <div className="text-xs text-muted">{details.phone}</div>}
        </div>
      </div>
    </div>
  )
}

/** The four switches. A locked one shows ticked and cannot be turned off. */
function Choices({ value, onChange, locked }: { value: PrintOptions; onChange: (v: PrintOptions) => void; locked: Set<PrintChoice> }) {
  const { t } = useLanguage()
  return (
    <div className="flex flex-col divide-y divide-border rounded-xl border border-border">
      {PRINT_CHOICES.map((c) => {
        const isLocked = locked.has(c)
        const on = isLocked || value[c] !== false
        return (
          <label key={c} className="flex items-center gap-3 px-3 py-2.5 text-sm text-ink">
            <input
              type="checkbox"
              checked={on}
              disabled={isLocked}
              onChange={(e) => onChange({ ...value, [c]: e.target.checked })}
            />
            <span className="flex-1">{t(`bp.${c}`)}</span>
            {isLocked && (
              <span className="flex items-center gap-1 text-[11px] text-muted">
                <Lock size={12} /> {t('bp.locked')}
              </span>
            )}
          </label>
        )
      })}
    </div>
  )
}

/** Settings → Business profile: what prints on new bills. */
export function BillPrintCard() {
  const { supplier, refreshSupplier } = useAuth()
  const { t } = useLanguage()
  const [value, setValue] = useState<PrintOptions>(supplier?.bill_print ?? {})
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [failed, setFailed] = useState(false)
  if (!supplier || supplier.role !== 'supplier' || !('bill_print' in supplier)) return null
  const me = supplier

  async function save() {
    if (saving) return
    setSaving(true)
    setSaved(false)
    setFailed(false)
    try {
      // Everything on is the same as no choice at all.
      const off = Object.fromEntries(Object.entries(value).filter(([, v]) => v === false))
      await saveBillDefaults(me.id, Object.keys(off).length ? off : null)
      await refreshSupplier()
      setSaved(true)
    } catch {
      setFailed(true)
    } finally {
      setSaving(false)
    }
  }

  const preview: Details = {
    business_name: me.business_name,
    address: value.address === false ? null : me.address,
    gst_number: value.gstin === false ? null : me.gst_number,
    phone: value.phone === false ? null : me.phone,
    logo_url: value.logo === false ? null : me.logo_url,
  }
  return (
    <Card className="mt-4 max-w-lg">
      <CardHeader>
        <CardTitle>{t('bp.title')}</CardTitle>
      </CardHeader>
      <p className="-mt-2 mb-3 text-xs text-muted">{t('bp.hint')}</p>
      <Choices
        value={value}
        onChange={(v) => {
          setValue(v)
          setSaved(false)
        }}
        locked={new Set()}
      />
      <p className="mt-2 text-xs text-muted">{t('bp.lockNote')}</p>
      <p className="mt-1 text-xs text-muted">{t('bp.caNote')}</p>
      <div className="mt-4">
        <BillHeaderPreview details={preview} />
      </div>
      {failed && <p className="mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">{t('error.generic')}</p>}
      <div className="mt-4 flex items-center gap-3">
        <Button onClick={save} disabled={saving}>
          {saving ? t('common.saving') : t('bp.save')}
        </Button>
        {saved && <span className="text-xs text-accent">{t('set.saved')}</span>}
      </div>
    </Card>
  )
}

/** A bill's own "Print options", from its page. */
export function PrintOptionsModal({
  supplier,
  invoice,
  onClose,
  onSaved,
}: {
  supplier: Supplier
  invoice: Invoice
  onClose: () => void
  onSaved: (options: PrintOptions | null) => void
}) {
  const { t } = useLanguage()
  const issuer = billIssuer(supplier, invoice)
  const locked = lockedChoices(invoice, issuer)
  const [value, setValue] = useState<PrintOptions>(invoice.print_options ?? issuer.print ?? {})
  const [saving, setSaving] = useState(false)
  const [failed, setFailed] = useState(false)

  async function save(options: PrintOptions | null) {
    if (saving) return
    setSaving(true)
    setFailed(false)
    try {
      await setInvoicePrintOptions(invoice.id, options)
      onSaved(options)
      onClose()
    } catch {
      setFailed(true)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal title={t('bp.menu')} onClose={onClose}>
      <div className="flex flex-col gap-3">
        <p className="text-xs text-muted">{t('bp.thisBill')}</p>
        {!invoice.issuer && <p className="rounded-lg bg-surface p-2.5 text-xs text-muted">{t('bp.oldBill')}</p>}
        <Choices value={value} onChange={setValue} locked={locked} />
        {locked.size > 0 && <p className="text-xs text-muted">{t('bp.caNote')}</p>}
        <BillHeaderPreview details={printedSupplier(supplier, invoice, value)} />
        {failed && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">{t('error.generic')}</p>}
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => save(value)} disabled={saving}>
            {saving ? t('common.saving') : t('bp.save')}
          </Button>
          {invoice.print_options && (
            <Button variant="outline" onClick={() => save(null)} disabled={saving}>
              {t('bp.useDefaults')}
            </Button>
          )}
        </div>
      </div>
    </Modal>
  )
}
