import type { ReactNode } from 'react'
import { Card } from '@/components/ui/card'
import { Bag } from '@/components/art'
import { INK, edge } from '@/lib/artPalette'

/**
 * The screen a supplier sees before they have any data — and, on Reminders,
 * when there is happily nothing to chase.
 *
 * Two rules this component exists to hold:
 *
 * 1. **"Nothing yet" is not "nothing matched".** A brand-new supplier with no
 *    bills needs a picture and a button; someone who mistyped a search needs a
 *    quiet line of text and their search box back. Callers use this component
 *    for the first and a plain <p> for the second, which is why every caller
 *    branches on the *unfiltered* length.
 * 2. **One drawing language.** Every illustration below uses the same flat
 *    palette, the same 2.4px dark outline and the same dark-teal tile as the
 *    tipper on the splash screen, so the app looks like one thing rather than
 *    six clip-art choices. Add art here, in that style — don't reach for an
 *    icon set or a stock image.
 */

// The tile is deliberately the same dark teal in both themes. The artwork was
// drawn for the splash, where it sits on --color-shell, and a dark outline is
// what separates one green panel from the next — on a dark card that outline
// would disappear and the shapes would go muddy. A fixed tile costs nothing
// and keeps light and dark identical.
const TILE = 'radial-gradient(120% 100% at 50% 0%, #17434A 0%, #0D2B2F 72%)'

// From the shared palette, so these drawings, the splash tipper and the
// Start-here scenes cannot drift apart.
const { line: LINE, body: BODY, lit: LIT, cab: CAB, dark: DARK, glow: GLOW, lamp: LAMP, paper: PAPER } = INK

/** A khata: the ledger a supplier keeps a customer's account in. */
function ArtCustomers() {
  return (
    <>
      <rect x="24" y="12" width="74" height="72" rx="6" fill={BODY} {...edge} />
      {/* Spine, drawn over the cover's left edge so the book reads as closed
          rather than as a plain green card. */}
      <path d="M24 18a6 6 0 0 1 6-6h9v72h-9a6 6 0 0 1-6-6Z" fill={DARK} {...edge} />
      <rect x="49" y="30" width="34" height="6" rx="3" fill={LIT} />
      <rect x="49" y="45" width="38" height="5" rx="2.5" fill={PAPER} opacity=".5" />
      <rect x="49" y="57" width="24" height="5" rx="2.5" fill={PAPER} opacity=".5" />
      {/* Bookmark — the one warm colour, and what says "in use" rather than
          "blank notebook". */}
      <path d="M76 12h12v26l-6-5-6 5Z" fill={LAMP} stroke={LINE} strokeWidth="2.2" strokeLinejoin="round" />
    </>
  )
}

/** A bill, torn off a book — the serrated foot is what distinguishes it from
 *  the estimate's clipboard at this size. */
function ArtInvoices() {
  return (
    <>
      <path
        d="M30 10h60v62l-7.5 6-7.5-6-7.5 6-7.5-6-7.5 6-7.5-6-7.5 6-7.5-6Z"
        fill={PAPER}
        {...edge}
      />
      <path d="M30 16a6 6 0 0 1 6-6h48a6 6 0 0 1 6 6v14H30Z" fill={BODY} {...edge} />
      <rect x="40" y="40" width="26" height="5" rx="2.5" fill={LINE} opacity=".3" />
      <rect x="40" y="51" width="40" height="5" rx="2.5" fill={LINE} opacity=".18" />
      {/* The total: the one line on a bill anybody actually looks at. */}
      <rect x="40" y="63" width="16" height="5" rx="2.5" fill={LINE} opacity=".18" />
      <rect x="62" y="61" width="20" height="9" rx="4.5" fill={CAB} stroke={LINE} strokeWidth="2" />
    </>
  )
}

/** A clipboard, matching the Quotations nav glyph. */
function ArtQuotations() {
  return (
    <>
      <rect x="26" y="16" width="68" height="70" rx="8" fill={BODY} {...edge} />
      <rect x="35" y="27" width="50" height="50" rx="4" fill={PAPER} stroke={LINE} strokeWidth="2.2" />
      <rect x="47" y="7" width="26" height="15" rx="5" fill={LIT} {...edge} />
      <rect x="43" y="38" width="34" height="5" rx="2.5" fill={LINE} opacity=".28" />
      <rect x="43" y="50" width="26" height="5" rx="2.5" fill={LINE} opacity=".18" />
      <rect x="43" y="62" width="18" height="5" rx="2.5" fill={LINE} opacity=".18" />
    </>
  )
}

/** A note. Landscape and round-cornered so it never reads as another sheet of
 *  paper next to the bill and the estimate. */
function ArtPayments() {
  return (
    <>
      <rect x="12" y="25" width="96" height="48" rx="8" fill={BODY} {...edge} />
      <rect x="20" y="32" width="80" height="34" rx="5" fill="none" stroke={LIT} strokeWidth="1.8" opacity=".65" />
      <circle cx="60" cy="49" r="15" fill={DARK} stroke={LINE} strokeWidth="2.2" />
      {/* ₹ as strokes, not an SVG <text> node. A text node inside decorative
          artwork lands in the page's text layer — it showed up as a stray "₹"
          floating above "No payments yet" when the screen's text was read
          back — and it would depend on the device's font carrying the glyph.
          Geometry is lucide-react's own indian-rupee, on its 24×24 grid,
          recentred on the coin. */}
      <g
        transform="translate(60 49) scale(1.05) translate(-12 -12)"
        stroke={GLOW}
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      >
        <path d="M6 3h12" />
        <path d="M6 8h12" />
        <path d="m6 13 8.5 8" />
        <path d="M6 13h3" />
        <path d="M9 13c6.667 0 6.667-10 0-10" />
      </g>
      <circle cx="26" cy="49" r="4" fill={LIT} />
      <circle cx="94" cy="49" r="4" fill={LIT} />
    </>
  )
}

/** Cement bags — the most recognisable thing in any of these godowns. The
 *  bag itself is shared, in components/art.tsx. */
function ArtMaterials() {
  return (
    <>
      {/* Stacked and touching — a gap between the rows would read as three
          bags floating rather than a pile in a godown. */}
      <Bag x={10} y={44} fill={BODY} />
      <Bag x={62} y={44} fill={BODY} />
      <Bag x={36} y={16} fill={CAB} />
      <path d="M10 78h100" stroke={GLOW} strokeWidth="2.4" strokeLinecap="round" opacity=".35" />
    </>
  )
}

/** Nothing pending. The one empty state that is good news, so it gets a tick
 *  instead of an object and no button — there is nothing to do. */
function ArtAllClear() {
  return (
    <>
      <circle cx="60" cy="48" r="31" fill={DARK} {...edge} />
      <circle cx="60" cy="48" r="31" fill="none" stroke={GLOW} strokeWidth="2.4" opacity=".45" />
      <path
        d="m45 49 11 11 20-23"
        fill="none"
        stroke={GLOW}
        strokeWidth="7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </>
  )
}

const ART = {
  customers: ArtCustomers,
  invoices: ArtInvoices,
  quotations: ArtQuotations,
  payments: ArtPayments,
  materials: ArtMaterials,
  allClear: ArtAllClear,
} as const

export type EmptyArt = keyof typeof ART

export function EmptyState({
  art,
  title,
  hint,
  action,
}: {
  art: EmptyArt
  title: string
  /** One line on what the screen is for. Optional — Reminders needs none. */
  hint?: string
  /** The button that fills the screen. Omit where there is nothing to do. */
  action?: ReactNode
}) {
  const Art = ART[art]
  return (
    <Card className="flex flex-col items-center px-6 py-10 text-center sm:py-14">
      <div
        className="flex h-28 w-28 shrink-0 items-center justify-center rounded-[28px]"
        style={{ background: TILE }}
      >
        <svg viewBox="0 0 120 96" className="w-[86px]" fill="none" aria-hidden>
          <Art />
        </svg>
      </div>
      <h3 className="mt-6 text-base font-semibold text-ink">{title}</h3>
      {/* max-w keeps the hint to two comfortable lines on a phone rather than
          one long one that runs the full width of a desktop card. */}
      {hint && <p className="mt-1.5 max-w-[19rem] text-sm text-muted">{hint}</p>}
      {action && <div className="mt-6 flex flex-wrap items-center justify-center gap-2">{action}</div>}
    </Card>
  )
}
