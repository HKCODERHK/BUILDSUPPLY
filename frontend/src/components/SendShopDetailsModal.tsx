import { useState } from 'react'
import { BookUser, Send } from 'lucide-react'
import { Modal } from '@/components/ui/modal'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { PhoneInput } from '@/components/ui/phone-input'
import { useLanguage } from '@/context/LanguageContext'
import { canPickContacts, pickContacts } from '@/lib/contacts'
import { openWhatsAppShare } from '@/lib/whatsapp'
import { messageMaterials, shopDetailsMessage, shopOrderLink } from '@/lib/shopDetails'
import { logActivity } from '@/services/activityLog'
import type { Material, Supplier } from '@/lib/database.types'

/**
 * The shop's details, order link and today's rates, to the number that just
 * rang (lib/shopDetails.ts writes the message).
 *
 * "Aaj cement ka rate kya hai?" mostly arrives as a phone call. A `wa.me`
 * link opens that one number's chat with the message filled in; the supplier
 * presses Send in WhatsApp.
 *
 * The app cannot know who called: no browser sees calls or the call log, and
 * Google Play grants the call log only to dialer and caller-ID apps, which
 * this is not. So the number is typed (the phone's keyboard offers one just
 * copied from the call log), or picked from the phone's contacts on Android.
 * Opened from the Dashboard card or the app icon's long-press shortcut.
 */
export function SendShopDetailsModal({
  supplier,
  materials,
  ready,
  onClose,
}: {
  supplier: Supplier
  materials: Material[]
  /** False while the Dashboard is still reading the materials. */
  ready: boolean
  onClose: () => void
}) {
  const { t, lang } = useLanguage()
  const [phone, setPhone] = useState('')
  const [error, setError] = useState<string | null>(null)
  const contactsAvailable = canPickContacts()

  const origin = window.location.origin
  const message = shopDetailsMessage(supplier, materials, { lang, origin })
  const hasOrderLink = shopOrderLink(supplier, origin) !== null

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
    void logActivity('supplier', 'shop_details_shared', {
      details: { items: messageMaterials(materials).length, order_link: hasOrderLink, format: 'whatsapp_text' },
    })
    onClose()
  }

  return (
    <Modal title={t('dash.sendDetails')} onClose={onClose}>
      <div className="flex flex-col gap-4">
        {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">{error}</p>}
        {/* Android's own picker; not offered where the phone has none. */}
        {contactsAvailable && (
          <Button type="button" variant="outline" onClick={fromContacts}>
            <BookUser size={16} /> {t('cust.pickContacts')}
          </Button>
        )}
        <div>
          <Label htmlFor="details-phone" required>{t('rates.number')}</Label>
          <PhoneInput
            id="details-phone"
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
          <div className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted">{t('shopMsg.preview')}</div>
          <pre className="vh-cap-40 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-surface p-3 text-xs text-ink">
            {message}
          </pre>
          {!hasOrderLink && <p className="mt-1.5 text-xs text-muted">{t('shopMsg.noOrderLink')}</p>}
        </div>
        <Button onClick={send} disabled={!ready} className="w-full">
          <Send size={16} /> {t('khata.whatsapp')}
        </Button>
      </div>
    </Modal>
  )
}
