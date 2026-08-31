import type { Lang } from './i18n'

// Material names are DATA, not interface text — they live in `materials.name`
// and in the admin's catalog, and a bill records the name as it was at the
// time. So they can't come from the UI dictionary.
//
// What they are, though, is a small and very repetitive trade vocabulary:
// cement, sand, gitti, sariya, truck, tractor, bori. This translates those
// terms wherever they appear in a name, and leaves everything else exactly
// as written. That means:
//
//   "Cement — UltraTech — PPC • 50 KG"  →  "सीमेंट — UltraTech — PPC • 50 किलो"
//   "10mm Metal / Gitti — Tractor"      →  "10mm गिट्टी — ट्रैक्टर"
//
// Brand names are deliberately absent from the table. UltraTech, Tata Tiscon
// and Ambuja are written in Latin script on the bag, on the invoice and in
// every WhatsApp message in this trade — "अल्ट्राटेक" would read as a mistake.
// Grades (Fe500D), diameters (12mm) and CFT are left alone for the same
// reason: they are codes, not words.
//
// DISPLAY ONLY. Never feed the result back into state that gets saved —
// `invoice_items.description` and `materials.name` must stay English, because
// the bill that reaches the customer is English (see the note in Settings).

interface Term {
  hi: string
  mr: string
}

// Longest first is handled at build time, so "River Sand" wins over "Sand"
// and "M-Sand" is never half-translated.
const TERMS: Record<string, Term> = {
  // Categories and types
  'Steel / TMT Rods': { hi: 'सरिया / टीएमटी', mr: 'सळई / टीएमटी' },
  'Sand & Aggregates': { hi: 'रेत और गिट्टी', mr: 'वाळू आणि खडी' },
  'Manufactured Sand': { hi: 'मैन्युफैक्चर्ड रेत', mr: 'मॅन्युफॅक्चर्ड वाळू' },
  'Metal / Gitti': { hi: 'गिट्टी', mr: 'खडी' },
  'Plaster Sand': { hi: 'प्लास्टर रेत', mr: 'प्लास्टर वाळू' },
  'River Sand': { hi: 'नदी की रेत', mr: 'नदीची वाळू' },
  'TMT Rod': { hi: 'टीएमटी सरिया', mr: 'टीएमटी सळई' },
  'M-Sand': { hi: 'एम-रेत', mr: 'एम-वाळू' },
  Aggregates: { hi: 'गिट्टी', mr: 'खडी' },
  Cement: { hi: 'सीमेंट', mr: 'सिमेंट' },
  Gitti: { hi: 'गिट्टी', mr: 'खडी' },
  Steel: { hi: 'सरिया', mr: 'सळई' },
  Sand: { hi: 'रेत', mr: 'वाळू' },

  // Vehicles, packing and units
  Tractor: { hi: 'ट्रैक्टर', mr: 'ट्रॅक्टर' },
  Truck: { hi: 'ट्रक', mr: 'ट्रक' },
  Load: { hi: 'लोड', mr: 'लोड' },
  Bags: { hi: 'बोरी', mr: 'पोती' },
  Bag: { hi: 'बोरी', mr: 'पोते' },
  KG: { hi: 'किलो', mr: 'किलो' },

  // Common descriptive words suppliers type into custom material names
  Fine: { hi: 'बारीक', mr: 'बारीक' },
  Coarse: { hi: 'मोटी', mr: 'जाड' },
  Other: { hi: 'अन्य', mr: 'इतर' },
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

// One alternation, longest term first, matched in a single left-to-right
// pass. That is what stops a replacement being re-processed — "River Sand"
// becomes Devanagari and the "Sand" branch never sees it.
//
// The lookarounds stand in for \b, which is useless here because several
// terms contain "/" and "-". They only block matches that sit inside a
// longer Latin word, so "Sandstone" is left alone while "M-Sand" still works.
const PATTERN = new RegExp(
  `(?<![A-Za-z])(${Object.keys(TERMS)
    .sort((a, b) => b.length - a.length)
    .map(escapeRegExp)
    .join('|')})(?![A-Za-z])`,
  'gi',
)

const LOOKUP = new Map(Object.entries(TERMS).map(([term, value]) => [term.toLowerCase(), value]))

/**
 * Translates the known trade words inside a material name, category or unit.
 * Anything unrecognised — brands, grades, sizes, a supplier's own wording —
 * passes through untouched.
 */
export function localizeMaterialText(text: string | null | undefined, lang: Lang): string {
  if (!text) return text ?? ''
  if (lang === 'en') return text
  return text.replace(PATTERN, (match) => {
    const entry = LOOKUP.get(match.toLowerCase())
    return entry ? entry[lang] : match
  })
}
