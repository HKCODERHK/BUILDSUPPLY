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
  input: Omit<Material, 'id' | 'supplier_id' | 'created_at' | 'master_material_id' | 'low_stock_threshold' | 'stock_qty' | 'stock_unit'> & {
    master_material_id?: string | null
    low_stock_threshold?: number | null
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
