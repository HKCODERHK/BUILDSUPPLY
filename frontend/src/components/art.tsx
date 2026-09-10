import { INK, edge } from '@/lib/artPalette'

/**
 * The BuildSupply drawing kit. New shapes belong here, not redrawn inside a
 * component where the next copy will drift from this one.
 */

/**
 * The tipper from the splash, in its own 130×56 space: wrap it in
 * `<svg viewBox="0 0 130 56">` or a `<g transform>`. Faces right, bed raised
 * at the rear.
 *
 * Every part carries a dark edge and a lighter top face — that is what gives
 * the signboard vehicles it was drawn from their cut-from-metal look, and it
 * is also what keeps the shape legible over a busy background.
 */
export function Tipper() {
  return (
    <>
      {/* tipper bed, raised at the rear */}
      <path d="M4 34 L14 8 L64 8 L64 34 Z" fill="#2E8F52" stroke="#0C2B22" strokeWidth="2.4" strokeLinejoin="round" />
      <path d="M14 8 L64 8 L64 15 L11 15 Z" fill="#57C983" />
      {/* chassis */}
      <rect x="6" y="34" width="76" height="9" rx="2.5" fill="#17542F" stroke="#0C2B22" strokeWidth="2.2" />
      {/* cab */}
      <path d="M82 43 L82 16 L99 16 L110 30 L110 43 Z" fill="#43C275" stroke="#0C2B22" strokeWidth="2.4" strokeLinejoin="round" />
      <path d="M94 20 L100 20 L106 29 L94 29 Z" fill="#0A2427" opacity=".55" />
      <rect x="105" y="34" width="5" height="5" rx="1.4" fill="#FFD27A" />
      {/* wheels */}
      <circle cx="26" cy="45" r="10" fill="#0E2528" stroke="#061B1C" strokeWidth="2" />
      <circle cx="48" cy="45" r="10" fill="#0E2528" stroke="#061B1C" strokeWidth="2" />
      <circle cx="95" cy="45" r="10" fill="#0E2528" stroke="#061B1C" strokeWidth="2" />
      <circle cx="26" cy="45" r="4" fill="#5FE08C" />
      <circle cx="48" cy="45" r="4" fill="#5FE08C" />
      <circle cx="95" cy="45" r="4" fill="#5FE08C" />
    </>
  )
}

/**
 * A cement bag. Fully rounded — rx of half the height — so it reads as a
 * filled sack rather than a brick, with the pale printed stripe every bag
 * carries. Pale, because a dark band across the middle reads as a slot cut
 * through it. The stripe scales with the bag, so the empty state's 48×28 and
 * a scene's 34×20 are the same bag.
 */
export function Bag({ x, y, fill, w = 48, h = 28 }: { x: number; y: number; fill: string; w?: number; h?: number }) {
  const inset = (w * 9) / 48
  const band = h / 4
  return (
    <>
      <rect x={x} y={y} width={w} height={h} rx={h / 2} fill={fill} {...edge} />
      <rect x={x + inset} y={y + h / 2 - band / 2} width={w - inset * 2} height={band} rx={band / 2} fill={INK.paper} opacity=".45" />
    </>
  )
}

/** A brick, 14×8 — terracotta, because a green brick is not a brick. */
export function Brick({ x, y }: { x: number; y: number }) {
  return <rect x={x} y={y} width="14" height="8" rx="1.5" fill={INK.brick} stroke={INK.line} strokeWidth="1.6" />
}

/** One storey of a building going up, in its own 70×26 space: a slab with two
 *  window openings. Stack them to raise a building a floor at a time. */
export function Storey() {
  return (
    <>
      <rect x="1.2" y="1.2" width="67.6" height="23.6" rx="1.5" fill={INK.paper} {...edge} />
      <rect x="9" y="7" width="16" height="12" rx="1" fill={INK.line} opacity=".75" />
      <rect x="45" y="7" width="16" height="12" rx="1" fill={INK.line} opacity=".75" />
      <path d="M35 1.2v23.6" stroke={INK.line} strokeWidth="1.6" opacity=".35" />
    </>
  )
}

/** A tower crane in its own 60×112 space, in construction yellow — the lamp
 *  colour. The mast stands on the bottom edge; the jib reaches left. */
export function Crane() {
  return (
    <>
      <rect x="44" y="8" width="7" height="102" fill={INK.lamp} stroke={INK.line} strokeWidth="1.8" />
      <path d="M44 22l7 9M44 40l7 9M44 58l7 9M44 76l7 9M44 94l7 9" stroke={INK.line} strokeWidth="1.3" opacity=".55" />
      <rect x="2" y="6" width="56" height="6" rx="1" fill={INK.lamp} stroke={INK.line} strokeWidth="1.8" />
      <rect x="50" y="12" width="9" height="8" rx="1.5" fill={INK.body} stroke={INK.line} strokeWidth="1.6" />
      <path d="M12 12v20" stroke={INK.line} strokeWidth="1.4" />
      <rect x="8" y="32" width="8" height="5" rx="1" fill={INK.line} />
    </>
  )
}

/** A bill in its own 48×62 space: folded corner, a green heading, three lines
 *  and the total. */
export function BillSheet() {
  return (
    <>
      <path d="M5 1.2h28l13.8 13.8v42a4 4 0 0 1-4 4H5a4 4 0 0 1-4-4V5.2a4 4 0 0 1 4-4Z" fill={INK.paper} {...edge} />
      <path d="M33 1.2v10a4 4 0 0 0 4 4h9.8Z" fill={INK.lit} opacity=".6" />
      <rect x="8" y="12" width="18" height="5" rx="2.5" fill={INK.body} />
      <rect x="8" y="24" width="30" height="4" rx="2" fill={INK.line} opacity=".22" />
      <rect x="8" y="33" width="24" height="4" rx="2" fill={INK.line} opacity=".16" />
      <rect x="8" y="42" width="28" height="4" rx="2" fill={INK.line} opacity=".16" />
      <rect x="24" y="50" width="16" height="6" rx="3" fill={INK.cab} stroke={INK.line} strokeWidth="1.5" />
    </>
  )
}

/** A green tick in a circle, 28×28 — settled, done. */
export function TickBadge() {
  return (
    <>
      <circle cx="14" cy="14" r="12.5" fill={INK.body} {...edge} />
      <path d="m8.5 14.5 3.8 3.8 7.2-8" fill="none" stroke={INK.paper} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
    </>
  )
}

/** A gold ₹ coin, 26×26. The ₹ is strokes, not a text node — lucide's own
 *  indian-rupee geometry — so it never depends on the phone's font. */
export function RupeeCoin() {
  return (
    <>
      <circle cx="13" cy="13" r="11.8" fill={INK.lamp} {...edge} />
      <circle cx="13" cy="13" r="8" fill="none" stroke={INK.line} strokeWidth="1.2" opacity=".25" />
      <g
        transform="translate(13 13) scale(0.62) translate(-12 -12)"
        stroke={INK.line}
        strokeWidth="3"
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
    </>
  )
}
