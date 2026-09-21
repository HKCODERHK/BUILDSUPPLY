/**
 * GST, one material at a time.
 *
 * Until migration 035 a bill carried one rate — 18% on the whole of it. That
 * is right for cement and TMT and wrong for sand and gitti, so each material
 * now holds its own percentage and every line is taxed at its own.
 *
 * The rate that ends up on a saved bill is resolved **in the database**
 * (`_price_items`), from the material row. Everything here is for showing the
 * supplier what the bill will come to before they save, and for reading back
 * a bill that already exists — so the arithmetic has to match 035 exactly:
 * whole rupees per line, then added up.
 */

/** What a line with no material behind it is charged, and what every bill charged before 035. */
export const DEFAULT_GST_RATE = 18

/** A line's tax, rounded the way the database rounds it. */
export function lineGst(amount: number, rate: number): number {
  return Math.round((amount * rate) / 100)
}

/** The percentage a material is taxed at — 18 for anything the list doesn't know. */
export function rateForMaterial(
  materialId: string | null | undefined,
  materials: { id: string; gst_rate?: number | null }[],
): number {
  if (!materialId) return DEFAULT_GST_RATE
  const found = materials.find((m) => m.id === materialId)
  const rate = found?.gst_rate
  return rate === null || rate === undefined ? DEFAULT_GST_RATE : Number(rate)
}

export interface TaxedLine {
  /** What the line comes to before tax. */
  amount: number
  rate: number
  gst: number
}

/**
 * The tax on a bill being written: each line at its own material's rate, and
 * nothing at all while the supplier has the GST switch off.
 */
export function taxLines(
  items: { material_id: string | null; qty: number; rate: number }[],
  materials: { id: string; gst_rate?: number | null }[],
  applicable: boolean,
): TaxedLine[] {
  return items.map((it) => {
    const amount = it.qty * it.rate
    const rate = applicable ? rateForMaterial(it.material_id, materials) : 0
    return { amount, rate, gst: lineGst(amount, rate) }
  })
}

export interface GstSlab {
  rate: number
  /** The part of the bill taxed at this rate. */
  taxable: number
  amount: number
}

/**
 * A bill's tax gathered by rate — "5% on ₹20,000 → ₹1,000" — which is how a
 * tax invoice has to present it once one bill carries several rates.
 *
 * Lines saved before 035 carry no rate at all. They are left out rather than
 * guessed at, so a caller can tell "this bill predates per-material GST" from
 * an empty result and fall back to the single figure on the bill itself.
 */
export function gstSlabs(
  items: { amount: number; gst_rate?: number | null; gst_amount?: number | null }[],
): GstSlab[] {
  const by = new Map<number, GstSlab>()
  for (const it of items) {
    if (it.gst_rate === null || it.gst_rate === undefined) continue
    const rate = Number(it.gst_rate)
    if (rate <= 0) continue
    const slab = by.get(rate) ?? { rate, taxable: 0, amount: 0 }
    slab.taxable += Number(it.amount) || 0
    slab.amount += Number(it.gst_amount) || 0
    by.set(rate, slab)
  }
  return [...by.values()].sort((a, b) => a.rate - b.rate)
}

/** How a percentage is written on a bill: 18%, 12.5%, never 18.00%. */
export function formatRate(rate: number): string {
  return `${Number(rate).toFixed(2).replace(/\.?0+$/, '')}%`
}
