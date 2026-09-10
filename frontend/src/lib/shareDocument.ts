import { supabase } from './supabase'
import { normalizeWhatsAppNumber, openWhatsAppShare } from './whatsapp'
import { downloadFile } from './downloadFile'

/**
 * 'link'      — uploaded, and the customer's own chat opened with a link to it
 * 'shared'    — sent as a real file through the phone's share sheet
 * 'cancelled' — the supplier backed out of the share sheet; log nothing
 * 'fallback'  — downloaded, and WhatsApp opened for it to be attached by hand
 */
export type ShareOutcome = 'link' | 'shared' | 'cancelled' | 'fallback'

/** How an outcome is written to the activity log. */
export function shareFormat(outcome: ShareOutcome) {
  return outcome === 'link' ? 'pdf_link' : outcome === 'shared' ? 'pdf_share' : 'text_fallback'
}

const BUCKET = 'documents'

/**
 * Puts the PDF where the customer can open it, and returns the link.
 *
 * The link is on the app's own domain — vercel.json (and _redirects, and
 * Vite's proxy in development) pass /d/ straight through to the bucket — so
 * the chat shows buildsupplyin.vercel.app rather than a storage hostname the
 * customer has never heard of.
 *
 * The random segment is what keeps it private. The bucket is public so the
 * customer needs no account, and nothing can list it (migration 024), so a
 * document is only reachable by someone who was sent its link.
 */
async function uploadDocument(file: File): Promise<string> {
  // The stored session, not a network call. The folder has to be the
  // signed-in user's own id: that is what the storage policy checks.
  const { data } = await supabase.auth.getSession()
  const userId = data.session?.user.id
  if (!userId) throw new Error('Not signed in')

  const token = crypto.randomUUID().replace(/-/g, '')
  const name = file.name.replace(/[^A-Za-z0-9._-]+/g, '-')
  const path = `${userId}/${token}/${name}`
  const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
    contentType: 'application/pdf',
    // A path is never reused, so what is behind it never changes.
    cacheControl: '31536000',
  })
  if (error) throw error
  return `${window.location.origin}/d/${path}`
}

/**
 * Sends a PDF to a customer over WhatsApp. Every document in the app goes
 * through here, so a bill, an estimate, a statement, a receipt and a rate
 * list can never drift apart in how they are sent.
 *
 * With a phone number, the PDF is uploaded and the customer's own chat opens
 * with the message and a link to it — one tap to send, no hunting for the
 * contact. A free web app cannot open a particular chat AND attach a file:
 * the share sheet attaches but always asks who to send to, and a wa.me link
 * reaches the right chat but carries only text. So the PDF travels as a link.
 *
 * With no number (the rate list, which goes to anyone), or when the upload
 * fails, the file itself goes through the share sheet — or, where there is
 * none, is downloaded and WhatsApp opened to attach it. Either way the
 * customer still gets a PDF.
 */
export async function shareDocumentOnWhatsApp(opts: {
  file: File
  message: string
  title: string
  phone?: string | null
  /** What the link is introduced as in the message, e.g. "Bill (PDF)". */
  linkLabel?: string
}): Promise<ShareOutcome> {
  if (normalizeWhatsAppNumber(opts.phone)) {
    try {
      const link = await uploadDocument(opts.file)
      openWhatsAppShare(opts.phone, `${opts.message}\n\n${opts.linkLabel ?? 'PDF'}: ${link}`)
      return 'link'
    } catch {
      // Almost always no signal. Sending the file itself still works then —
      // WhatsApp queues it — so fall through rather than fail.
    }
  }

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
