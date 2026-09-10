// Every phone in this app is Indian — prices are in ₹, customer numbers are
// validated at exactly 10 digits, and the whole product is sold to suppliers
// in India — so a bare 10-digit number is missing nothing but the 91.
const COUNTRY_CODE = '91'

// wa.me wants a full international number with no `+`, no separators and no
// leading zero. Suppliers type numbers every which way — "09575011204",
// "+91 95750 11204", "95750-11204" — and WhatsApp answers anything it can't
// resolve with "phone number shared via url is invalid", which looks to the
// supplier like the Send button is broken. Not one phone number in the live
// database carries a country code, so this has to add it.
export function normalizeWhatsAppNumber(phone: string | null | undefined): string {
  // Leading zeros are India's STD trunk prefix and are never part of the
  // international number; 0091... correctly falls through to 91... here.
  const digits = (phone ?? '').replace(/[^0-9]/g, '').replace(/^0+/, '')
  if (digits.length === 10) return COUNTRY_CODE + digits
  // Long enough to already carry a country code — pass it through rather than
  // guessing, so an overseas number isn't mangled into an Indian one.
  if (digits.length >= 11 && digits.length <= 15) return digits
  return ''
}

// Set by WhatsAppReadyPrompt, which AppShell mounts once.
let askForTap: ((url: string) => void) | null = null

/**
 * A tap only lets a page open a window for a few seconds. Making a PDF and
 * uploading it on slow 4G can take longer than that, and the browser then
 * blocks WhatsApp from opening without a word — the supplier taps Send and
 * nothing happens. Once that permission has run out the link goes to this
 * handler instead, which shows a button: a fresh tap, allowed to open it.
 */
export function setWhatsAppTapHandler(handler: ((url: string) => void) | null) {
  askForTap = handler
}

// Opens WhatsApp with a pre-filled message. No Business API, no automated
// sending — the user still has to hit "send" inside WhatsApp themselves.
export function openWhatsAppShare(phone: string | null | undefined, message: string) {
  // An empty target is deliberate: WhatsApp then opens with the message ready
  // and lets the user pick the contact, which is the right fallback when we
  // have no number on file.
  const target = normalizeWhatsAppNumber(phone)
  const url = `https://wa.me/${target}?text=${encodeURIComponent(message)}`
  // Browsers without userActivation keep the old behaviour.
  const activation = (navigator as Navigator & { userActivation?: { isActive: boolean } }).userActivation
  if (askForTap && activation && !activation.isActive) {
    askForTap(url)
    return
  }
  window.open(url, '_blank', 'noopener,noreferrer')
}
