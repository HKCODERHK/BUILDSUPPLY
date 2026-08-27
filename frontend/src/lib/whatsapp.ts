// Opens WhatsApp with a pre-filled message. No Business API, no automated
// sending — the user still has to hit "send" inside WhatsApp themselves.
export function openWhatsAppShare(phone: string | null | undefined, message: string) {
  const digits = (phone ?? '').replace(/[^0-9]/g, '')
  const target = digits.length >= 10 ? digits : ''
  const url = `https://wa.me/${target}?text=${encodeURIComponent(message)}`
  window.open(url, '_blank', 'noopener,noreferrer')
}
