import { Link } from 'react-router-dom'
import { Check, ChevronRight } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { useLanguage } from '@/context/LanguageContext'
import type { Supplier } from '@/lib/database.types'
import type { TranslationKey } from '@/lib/i18n'

/**
 * What a supplier sees on the dashboard until their first bill exists — in
 * place of the quick-action row and six figures that would all read ₹0.
 *
 * Every step ticks itself off from real data; there is nothing to mark done.
 * The card stops rendering for good once a bill exists, which is why the last
 * step is never drawn ticked. "Skip for now" only hides it until the app is
 * next opened — the dashboard owns that, see `skipped` there.
 *
 * The order is a recommendation, not a lock. Materials come first because a
 * bill made before them has to be typed item by item, but every step stays
 * tappable — a supplier with a customer standing in front of them should be
 * able to go straight to "Add a customer".
 */

interface Step {
  title: TranslationKey
  hint: TranslationKey
  action: TranslationKey
  to: string
  done: boolean
}

// "logo, address and GST number" — commas, then the language's own "and"
// before the last one. Works for Hindi and Marathi as well as English.
function joinList(items: string[], and: string) {
  if (items.length < 2) return items.join('')
  return `${items.slice(0, -1).join(', ')} ${and} ${items[items.length - 1]}`
}

export function StartHereCard({
  hasMaterials,
  hasCustomers,
  supplier,
  onSkip,
}: {
  hasMaterials: boolean
  hasCustomers: boolean
  supplier: Supplier | null
  onSkip: () => void
}) {
  const { t } = useLanguage()

  const steps: Step[] = [
    { title: 'start.materialsTitle', hint: 'start.materialsHint', action: 'mat.catalog', to: '/materials?view=catalog', done: hasMaterials },
    { title: 'start.customerTitle', hint: 'start.customerHint', action: 'cust.add', to: '/customers?new=1', done: hasCustomers },
    { title: 'start.billTitle', hint: 'start.billHint', action: 'inv.new', to: '/invoices/new', done: false },
  ]
  const doneCount = steps.filter((s) => s.done).length
  const current = steps.findIndex((s) => !s.done)

  // Only the supplier can set these — the admin's Add Supplier form takes a
  // phone and address but both are optional, and it has no GST or logo field
  // at all. All four print on the letterhead of every bill, so whatever is
  // blank here is blank on the first bill that goes to a customer.
  const missing = [
    !supplier?.logo_url && t('start.itemLogo'),
    !supplier?.address?.trim() && t('start.itemAddress'),
    !supplier?.phone?.trim() && t('start.itemPhone'),
    !supplier?.gst_number?.trim() && t('start.itemGst'),
  ].filter((item): item is string => Boolean(item))

  return (
    <Card>
      <div className="flex items-center justify-between gap-3">
        <div className="text-xs font-semibold tracking-wide text-accent-text">{t('start.label')}</div>
        <div className="text-xs font-medium text-muted">
          {t('start.progress', { done: doneCount, total: steps.length })}
        </div>
      </div>
      <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-surface">
        <div
          className="h-full rounded-full bg-accent transition-[width] duration-500"
          style={{ width: `${(doneCount / steps.length) * 100}%` }}
        />
      </div>

      <ol className="mt-4 flex flex-col gap-1.5">
        {steps.map((s, i) => {
          if (s.done) {
            return (
              <li key={s.title} className="flex items-center gap-3 px-3 py-2">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent text-white">
                  <Check size={15} strokeWidth={3} />
                </span>
                <span className="text-sm font-medium text-muted">{t(s.title)}</span>
              </li>
            )
          }

          if (i === current) {
            // The one thing to do next: tinted, with a real button rather than
            // a row to tap, so there is no doubt where the thumb goes.
            return (
              <li key={s.title} className="flex gap-3 rounded-xl bg-accent-bg p-3">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 border-accent text-xs font-bold text-accent-text">
                  {i + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-semibold text-ink">{t(s.title)}</div>
                  <p className="mt-0.5 text-xs text-muted">{t(s.hint)}</p>
                  <Link to={s.to} className="mt-3 inline-block">
                    <Button size="sm">{t(s.action)}</Button>
                  </Link>
                </div>
              </li>
            )
          }

          return (
            <li key={s.title}>
              <Link to={s.to} className="flex items-center gap-3 rounded-xl px-3 py-2.5 hover:bg-surface">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-border text-xs font-semibold text-muted">
                  {i + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium text-ink">{t(s.title)}</div>
                  <p className="mt-0.5 text-xs text-muted">{t(s.hint)}</p>
                </div>
                <ChevronRight size={16} className="shrink-0 text-muted-2" />
              </Link>
            </li>
          )
        })}
      </ol>

      {missing.length > 0 && (
        <Link
          to="/settings"
          className="mt-4 flex items-center justify-between gap-3 border-t border-border pt-4 text-sm"
        >
          <span className="text-muted">{t('start.letterhead', { items: joinList(missing, t('start.and')) })}</span>
          <span className="shrink-0 text-xs font-semibold text-accent-text">{t('nav.settings')} →</span>
        </Link>
      )}

      {/* Last, small and muted: available to the supplier who has a customer
          waiting and just wants the ordinary dashboard, without pulling the
          eye away from step one for everyone else. Centred on its own row
          rather than beside Settings, where two links would sit stacked at
          the right edge. */}
      <div className="mt-2 -mb-2 flex justify-center">
        <button type="button" onClick={onSkip} className="px-4 py-2.5 text-xs font-medium text-muted hover:text-ink">
          {t('start.skip')}
        </button>
      </div>
    </Card>
  )
}
