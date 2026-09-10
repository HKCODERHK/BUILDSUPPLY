/**
 * Sends a PDF to a customer on WhatsApp as a real document. Every
 * customer-facing WhatsApp button goes through here — bills, estimates,
 * statements, receipts and the rate list — so they can never drift apart.
 *
 * The file goes from memory straight into the phone's share sheet: the
 * supplier picks WhatsApp, picks the customer, and presses Send. Nothing is
 * uploaded, nothing is saved to Downloads, and there is no link.
 *
 * Why the supplier has to pick the customer: a web app cannot open a
 * particular WhatsApp chat and attach a file in the same step. wa.me opens
 * the right chat but carries only text, and the share sheet carries the file
 * but has no way to name a recipient. Only a native app can do both — see
 * CLAUDE.md, Phase 8.
 */

export type ShareOutcome = 'shared' | 'cancelled' | 'unsupported'

/** A share that needs the supplier to finish it — see ShareDocumentPrompt. */
export interface PendingShare {
  /** 'ready': the tap expired, so a fresh one is needed. 'unsupported': no share sheet here. */
  kind: 'ready' | 'unsupported'
  title: string
  /** Opens the share sheet. Must be called straight from a tap. */
  share: () => Promise<ShareOutcome>
  finish: (outcome: ShareOutcome) => void
}

let presenter: ((pending: PendingShare) => void) | null = null

/** Set by ShareDocumentPrompt, which AppShell mounts once. */
export function setSharePresenter(fn: ((pending: PendingShare) => void) | null) {
  presenter = fn
}

async function openShareSheet(data: ShareData): Promise<ShareOutcome | 'needs-tap'> {
  try {
    await navigator.share(data)
    return 'shared'
  } catch (err) {
    const name = (err as Error).name
    // The supplier closed the share sheet — not a failure, and nothing to log.
    if (name === 'AbortError') return 'cancelled'
    // The tap that started this has expired.
    if (name === 'NotAllowedError') return 'needs-tap'
    return 'unsupported'
  }
}

// Resolves only once the supplier has finished with the prompt, so a caller's
// "Preparing…" and its activity log cover the whole share either way.
function askSupplier(kind: PendingShare['kind'], title: string, data: ShareData): Promise<ShareOutcome> {
  const show = presenter
  if (!show) return Promise.resolve(kind === 'ready' ? 'cancelled' : 'unsupported')
  return new Promise((resolve) => {
    show({
      kind,
      title,
      share: async () => {
        const outcome = await openShareSheet(data)
        return outcome === 'needs-tap' ? 'unsupported' : outcome
      },
      finish: resolve,
    })
  })
}

export async function shareDocumentOnWhatsApp(opts: { file: File; message: string; title: string }): Promise<ShareOutcome> {
  const data: ShareData = { files: [opts.file], text: opts.message, title: opts.title }

  // Mostly desktop browsers. Never fall back to downloading the file or to a
  // text-only message — the customer must get the PDF itself — so say so.
  if (!navigator.canShare?.({ files: [opts.file] })) return askSupplier('unsupported', opts.title, data)

  // A tap only lets a page open the share sheet for a few seconds. Building
  // the PDF — and on the list screens fetching the bill first — can outlast
  // that on a budget phone, and the share would then fail without a word.
  const activation = (navigator as Navigator & { userActivation?: { isActive: boolean } }).userActivation
  if (activation && !activation.isActive) return askSupplier('ready', opts.title, data)

  const outcome = await openShareSheet(data)
  return outcome === 'needs-tap' ? askSupplier('ready', opts.title, data) : outcome
}
