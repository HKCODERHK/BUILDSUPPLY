import type { LucideIcon } from 'lucide-react'
import { shade, withAlpha } from '@/lib/tint'

/**
 * A white icon on a small coloured tile — Telegram's settings rows. Used by
 * the Settings list and the phone's More sheet, so a supplier finds a place
 * by its colour as much as by its word.
 *
 * Not a flat square: the colour shades gently from lighter at the top-left,
 * a thin light edge runs along the top, and a soft shadow in the tile's own
 * colour lifts it off the page — the finish of a modern phone's own icons.
 * The corner radius grows with the tile, so small and large ones match.
 */
export function IconTile({ icon: Icon, colour, size = 34 }: { icon: LucideIcon; colour: string; size?: number }) {
  return (
    <span
      aria-hidden="true"
      className="inline-flex shrink-0 items-center justify-center text-white"
      style={{
        width: size,
        height: size,
        borderRadius: Math.round(size * 0.3),
        backgroundImage: `linear-gradient(145deg, ${shade(colour, 0.2)} 0%, ${colour} 55%, ${shade(colour, -0.12)} 100%)`,
        boxShadow: `inset 0 1px 0 rgba(255, 255, 255, 0.28), 0 1px 2px ${withAlpha(colour, 0.3)}, 0 4px 10px -4px ${withAlpha(colour, 0.55)}`,
      }}
    >
      <Icon size={Math.round(size * 0.52)} strokeWidth={2.2} />
    </span>
  )
}
