import type { Material } from './database.types'

/**
 * The materials a rate list is made of: the priced ones, by name.
 *
 * It lives apart from the PDF builder (lib/rateListPdf re-exports it) so a
 * screen that only needs the list does not pull the PDF theme in behind it.
 * The WhatsApp message to one caller lists every material, priced or not —
 * lib/shopDetails.ts.
 */
export function rateListMaterials(materials: Material[]): Material[] {
  return materials.filter((m) => Number(m.rate) > 0).sort((a, b) => a.name.localeCompare(b.name))
}
