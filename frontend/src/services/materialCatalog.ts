import { supabase } from '@/lib/supabase'
import type { Brand, MasterMaterial, MaterialCategory } from '@/lib/database.types'

export async function listCategories(): Promise<MaterialCategory[]> {
  const { data, error } = await supabase.from('material_categories').select('*').order('name')
  if (error) throw error
  return data
}

export async function createCategory(name: string): Promise<MaterialCategory> {
  const { data, error } = await supabase.from('material_categories').insert({ name }).select().single()
  if (error) throw error
  return data
}

export async function updateCategory(id: string, input: Partial<MaterialCategory>): Promise<void> {
  const { error } = await supabase.from('material_categories').update(input).eq('id', id)
  if (error) throw error
}

export async function listBrands(): Promise<Brand[]> {
  const { data, error } = await supabase.from('brands').select('*').order('name')
  if (error) throw error
  return data
}

export async function createBrand(name: string): Promise<Brand> {
  const { data, error } = await supabase.from('brands').insert({ name }).select().single()
  if (error) throw error
  return data
}

export async function updateBrand(id: string, input: Partial<Brand>): Promise<void> {
  const { error } = await supabase.from('brands').update(input).eq('id', id)
  if (error) throw error
}

export interface MasterMaterialWithLookups extends MasterMaterial {
  material_categories: { name: string } | null
  brands: { name: string } | null
}

export async function listMasterMaterials(): Promise<MasterMaterialWithLookups[]> {
  const { data, error } = await supabase
    .from('master_materials')
    .select('*, material_categories(name), brands(name)')
    .order('name')
  if (error) throw error
  return data as MasterMaterialWithLookups[]
}

export async function listActiveCatalog(): Promise<MasterMaterialWithLookups[]> {
  const { data, error } = await supabase
    .from('master_materials')
    .select('*, material_categories(name), brands(name)')
    .eq('active', true)
    .order('name')
  if (error) throw error
  return data as MasterMaterialWithLookups[]
}

export async function createMasterMaterial(
  input: Omit<MasterMaterial, 'id' | 'created_at' | 'active'>,
): Promise<MasterMaterial> {
  const { data, error } = await supabase.from('master_materials').insert(input).select().single()
  if (error) throw error
  return data
}

export async function updateMasterMaterial(id: string, input: Partial<MasterMaterial>): Promise<void> {
  const { error } = await supabase.from('master_materials').update(input).eq('id', id)
  if (error) throw error
}
