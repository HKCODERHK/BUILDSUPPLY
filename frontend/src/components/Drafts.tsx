import { Link } from 'react-router-dom'
import { FilePen } from 'lucide-react'
import { Modal } from '@/components/ui/modal'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/context/AuthContext'
import { useLanguage } from '@/context/LanguageContext'
import type { TranslationKey } from '@/lib/i18n'
import { readDraft, type DraftKind, type SavedDraft } from '@/lib/drafts'

// The two places an unfinished bill or estimate is offered back — see
// lib/drafts.ts for how they are kept.

type T = ReturnType<typeof useLanguage>['t']

function formatINR(n: number) {
  return `₹${n.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`
}

/** "Ramesh · 3 items · ₹12,400" — enough to recognise it at a glance. */
function summarise(d: SavedDraft, t: T) {
  return [
    d.customerName || t('draft.noCustomer'),
    t(d.items.length === 1 ? 'draft.itemOne' : 'draft.itemMany', { count: d.items.length }),
    formatINR(d.total),
  ].join(' · ')
}

function when(savedAt: number) {
  const d = new Date(savedAt)
  return d.toDateString() === new Date().toDateString()
    ? d.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })
    : d.toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })
}

/**
 * Asked on opening New Invoice or New Quotation when an unfinished one is
 * waiting. A question rather than restoring silently: the supplier may have
 * come here to start a different bill for the customer in front of them.
 */
export function DraftPrompt({
  kind,
  draft,
  onContinue,
  onDiscard,
}: {
  kind: DraftKind
  draft: SavedDraft
  onContinue: () => void
  onDiscard: () => void
}) {
  const { t } = useLanguage()
  return (
    // Closing it any other way — the X, or the back gesture — continues. The
    // one thing this must never do by accident is throw the draft away.
    <Modal title={t(kind === 'invoice' ? 'draft.billTitle' : 'draft.estimateTitle')} onClose={onContinue}>
      <p className="text-sm font-semibold text-ink">{summarise(draft, t)}</p>
      <p className="mt-0.5 text-xs text-muted">{t('draft.savedAt', { when: when(draft.savedAt) })}</p>
      <p className="mt-3 mb-4 text-sm text-ink">{t('draft.ask')}</p>
      <div className="flex gap-2">
        <Button className="flex-1" onClick={onContinue}>
          {t('draft.continue')}
        </Button>
        <Button variant="outline" className="flex-1" onClick={onDiscard}>
          {t('draft.discard')}
        </Button>
      </div>
    </Modal>
  )
}

const DRAFT_LINKS: Record<DraftKind, { to: string; label: TranslationKey }> = {
  // ?draft=1 restores straight away: tapping this is already the answer to
  // "continue?", so the form does not ask a second time.
  invoice: { to: '/invoices/new?draft=1', label: 'draft.bannerBill' },
  quotation: { to: '/quotations/new?draft=1', label: 'draft.bannerEstimate' },
}

/**
 * On the dashboard, because that is where the app reopens after the phone
 * closed it — not on the bill the supplier was writing. Without this the
 * draft would sit there until they happened to tap Bill again.
 */
export function DraftBanners() {
  const { supplier } = useAuth()
  const { t } = useLanguage()
  if (!supplier) return null

  const drafts = (['invoice', 'quotation'] as const)
    .map((kind) => ({ kind, draft: readDraft(supplier.id, kind) }))
    .filter((x): x is { kind: DraftKind; draft: SavedDraft } => x.draft !== null)
  if (drafts.length === 0) return null

  return (
    <div className="mb-4 flex flex-col gap-2">
      {drafts.map(({ kind, draft }) => (
        <Link
          key={kind}
          to={DRAFT_LINKS[kind].to}
          className="flex items-center justify-between gap-3 rounded-xl border border-accent/30 bg-accent-bg px-4 py-3"
        >
          <div className="flex min-w-0 items-center gap-2.5">
            <FilePen size={18} className="shrink-0 text-accent-text" />
            <div className="min-w-0">
              <div className="text-sm font-semibold text-ink">{t(DRAFT_LINKS[kind].label)}</div>
              <div className="truncate text-xs text-muted">{summarise(draft, t)}</div>
            </div>
          </div>
          <span className="shrink-0 text-xs font-semibold text-accent-text">{t('draft.continueArrow')}</span>
        </Link>
      ))}
    </div>
  )
}
