import { useState } from 'react'
import { BookUser, Send } from 'lucide-react'
import { Modal } from '@/components/ui/modal'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { PhoneInput } from '@/components/ui/phone-input'
import { useLanguage } from '@/context/LanguageContext'
import { canPickContacts, pickContacts } from '@/lib/contacts'
import { openWhatsAppShare } from '@/lib/whatsapp'
import { rateListMaterials } from '@/lib/rateList'
import { logActivity } from '@/services/activityLog'
import type { Material, Supplier } from '@/lib/database.types'

function formatINR(n: number) {
  return `₹${Number(n).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`
}

/**
 * Today's rates, to the number that just rang.
 *
 * "Aaj cement ka rate kya hai?" mostly arrives as a phone call, and the
 * answer gets typed out by hand afterwards. Materials & Stock already sends
 * the rate list as a PDF on the supplier's letterhead, but that goes through
 * the phone's share sheet, where the supplier has to find the customer. A
 * `wa.me` link can open one particular number — it just cannot carry a file —
 * so this sends the same list as a message, straight to the number the
 * supplier types in while the call is still in their head.
 *
 * The app cannot know who called: no browser reads the call log, and Google
 * Play only grants that to dialer and caller-ID apps, which this is not. So
 * the number is typed, or picked from the phone's own contacts on Android.
 */
export function SendRatesModal({
  supplier,
  materials,
  onClose,
}: {
  supplier: Supplier
  materials: Material[]
  onClose: () => void
}) {
  const { t } = useLanguage()
  const [phone, setPhone] = useState('')
  const [error, setError] = useState<string | null>(null)
  const contactsAvailable = canPickContacts()

  const list = rateListMaterials(materials)
  const today = new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
  // The message follows the app's language, as every WhatsApp message in this
  // app does — the PDFs are the ones that stay English (see CLAUDE.md).
  const message = [
    supplier.business_name,
    t('rates.msgHeader', { date: today }),
    '',
    ...list.map((m) => `${m.name} — ${formatINR(m.rate)}${m.per_label ? ` ${m.per_label}` : ''}`),
    '',
    t('rates.msgFooter'),
  ].join('\n')

  async function fromContacts() {
    const picked = await pickContacts(false)
    const digits = picked[0]?.phone
    if (digits) {
      setPhone(digits)
      setError(null)
    }
  }

  function send() {
    if (phone.length !== 10) {
      setError(t('order.phoneInvalid'))
      return
    }
    openWhatsAppShare(phone, message)
    void logActivity('supplier', 'rate_list_shared', {
      details: { items: list.length, format: 'whatsapp_text' },
    })
    onClose()
  }

  return (
    <Modal title={t('dash.sendRates')} onClose={onClose}>
      <div className="flex flex-col gap-4">
        {list.length === 0 ? (
          <p className="text-sm text-muted">{t('mat.rateListEmpty')}</p>
        ) : (
          <>
            {error && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">{error}</p>}
            {/* Android's own picker; not offered where the phone has none. */}
            {contactsAvailable && (
              <Button type="button" variant="outline" onClick={fromContacts}>
                <BookUser size={16} /> {t('cust.pickContacts')}
              </Button>
            )}
            <div>
              <Label htmlFor="rates-phone" required>{t('rates.number')}</Label>
              <PhoneInput
                id="rates-phone"
                autoFocus
                value={phone}
                onValueChange={(digits) => {
                  setPhone(digits)
                  setError(null)
                }}
              />
            </div>
            {/* What will actually be sent, so nothing is a surprise on the
                customer's phone. Capped by dvh, not vh — an iPhone's address
                bar (see index.css vh-cap). */}
            <div>
              <div className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted">
                {t('rates.preview', { count: list.length })}
              </div>
              <pre className="vh-cap-40 overflow-auto whitespace-pre-wrap rounded-lg bg-surface p-3 text-xs text-ink">
                {message}
              </pre>
            </div>
            <Button onClick={send} className="w-full">
              <Send size={16} /> {t('khata.whatsapp')}
            </Button>
          </>
        )}
      </div>
    </Modal>
  )
}
