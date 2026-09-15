// Building-trade doodles — bricks, a tipper, a house, a cement bag — tiled
// faintly behind the order QR, the way Telegram tiles its doodles behind
// yours. Kept as SVG path data so the screen (a CSS background) and the shared
// image (canvas Path2D) draw the very same tile.

export const PATTERN_TILE = 120

export const PATTERN_PATHS = [
  'M10 12h26v14H10z M10 19h26 M23 12v7 M16 19v7 M30 19v7', // bricks
  'M56 22h22v12H56z M78 26h7l5 5v3H78z', // tipper: body and cab
  'M14 98V82l13-10 13 10v16z M23 98v-8h8v8', // house
  'M72 74h18l3 24H69z M75 83h12', // cement bag
]

/** [x, y, radius]: the tipper's wheels and a few dots between the doodles. */
export const PATTERN_CIRCLES: [number, number, number][] = [
  [62, 37, 3],
  [84, 37, 3],
  [104, 58, 2],
  [46, 60, 2],
  [104, 108, 2],
]

/** The green behind it all, darker towards the bottom. */
export const PATTERN_GREEN = ['#36A862', '#1F7A45', '#145C33'] as const

/** The tile as a CSS background image. */
export function patternCssUrl(stroke = 'rgba(255,255,255,0.14)') {
  const shapes =
    PATTERN_PATHS.map((d) => `<path d='${d}'/>`).join('') +
    PATTERN_CIRCLES.map(([x, y, r]) => `<circle cx='${x}' cy='${y}' r='${r}'/>`).join('')
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='${PATTERN_TILE}' height='${PATTERN_TILE}' fill='none' stroke='${stroke}' stroke-width='2' stroke-linejoin='round' stroke-linecap='round'>${shapes}</svg>`
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`
}
