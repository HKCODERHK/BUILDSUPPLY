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
