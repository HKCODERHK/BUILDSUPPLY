import { openWhatsAppShare } from './whatsapp'

/**
 * The order link goes out as text: through the phone's share sheet where there
 * is one, otherwise WhatsApp with the message ready. The supplier picks the
 * chat and presses Send. Used by the Orders screen and Settings → Online orders.
 */
export async function shareOrderLinkText(message: string) {
  if (typeof navigator.share === 'function') {
    try {
      await navigator.share({ text: message })
      return
    } catch (err) {
      if ((err as Error).name === 'AbortError') return
    }
  }
  openWhatsAppShare(null, message)
}
