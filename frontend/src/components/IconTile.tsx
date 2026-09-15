import type { LucideIcon } from 'lucide-react'

/**
 * A white icon on a small coloured square — Telegram's settings rows. Used by
 * the Settings list and the phone's More sheet, so a supplier finds a place
 * by its colour as much as by its word.
 */
export function IconTile({ icon: Icon, colour, size = 32 }: { icon: LucideIcon; colour: string; size?: number }) {
  return (
    <span
      aria-hidden="true"
      className="inline-flex shrink-0 items-center justify-center rounded-lg text-white"
      style={{ width: size, height: size, backgroundColor: colour }}
    >
      <Icon size={Math.round(size * 0.55)} />
    </span>
  )
}
