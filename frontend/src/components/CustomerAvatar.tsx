import { cn } from '@/lib/utils'

// A coloured circle with the customer's initials, the way Telegram marks each
// contact. The colour comes from the customer's id, so it never changes and a
// supplier learns to spot a regular by colour before reading the name. Dark
// enough behind white letters in both themes.
const COLORS = ['#D14D4D', '#D2702A', '#2E9150', '#1F8C8C', '#2F76C0', '#7A5BC7', '#C24D8C', '#8A6D1E']

/** "Suresh Patil" → "SP", "Ramesh" → "R", "सुरेश पाटील" → "सप". */
function customerInitials(name: string) {
  const words = name.trim().split(/\s+/).filter(Boolean)
  if (words.length === 0) return '?'
  // Array.from, not [0]: a character outside the basic plane is two code
  // units, and slicing one off would leave half a letter.
  const first = (w: string) => Array.from(w)[0] ?? ''
  const letters = words.length > 1 ? first(words[0]) + first(words[words.length - 1]) : first(words[0])
  return letters.toUpperCase()
}

function colourFor(key: string) {
  let hash = 0
  for (let i = 0; i < key.length; i++) hash = (hash * 31 + key.charCodeAt(i)) | 0
  return COLORS[Math.abs(hash) % COLORS.length]
}

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
  return (
    <span
      aria-hidden="true"
      className={cn('inline-flex shrink-0 select-none items-center justify-center rounded-full font-semibold text-white', className)}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.36), backgroundColor: colourFor(id) }}
    >
      {customerInitials(name)}
    </span>
  )
}
