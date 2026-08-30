import { supabase } from '@/lib/supabase'
import type { Material } from '@/lib/database.types'
import { logActivity } from './activityLog'

export async function listMaterials(): Promise<Material[]> {
  const { data, error } = await supabase.from('materials').select('*').order('category').order('name')
  if (error) throw error
  return data
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

// Used when an invoice is marked delivered, to keep stock quantities honest.
// Clamped at 0 — stock can never go negative, even if a delivery is marked
// for more than what's on hand (the DB has a matching check constraint as
// the backstop; this clamp keeps that from ever surfacing as an error here).
export async function adjustStock(materialId: string, deltaQty: number): Promise<void> {
  const { data: material, error: fetchError } = await supabase
    .from('materials')
    .select('stock_qty')
    .eq('id', materialId)
    .single()
  if (fetchError) throw fetchError

  const { error } = await supabase
    .from('materials')
    .update({ stock_qty: Math.max(0, Number(material.stock_qty) + deltaQty) })
    .eq('id', materialId)
  if (error) throw error
}
