import type { ReactNode } from 'react'
import { INK, edge } from '@/lib/artPalette'
import { materialArtKey, type MaterialArtKey } from '@/lib/materialArt'
import { cn } from '@/lib/utils'

/**
 * A material's picture on the customer pages: the shop's or catalog's photo
 * when there is one, otherwise a drawing in the app's own style (the
 * splash's palette and outline) — a few hundred bytes, sharp at any size,
 * the same frame and background for every material, so a list of them reads
 * as one set. `lib/materialArt.ts` decides which drawing.
 */
export function MaterialPicture({
  name,
  category,
  photo,
  className,
}: {
  name: string
  category?: string | null
  photo?: string | null
  className?: string
}) {
  if (photo) {
    return <img src={photo} alt="" loading="lazy" decoding="async" className={cn('aspect-[4/3] w-full rounded-xl bg-surface object-cover', className)} />
  }
  return <MaterialDrawing kind={materialArtKey(name, category)} className={className} />
}

export function MaterialDrawing({ kind, className }: { kind: MaterialArtKey; className?: string }) {
  return (
    <svg viewBox="0 0 120 90" role="img" aria-hidden="true" className={cn('aspect-[4/3] w-full rounded-xl', className)}>
      {/* The same backdrop for every material: pale paper and a ground line. */}
      <rect width="120" height="90" fill={INK.paper} />
      <circle cx="96" cy="20" r="26" fill="#ffffff" opacity=".55" />
      <path d="M8 74h104" stroke={INK.line} strokeWidth="2" strokeLinecap="round" opacity=".18" />
      {DRAWINGS[kind]}
    </svg>
  )
}

const SAND = '#E2BA6C'
const SAND_DARK = '#C99B47'
const STONE = '#9AA7AA'
const STONE_DARK = '#7A888B'
const STEEL = '#5E6E79'
const PIPE = '#DCE4E7'

const DRAWINGS: Record<MaterialArtKey, ReactNode> = {
  // Three green bags, two stacked behind one in front — the splash's own bag.
  cement: (
    <g>
      <rect x="22" y="38" width="44" height="22" rx="11" fill={INK.dark} {...edge} />
      <rect x="54" y="38" width="44" height="22" rx="11" fill={INK.dark} {...edge} />
      <rect x="36" y="50" width="48" height="26" rx="13" fill={INK.body} {...edge} />
      <rect x="45" y="60" width="30" height="6" rx="3" fill={INK.paper} opacity=".5" />
    </g>
  ),
  // A mound of sand, with a few grains drawn as dots.
  sand: (
    <g>
      <path d="M14 74c10-22 26-36 46-36s36 14 46 36Z" fill={SAND} {...edge} />
      <path d="M40 50c8-5 15-7 22-7" stroke="#ffffff" strokeWidth="2.4" strokeLinecap="round" opacity=".5" fill="none" />
      {[
        [34, 64],
        [48, 58],
        [62, 66],
        [74, 56],
        [86, 66],
        [56, 52],
      ].map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r="1.6" fill={SAND_DARK} />
      ))}
    </g>
  ),
  // A heap of crushed stone — angular pieces, two greys.
  aggregate: (
    <g>
      <path d="M18 74l8-12 9 3 6-11 10 4 7-9 9 6 8-4 7 9 9 1 6 13Z" fill={STONE} {...edge} />
      <path d="M38 64l7-5 6 6-5 6Z" fill={STONE_DARK} stroke={INK.line} strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M62 58l8-3 4 7-7 4Z" fill={STONE_DARK} stroke={INK.line} strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M78 66l6-4 6 5-6 5Z" fill={STONE_DARK} stroke={INK.line} strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M50 70l5-3 4 4-5 3Z" fill="#B7C2C4" stroke={INK.line} strokeWidth="1.4" strokeLinejoin="round" />
    </g>
  ),
  // A bundle of TMT bars, ribbed, tied in the middle.
  steel: (
    <g>
      {[44, 51, 58, 65].map((y, i) => (
        <g key={y} transform={`translate(${i % 2 ? 4 : 0} 0)`}>
          <rect x="14" y={y} width="88" height="5.5" rx="2.75" fill={STEEL} stroke={INK.line} strokeWidth="1.6" />
          {[24, 34, 44, 54, 64, 74, 84, 94].map((x) => (
            <path key={x} d={`M${x} ${y + 0.8}l-2 4`} stroke="#ffffff" strokeWidth="1.1" opacity=".45" />
          ))}
        </g>
      ))}
      <rect x="54" y="40" width="9" height="34" rx="2" fill={INK.lamp} stroke={INK.line} strokeWidth="1.8" />
    </g>
  ),
  // A stack of bricks in running bond — the one warm colour, as on the splash.
  bricks: (
    <g>
      {[0, 1, 2].map((row) =>
        [0, 1, 2].map((col) => (
          <rect
            key={`${row}-${col}`}
            x={(row % 2 ? 31 : 22) + col * 26}
            y={60 - row * 12}
            width="24"
            height="11"
            rx="1.8"
            fill={INK.brick}
            stroke={INK.line}
            strokeWidth="1.8"
          />
        )),
      )}
    </g>
  ),
  // Two pipes lying side by side, their open ends towards us.
  pipe: (
    <g>
      <rect x="20" y="52" width="70" height="16" rx="3" fill={PIPE} {...edge} />
      <ellipse cx="90" cy="60" rx="7" ry="8" fill="#ffffff" {...edge} />
      <ellipse cx="90" cy="60" rx="3.5" ry="4.5" fill={INK.line} opacity=".7" />
      <rect x="28" y="36" width="64" height="14" rx="3" fill={PIPE} {...edge} />
      <ellipse cx="92" cy="43" rx="6" ry="7" fill="#ffffff" {...edge} />
      <ellipse cx="92" cy="43" rx="3" ry="4" fill={INK.line} opacity=".7" />
      <path d="M30 60h52" stroke={INK.line} strokeWidth="1.4" opacity=".2" />
    </g>
  ),
  // Anything else: a plain crate.
  other: (
    <g>
      <rect x="34" y="36" width="52" height="38" rx="3" fill={INK.lit} {...edge} />
      <path d="M34 50h52M60 36v38" stroke={INK.line} strokeWidth="2" opacity=".55" />
      <rect x="52" y="31" width="16" height="8" rx="2" fill={INK.body} stroke={INK.line} strokeWidth="1.8" />
    </g>
  ),
}
