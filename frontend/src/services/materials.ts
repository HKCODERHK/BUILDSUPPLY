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
  input: Omit<Material, 'id' | 'supplier_id' | 'created_at' | 'master_material_id'> & {
    master_material_id?: string | null
  },
): Promise<Material> {
  const { data, error } = await supabase
    .from('materials')
    .insert({ supplier_id: supplierId, ...input })
    .select()
    .single()
  if (error) throw error
  void logActivity('supplier', 'material_added', { details: { name: data.name } })
  return data
}

export async function updateMaterial(id: string, input: Partial<Material>): Promise<Material> {
  const { data, error } = await supabase.from('materials').update(input).eq('id', id).select().single()
  if (error) throw error
  void logActivity('supplier', input.stock_qty !== undefined ? 'stock_updated' : 'material_updated', {
    details: { name: data.name },
  })
  return data
}

export async function deleteMaterial(id: string): Promise<void> {
  const { error } = await supabase.from('materials').delete().eq('id', id)
  if (error) throw error
}

// Used when an invoice is created/deleted to keep stock quantities honest.
export async function adjustStock(materialId: string, deltaQty: number): Promise<void> {
  const { data: material, error: fetchError } = await supabase
    .from('materials')
    .select('stock_qty')
    .eq('id', materialId)
    .single()
  if (fetchError) throw fetchError

  const { error } = await supabase
    .from('materials')
    .update({ stock_qty: Number(material.stock_qty) + deltaQty })
    .eq('id', materialId)
  if (error) throw error
}
