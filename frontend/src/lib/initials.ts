// The initials-circle rules, shared by CustomerAvatar on screen and the order
// QR image (a business with no logo gets its initials there too), so both
// always pick the same letters and colour.

// Dark enough behind white letters in both themes.
const COLORS = ['#D14D4D', '#D2702A', '#2E9150', '#1F8C8C', '#2F76C0', '#7A5BC7', '#C24D8C', '#8A6D1E']

/** "Suresh Patil" → "SP", "Ramesh" → "R", "सुरेश पाटील" → "सप". */
export function initialsOf(name: string) {
  const words = name.trim().split(/\s+/).filter(Boolean)
  if (words.length === 0) return '?'
  // Array.from, not [0]: a character outside the basic plane is two code
  // units, and slicing one off would leave half a letter.
  const first = (w: string) => Array.from(w)[0] ?? ''
  const letters = words.length > 1 ? first(words[0]) + first(words[words.length - 1]) : first(words[0])
  return letters.toUpperCase()
}

/** A colour picked from the id, so it never changes for the same customer. */
export function colourFor(key: string) {
  let hash = 0
  for (let i = 0; i < key.length; i++) hash = (hash * 31 + key.charCodeAt(i)) | 0
  return COLORS[Math.abs(hash) % COLORS.length]
}
