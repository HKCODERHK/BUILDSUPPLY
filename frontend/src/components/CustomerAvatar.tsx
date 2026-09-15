import { cn } from '@/lib/utils'
import { shade } from '@/lib/tint'
import { colourFor, initialsOf } from '@/lib/initials'

// A coloured circle with the customer's initials, the way Telegram marks each
// contact. The colour comes from the customer's id (lib/initials), so it never
// changes and a supplier learns to spot a regular by colour before reading the
// name.
export function CustomerAvatar({
  id,
  name,
  size = 40,
  className,
}: {
  /** The customer's id — what keeps the colour the same everywhere. */
  id: string
  name: string
  size?: number
  className?: string
}) {
  const colour = colourFor(id)
  // Shaded like the icon tiles — lighter at the top-left, a thin light edge
  // along the top — so the circles look finished rather than flat.
  return (
    <span
      aria-hidden="true"
      className={cn('inline-flex shrink-0 select-none items-center justify-center rounded-full font-semibold text-white', className)}
      style={{
        width: size,
        height: size,
        fontSize: Math.round(size * 0.36),
        letterSpacing: '0.02em',
        backgroundImage: `linear-gradient(145deg, ${shade(colour, 0.22)} 0%, ${colour} 60%, ${shade(colour, -0.1)} 100%)`,
        boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.22)',
        textShadow: '0 1px 1px rgba(0, 0, 0, 0.18)',
      }}
    >
      {initialsOf(name)}
    </span>
  )
}
