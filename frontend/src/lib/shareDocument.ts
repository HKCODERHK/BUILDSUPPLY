import { openWhatsAppShare } from './whatsapp'
import { downloadFile } from './downloadFile'

export type ShareOutcome = 'shared' | 'cancelled' | 'fallback'

/**
 * Sends a PDF to a customer over WhatsApp, the only free way there is.
 *
 * The device's native share sheet is the good path: WhatsApp shows up as a
 * target and the file goes across as a real attachment. It only exists on
 * mobile Chrome/Safari and a few desktop browsers, so everywhere else the
 * file is downloaded and wa.me is opened with the message ready — the
 * supplier attaches the downloaded file by hand.
 *
 * Every document in the app shares through here so the behaviour, and the
 * fallback, can never drift between an invoice, a statement and a rate list.
 */
export async function shareDocumentOnWhatsApp(opts: {
  file: File
  message: string
  title: string
  phone?: string | null
}): Promise<ShareOutcome> {
  if (navigator.canShare?.({ files: [opts.file] })) {
    try {
      await navigator.share({ files: [opts.file], text: opts.message, title: opts.title })
      return 'shared'
    } catch (err) {
      // The supplier backed out of the share sheet — that's not a failure,
      // and falling back would dump an unwanted file in their downloads.
      if ((err as Error).name === 'AbortError') return 'cancelled'
    }
  }
  downloadFile(opts.file)
  openWhatsAppShare(opts.phone, opts.message)
  return 'fallback'
}
