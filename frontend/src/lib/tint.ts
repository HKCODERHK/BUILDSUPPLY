// Small colour helpers for the icon tiles and initials circles, which shade
// one #rrggbb colour into a gradient and a matching shadow.

function channels(hex: string) {
  const n = parseInt(hex.slice(1), 16)
  return [n >> 16, (n >> 8) & 255, n & 255]
}

/** The colour mixed towards white (amount > 0) or black (amount < 0). */
export function shade(hex: string, amount: number) {
  const target = amount > 0 ? 255 : 0
  const a = Math.abs(amount)
  const [r, g, b] = channels(hex).map((v) => Math.round(v + (target - v) * a))
  return `rgb(${r}, ${g}, ${b})`
}

/** The colour at the given opacity — for a shadow in the tile's own colour. */
export function withAlpha(hex: string, alpha: number) {
  const [r, g, b] = channels(hex)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}
