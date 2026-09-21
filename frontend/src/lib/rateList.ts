import type { Material } from './database.types'

/**
 * The materials a rate list is made of: the priced ones, by name.
 *
 * It lives here rather than beside the PDF builder because the rate list now
 * goes out two ways — the PDF on the supplier's letterhead (lib/rateListPdf)
 * and a plain WhatsApp message to one number (components/SendRatesModal) —
 * and a dashboard that only writes a message should not pull the PDF theme in
 * behind it.
 */
export function rateListMaterials(materials: Material[]): Material[] {
  return materials.filter((m) => Number(m.rate) > 0).sort((a, b) => a.name.localeCompare(b.name))
}
