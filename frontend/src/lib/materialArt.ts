// Which drawing a material shows when it has no photo (2026-10-12). One
// place decides, so the same material looks the same on every screen.
//
// Order of preference, everywhere: the shop's own photo → the catalog's photo
// (both come from shop_profile's `photos`) → the drawing matched here →
// a plain crate. Matching reads the material's own name first, then its
// category, because a category such as "Sand & Aggregates" covers two kinds.

export type MaterialArtKey = 'cement' | 'sand' | 'aggregate' | 'steel' | 'bricks' | 'pipe' | 'other'

// Checked in this order. Steel comes before aggregate on purpose: in Indian
// yards "metal" means crushed stone (the catalog's "Metal / Gitti"), so
// aggregate must not be decided by "metal" before steel has had its chance,
// and steel must not match "metal" at all.
const RULES: [MaterialArtKey, RegExp][] = [
  ['steel', /\b(tmt|steel|sariya|saria|rebar|rods?|fe ?\d{3})\b/i],
  ['cement', /\b(cement|opc|ppc|psc)\b/i],
  ['pipe', /\b(pipes?|pvc|cpvc|upvc|conduit)\b/i],
  ['bricks', /\b(bricks?|blocks?|eent|aac)\b/i],
  ['sand', /\b(sand|reti|m-?sand|plaster sand)\b/i],
  ['aggregate', /\b(gitti|aggregates?|metal|kapchi|jelly|grit|stone chips?|\d{2} ?mm)\b/i],
]

export function materialArtKey(name: string | null | undefined, category?: string | null): MaterialArtKey {
  for (const text of [name, category]) {
    if (!text) continue
    for (const [key, re] of RULES) if (re.test(text)) return key
  }
  return 'other'
}
