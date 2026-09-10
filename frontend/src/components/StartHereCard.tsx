import { Link } from 'react-router-dom'
import { Check, ChevronRight } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { useLanguage } from '@/context/LanguageContext'
import type { Supplier } from '@/lib/database.types'
import type { TranslationKey } from '@/lib/i18n'
import { Bag, Tipper } from '@/components/art'
import { INK, edge } from '@/lib/artPalette'

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

// ── The picture across the top ─────────────────────────────────────────
// One scene per step: always the splash tipper on the left, with what the
// step is about beside it — its load for materials, a shop and a customer for
// the customer, the finished bill for the bill. It follows the step the
// supplier is on, so it changes as they go. Drawn from the shared kit rather
// than as a picture, which keeps it crisp at any size, lets it follow the
// theme, and costs nothing to download.

/** A faint town behind everything, for depth. The accent token, so it
 *  follows the theme; at this opacity it reads as distance, not detail. */
function Backdrop() {
  return (
    <g className="fill-accent" opacity=".1">
      <rect x="146" y="44" width="20" height="60" rx="2" />
      <rect x="170" y="30" width="16" height="74" rx="2" />
      <rect x="252" y="40" width="18" height="64" rx="2" />
      <rect x="274" y="54" width="22" height="50" rx="2" />
      <circle cx="12" cy="80" r="18" />
      <circle cx="306" cy="84" r="16" />
    </g>
  )
}

function Brick({ x, y }: { x: number; y: number }) {
  return <rect x={x} y={y} width="14" height="8" rx="1.5" fill={INK.brick} stroke={INK.line} strokeWidth="1.6" />
}

const BRICKS = [
  [220, 96], [234, 96], [248, 96],
  [227, 88], [241, 88],
  [234, 80],
] as const

/** Step 1 — the load: cement bags, a stack of bricks, and a pin for where it
 *  is going. */
function MaterialsScene() {
  return (
    <>
      <Bag x={138} y={84} w={34} h={20} fill={INK.body} />
      <Bag x={174} y={84} w={34} h={20} fill={INK.body} />
      <Bag x={156} y={64} w={34} h={20} fill={INK.cab} />
      {BRICKS.map(([x, y]) => (
        <Brick key={`${x}-${y}`} x={x} y={y} />
      ))}
      <path d="M241 77c-8-9-12-15-12-21a12 12 0 0 1 24 0c0 6-4 12-12 21Z" fill={INK.body} {...edge} />
      <circle cx="241" cy="56" r="4.5" fill={INK.paper} />
    </>
  )
}

/** Step 2 — a shop front and the customer, ticked off. */
function CustomerScene() {
  return (
    <>
      <rect x="154" y="62" width="78" height="42" fill={INK.paper} {...edge} />
      <rect x="150" y="44" width="86" height="16" rx="3" fill={INK.body} {...edge} />
      <rect x="160" y="50" width="40" height="4" rx="2" fill={INK.paper} opacity=".7" />
      {/* striped awning */}
      <rect x="150" y="60" width="86" height="10" fill={INK.cab} {...edge} />
      {[1, 3, 5, 7].map((i) => (
        <rect key={i} x={150 + i * 10.75} y="61.2" width="10.75" height="7.6" fill={INK.paper} />
      ))}
      <rect x="162" y="76" width="28" height="18" rx="2" fill={INK.lit} fillOpacity=".55" stroke={INK.line} strokeWidth="2" />
      <path d="M176 76v18M162 85h28" stroke={INK.line} strokeWidth="1.6" opacity=".5" />
      <rect x="200" y="76" width="22" height="28" rx="2" fill={INK.dark} {...edge} />
      <circle cx="217" cy="91" r="1.6" fill={INK.lamp} />
      {/* the customer */}
      <circle cx="274" cy="66" r="20" fill={INK.paper} {...edge} />
      <circle cx="274" cy="60" r="6.5" fill={INK.body} />
      <path d="M262 81a12 11 0 0 1 24 0Z" fill={INK.body} />
      <circle cx="289" cy="50" r="8.5" fill={INK.body} stroke={INK.line} strokeWidth="2" />
      <path d="m285 50 3 3 5-6" fill="none" stroke={INK.paper} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </>
  )
}

/** Step 3 — the finished bill, with the tick. */
function BillScene() {
  return (
    <g transform="translate(-12 0)">
      <path d="M186 22h36l16 16v60a4 4 0 0 1-4 4h-48a4 4 0 0 1-4-4V26a4 4 0 0 1 4-4Z" fill={INK.paper} {...edge} />
      <path d="M222 22v12a4 4 0 0 0 4 4h12Z" fill={INK.lit} opacity=".6" />
      <path d="M222 22v12a4 4 0 0 0 4 4h12" fill="none" stroke={INK.line} strokeWidth="2.4" strokeLinejoin="round" />
      <rect x="192" y="34" width="22" height="6" rx="3" fill={INK.body} />
      <rect x="192" y="50" width="36" height="5" rx="2.5" fill={INK.line} opacity=".22" />
      <rect x="192" y="62" width="28" height="5" rx="2.5" fill={INK.line} opacity=".16" />
      <rect x="192" y="74" width="34" height="5" rx="2.5" fill={INK.line} opacity=".16" />
      <rect x="192" y="86" width="20" height="7" rx="3.5" fill={INK.cab} stroke={INK.line} strokeWidth="1.8" />
      <circle cx="240" cy="88" r="15" fill={INK.body} {...edge} />
      <path d="m232.5 88 5.5 5.5 10-11" fill="none" stroke={INK.paper} strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
    </g>
  )
}

const SCENES = [MaterialsScene, CustomerScene, BillScene] as const

function StepScene({ step }: { step: number }) {
  const Scene = SCENES[step] ?? MaterialsScene
  return (
    <>
      <Backdrop />
      {/* speed lines — it is on its way */}
      <path d="M3 68h10M7 78h8M1 88h12" stroke={INK.lit} strokeWidth="2.4" strokeLinecap="round" opacity=".7" />
      {/* Scaled so its wheels sit exactly on the bottom edge: 50.8 + 56 × 0.95 = 104. */}
      <g transform="translate(18 50.8) scale(0.95)">
        <Tipper />
      </g>
      <Scene />
    </>
  )
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
    // overflow-hidden so the Card's own rounded corners clip the picture.
    <Card className="overflow-hidden">
      {/* Full-bleed across the top: the negative margins undo the Card's
          padding. Fixed height with xMidYMax, so on a wide desktop card the
          scene stays its drawn size in the middle rather than growing to fill
          the width — the sky and the road strip still run edge to edge. */}
      <div
        className="-mx-5 -mt-5 mb-5 sm:-mx-6 sm:-mt-6"
        style={{
          background:
            'linear-gradient(180deg, var(--color-accent-bg) 0%, color-mix(in oklab, var(--color-accent-bg) 35%, var(--color-card)) 100%)',
        }}
      >
        <svg viewBox="0 0 320 104" preserveAspectRatio="xMidYMax meet" className="block h-[104px] w-full" aria-hidden>
          <StepScene step={current} />
        </svg>
        <div className="h-1.5" style={{ background: INK.dark }} />
      </div>
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
