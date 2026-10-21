// How a material is sold (migration 050): by vehicle load, or by its own unit.
// One place for the names, the totals and the quantity rules, so the supplier's
// form, the customer's order page and the order screens can never disagree.
//
// A vehicle option is its own `materials` row — its own id, price, stock and
// on/off switch — and the options of one material share `listing_name`. Its
// `name` is written from the parts ("River Sand — Truck • 800 CFT"), which is
// what every bill, estimate, rate list and stock screen already shows.

/** What the supplier picks from; any other word can be typed. */
export const VEHICLE_SUGGESTIONS = ['Tractor', 'Small truck', 'Truck', 'Large truck', 'Dumper', 'Tipper']
export const CAPACITY_UNITS = ['CFT', 'Brass', 'Tonne', 'Cubic metre']
/** Truck sizes a supplier picks with one tap; any other can be typed. */
export const TRUCK_CFT_SIZES = [400, 600, 800, 1000, 1200]
export const SALE_UNITS = ['Bag', 'Piece', 'Kg', 'Tonne', 'Bundle', 'Box', 'Nos', '1000 pieces', 'Sq ft', 'Metre', 'Litre']

export type SoldBy = 'vehicle' | 'unit'

interface Sellable {
  sold_by?: SoldBy | null
  listing_name?: string | null
  vehicle?: string | null
  capacity?: number | string | null
  capacity_unit?: string | null
}

export function isVehicleOption(m: Sellable): boolean {
  return m.sold_by === 'vehicle' && !!m.listing_name && !!m.vehicle && Number(m.capacity) > 0 && !!m.capacity_unit
}

/** "800 CFT" */
export function capacityText(capacity: number | string, unit: string): string {
  return `${Number(capacity).toLocaleString('en-IN', { maximumFractionDigits: 2 })} ${unit}`.trim()
}

/** "Truck • 800 CFT" */
export function vehicleOptionLabel(vehicle: string, capacity: number | string, unit: string): string {
  return `${vehicle.trim()} • ${capacityText(capacity, unit)}`
}

/** The material's own name, written from its parts: "River Sand — Truck • 800 CFT". */
export function vehicleOptionName(listing: string, vehicle: string, capacity: number | string, unit: string): string {
  return `${listing.trim()} — ${vehicleOptionLabel(vehicle, capacity, unit)}`
}

/** How much material a number of loads comes to: "1,600 CFT". Never converted between units. */
export function totalMaterialText(loads: number, capacity: number | string, unit: string): string {
  return capacityText(Math.round(loads * Number(capacity) * 100) / 100, unit)
}

/** Smallest load first, then by vehicle name — how a listing's options are shown. */
export function byLoad(a: Sellable, b: Sellable): number {
  return Number(a.capacity) - Number(b.capacity) || String(a.vehicle ?? '').localeCompare(String(b.vehicle ?? ''))
}

/** The group a material belongs to on the order page and the materials list. */
export function listingKey(m: Sellable & { id: string }): string {
  return isVehicleOption(m) ? `v:${m.listing_name!.trim().toLowerCase()}` : `m:${m.id}`
}

/**
 * Whether a quantity is one the shop takes: whole loads for a vehicle option,
 * otherwise at least the minimum and in its steps. The same rule place_order
 * checks (migration 050).
 */
export function quantityProblem(
  m: Sellable & { min_qty?: number | null; qty_step?: number | null },
  qty: number,
): 'whole' | 'min' | 'step' | null {
  if (!(qty > 0)) return null
  if (m.sold_by === 'vehicle') return Number.isInteger(qty) ? null : 'whole'
  if (m.min_qty && qty < Number(m.min_qty)) return 'min'
  if (m.qty_step) {
    // In paise-sized pieces, so 1.5 in steps of 0.5 is not a rounding error.
    const step = Math.round(Number(m.qty_step) * 100)
    if (Math.round(qty * 100) % step !== 0) return 'step'
  }
  return null
}

/** The amount one tap of + adds, and where Add starts. */
export function stepOf(m: { sold_by?: SoldBy | null; qty_step?: number | null }): number {
  return m.sold_by === 'vehicle' ? 1 : Number(m.qty_step) || 1
}

export function firstQty(m: { sold_by?: SoldBy | null; min_qty?: number | null; qty_step?: number | null }): number {
  const step = stepOf(m)
  const min = m.sold_by === 'vehicle' ? 1 : Number(m.min_qty) || step
  return Math.ceil(Math.round((min / step) * 1000) / 1000) * step
}

/** "1 load" or "2 loads" — the translation key for a number of loads. */
export function loadsKey(n: number): 'sell.oneLoad' | 'sell.loads' {
  return n === 1 ? 'sell.oneLoad' : 'sell.loads'
}

/** A vehicle option as the supplier's form holds it: numbers stay text until saved, as every number box in the app does. */
export interface VehicleOptionDraft {
  id: string | null
  vehicle: string
  capacity: string
  capacity_unit: string
  rate: string
  delivery_charge: string
  available: boolean
}

export function blankVehicleOption(): VehicleOptionDraft {
  return { id: null, vehicle: '', capacity: '', capacity_unit: 'CFT', rate: '', delivery_charge: '', available: true }
}
