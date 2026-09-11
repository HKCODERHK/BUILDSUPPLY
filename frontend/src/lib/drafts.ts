import { useEffect, useRef } from 'react'
import type { PaymentMode } from '@/lib/database.types'

/**
 * Unfinished bills and estimates, kept on the phone.
 *
 * Android closes apps in the background to free memory — often, on the budget
 * phones suppliers carry, and especially after switching to the camera or a
 * WhatsApp call. When it does, everything held only in the page is gone, so a
 * supplier who went to check an order came back to an empty bill. The forms
 * keep a copy here as they are typed into, and offer it back when the app
 * reopens.
 *
 * - On the phone only (localStorage). Nothing goes to the server.
 * - Keyed by supplier, so a shared phone never shows one supplier's draft to
 *   another.
 * - New bills and estimates only. Editing a saved bill has its own baseline,
 *   and the saved bill itself to fall back on.
 * - Cleared on save, on Discard, and when the supplier chooses Leave on the
 *   unsaved-work prompt — work they chose to abandon is not offered back.
 * - Ignored after three days: a half-bill that old was abandoned, not
 *   interrupted.
 */

export type DraftKind = 'invoice' | 'quotation'

export interface DraftItem {
  material_id: string | null
  description: string
  qty: number
  rate: number
}

export interface BillDraft {
  customerId: string
  /** So the prompt and the dashboard can say what this is without loading customers. */
  customerName: string
  site: string
  items: DraftItem[]
  gstApplicable: boolean
  transportLabour: string
  total: number
  /** Bills only — an estimate never takes payment. */
  paidNow?: string
  paidMode?: PaymentMode
  // The rarer "paid partly by another mode" rows, after the first. Absent
  // from drafts saved before they existed, which restore with none.
  paidSplits?: { amount: string; mode: PaymentMode }[]
}

export interface SavedDraft extends BillDraft {
  savedAt: number
}

const VERSION = 1
const MAX_AGE_MS = 3 * 24 * 60 * 60 * 1000

function key(supplierId: string, kind: DraftKind) {
  return `buildsupply-draft:${kind}:${supplierId}`
}

// Every storage call is guarded: some privacy modes throw on access, and a
// draft is a convenience — it must never be the reason a bill can't be made.
export function readDraft(supplierId: string, kind: DraftKind): SavedDraft | null {
  try {
    const raw = localStorage.getItem(key(supplierId, kind))
    if (!raw) return null
    const d = JSON.parse(raw) as SavedDraft & { v?: number }
    if (d?.v !== VERSION || !Array.isArray(d.items) || d.items.length === 0) return null
    if (!(Date.now() - d.savedAt < MAX_AGE_MS)) return null
    return d
  } catch {
    return null
  }
}

export function writeDraft(supplierId: string, kind: DraftKind, draft: BillDraft) {
  try {
    localStorage.setItem(key(supplierId, kind), JSON.stringify({ ...draft, v: VERSION, savedAt: Date.now() }))
  } catch {
    // Storage full or blocked: the form still works, it just isn't backed up.
  }
}

export function clearDraft(supplierId: string, kind: DraftKind) {
  try {
    localStorage.removeItem(key(supplierId, kind))
  } catch {
    // Nothing stored, or storage blocked — either way nothing to remove.
  }
}

/**
 * Keeps the stored draft in step with the form: written a moment after each
 * change, removed when the form has nothing worth keeping, and written at once
 * when the app goes into the background — the moment Android is most likely to
 * close it, and possibly before the debounce would have fired.
 *
 * `enabled` is false until the form has loaded, in edit mode, and while an
 * older draft is waiting on Continue or Discard, so an untouched form can
 * never overwrite the draft the supplier is being offered.
 */
export function useDraftAutosave(
  supplierId: string | undefined,
  kind: DraftKind,
  draft: BillDraft | null,
  enabled: boolean,
) {
  const json = draft ? JSON.stringify(draft) : ''

  useEffect(() => {
    if (!enabled || !supplierId) return
    if (!json) {
      clearDraft(supplierId, kind)
      return
    }
    const timer = window.setTimeout(() => writeDraft(supplierId, kind, JSON.parse(json) as BillDraft), 400)
    return () => window.clearTimeout(timer)
  }, [json, enabled, supplierId, kind])

  // Read by the background handler below, which is registered once and so
  // cannot close over each render's values.
  const latest = useRef({ json, enabled })
  useEffect(() => {
    latest.current = { json, enabled }
  })

  useEffect(() => {
    if (!supplierId) return
    const id = supplierId
    function flush() {
      const { json: current, enabled: on } = latest.current
      if (on && current) writeDraft(id, kind, JSON.parse(current) as BillDraft)
    }
    function onVisibility() {
      if (document.visibilityState === 'hidden') flush()
    }
    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('pagehide', flush)
    return () => {
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('pagehide', flush)
    }
  }, [supplierId, kind])
}
