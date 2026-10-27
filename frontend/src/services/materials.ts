import { supabase } from '@/lib/supabase'
import type { Material } from '@/lib/database.types'
import { logActivity } from './activityLog'
import { callRpc, fetchAll } from './db'

export async function listMaterials(): Promise<Material[]> {
  return fetchAll<Material>((from, to) =>
    supabase
      .from('materials')
      .select('*', { count: 'exact' })
      .order('category')
      .order('name')
      .order('id')
      .range(from, to),
  )
}

export async function createMaterial(
  supplierId: string,
  input: Omit<Material, 'id' | 'supplier_id' | 'created_at' | 'master_material_id' | 'low_stock_threshold' | 'stock_qty' | 'stock_unit' | 'gst_rate'> & {
    master_material_id?: string | null
    low_stock_threshold?: number | null
    // Left out by the catalog path, where the database's own 18 applies
    // until the supplier sets one in Settings → Material GST (035).
    gst_rate?: number
    // Omitted entirely from the Add/Edit Material form — a new material
    // always starts at 0 stock; suppliers set actual quantity afterward via
    // "Add Stock" on the Stock page, not here.
    stock_qty?: number
    stock_unit?: string | null
  },
): Promise<Material> {
  const { data, error } = await supabase
    .from('materials')
    .insert({ supplier_id: supplierId, ...input })
    .select()
    .single()
  if (error) {
    if (error.code === '23514') throw new Error('Stock quantity cannot be negative.')
    throw error
  }
  void logActivity('supplier', 'material_added', { details: { name: data.name } })
  return data
}

export async function updateMaterial(id: string, input: Partial<Material>): Promise<Material> {
  const { data, error } = await supabase.from('materials').update(input).eq('id', id).select().single()
  if (error) {
    if (error.code === '23514') throw new Error('Stock quantity cannot be negative.')
    throw error
  }
  void logActivity('supplier', input.stock_qty !== undefined ? 'stock_updated' : 'material_updated', {
    details: { name: data.name },
  })
  return data
}

export async function deleteMaterial(id: string): Promise<void> {
  const { error } = await supabase.from('materials').delete().eq('id', id)
  if (error) throw error
}

/**
 * Moves a material's stock by a delta in one step (adjust_stock, migration
 * 024) and returns the new quantity. It used to read the quantity, add on
 * the phone and write it back, so two changes at once could lose one.
 * Clamped at 0 — stock can never go negative.
 */
export async function adjustStock(material: { id: string; name: string }, deltaQty: number): Promise<number> {
  const qty = await callRpc<number>('adjust_stock', { p_material_id: material.id, p_delta: deltaQty })
  void logActivity('supplier', 'stock_updated', { details: { name: material.name, change: deltaQty } })
  return Number(qty)
}

/**
 * Whether the database has 050's selling-type columns. A preview build talks
 * to the live database, so until 050 is pasted the vehicle choice and the
 * order-rule fields stay hidden and the form saves exactly what it always did.
 */
let sellingTypesKnown: Promise<boolean> | null = null
export function sellingTypesAvailable(): Promise<boolean> {
  sellingTypesKnown ??= Promise.resolve(supabase.from('materials').select('sold_by').limit(1)).then(
    ({ error }) => !error,
    () => false,
  )
  return sellingTypesKnown
}

/** One vehicle option as the listing form holds it; `id` is null until saved. */
export interface VehicleOptionInput {
  id: string | null
  vehicle: string
  capacity: number
  capacity_unit: string
  rate: number
  delivery_charge: number | null
  available: boolean
}

export interface VehicleListingInput {
  listing_name: string
  category: string | null
  gst_rate: number
  options: VehicleOptionInput[]
}

function vehicleRow(listing: VehicleListingInput, o: VehicleOptionInput, name: string) {
  return {
    name,
    category: listing.category,
    gst_rate: listing.gst_rate,
    rate: o.rate,
    sold_by: 'vehicle' as const,
    listing_name: listing.listing_name.trim(),
    vehicle: o.vehicle.trim(),
    capacity: o.capacity,
    capacity_unit: o.capacity_unit.trim(),
    delivery_charge: o.delivery_charge,
    available: o.available,
    // Sold by the load. (A new option's stock is counted in loads too; an
    // existing material keeps its stock unit — see saveVehicleListing.)
    unit_label: 'Load',
    per_label: null,
    min_qty: null,
    qty_step: null,
  }
}

/**
 * Saves a vehicle listing: every option is its own material row, written one
 * at a time. Each saved option's id is written back into `listing.options` as
 * it goes, so pressing Save again after a failure updates rather than adding
 * the same option twice.
 */
export async function saveVehicleListing(
  supplierId: string,
  listing: VehicleListingInput,
  nameOf: (o: VehicleOptionInput) => string,
): Promise<void> {
  for (const o of listing.options) {
    const row = vehicleRow(listing, o, nameOf(o))
    // An existing material keeps its stock unit: 6 brass in the yard do not
    // become 6 loads because the way it is sold was written down.
    const { data, error } = o.id
      ? await supabase.from('materials').update(row).eq('id', o.id).select('id').single()
      : await supabase.from('materials').insert({ supplier_id: supplierId, stock_qty: 0, stock_unit: 'Load', ...row }).select('id').single()
    if (error) {
      if (error.code === '23505') throw new Error('duplicate-option')
      throw error
    }
    o.id = data.id
  }
  void logActivity('supplier', 'material_updated', { details: { name: listing.listing_name, options: listing.options.length } })
}

/**
 * Takes an option out of a listing. One that no bill, estimate or stock entry
 * names is deleted; one that is on record is kept, switched off, so those
 * records still lead back to it. Returns which happened.
 */
export async function removeVehicleOption(id: string): Promise<'deleted' | 'disabled'> {
  const counts = await Promise.all([
    ...['invoice_items', 'quotation_items', 'stock_logs'].map(async (table) => {
      const { count, error } = await supabase.from(table).select('id', { count: 'exact', head: true }).eq('material_id', id)
      if (error) throw error
      return count ?? 0
    }),
    // An order still waiting to be priced names it too (audit F-02): deleted,
    // that order's line would come into the estimate with no rate.
    (async () => {
      const { count, error } = await supabase
        .from('order_requests')
        .select('id', { count: 'exact', head: true })
        .is('quotation_id', null)
        .in('status', ['pending', 'approved'])
        .contains('items', [{ material_id: id }])
      if (error) throw error
      return count ?? 0
    })(),
  ])
  if (counts.some((n) => n > 0)) {
    const { error } = await supabase.from('materials').update({ available: false }).eq('id', id)
    if (error) throw error
    return 'disabled'
  }
  await deleteMaterial(id)
  return 'deleted'
}
