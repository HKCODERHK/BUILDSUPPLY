// The BuildSupply drawing palette. Every illustration in the app draws from
// these values — the splash tipper, the six empty states, the Start-here
// scenes — so they read as one set rather than clip art from different
// places. The brief, from the user: flat 2D vector in dark teal and green,
// no photographs or generated scenery, and the same truck everywhere.
// Shapes that use it live in components/art.tsx.

export const INK = {
  line: '#0C2B22',
  body: '#2E8F52',
  lit: '#57C983',
  cab: '#43C275',
  dark: '#17542F',
  glow: '#5FE08C',
  lamp: '#FFD27A',
  paper: '#EAF4EE',
  // The one warm colour besides the lamp, and only for bricks: a green brick
  // is not a brick.
  brick: '#D9794A',
} as const

/** The outline every shape carries — what makes separate drawings a set. */
export const edge = { stroke: INK.line, strokeWidth: 2.4, strokeLinejoin: 'round' } as const
