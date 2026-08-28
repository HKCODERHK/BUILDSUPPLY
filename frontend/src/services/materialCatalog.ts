import { supabase } from '@/lib/supabase'
import type { Brand, MaterialCategory, MaterialType, MasterMaterialVariant, VariantAttributes } from '@/lib/database.types'
import { logActivity } from './activityLog'

function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
}

// ============================================================
// Categories
// ============================================================

export async function listCategories(): Promise<MaterialCategory[]> {
  const { data, error } = await supabase.from('material_categories').select('*').order('name')
  if (error) throw error
  return data
}

export async function createCategory(name: string): Promise<MaterialCategory> {
  const { data, error } = await supabase
    .from('material_categories')
    .insert({ name, slug: slugify(name) })
    .select()
    .single()
  if (error) throw error
  void logActivity('admin', 'category_added', { details: { name } })
  return data
}

export async function updateCategory(id: string, input: Partial<MaterialCategory>): Promise<void> {
  const { error } = await supabase.from('material_categories').update(input).eq('id', id)
  if (error) throw error
  void logActivity('admin', 'active' in input ? 'category_status_changed' : 'category_updated', { details: input })
}

// ============================================================
// Brands
// ============================================================

export async function listBrands(): Promise<Brand[]> {
  const { data, error } = await supabase.from('brands').select('*').order('name')
  if (error) throw error
  return data
}

export async function createBrand(name: string): Promise<Brand> {
  const { data, error } = await supabase.from('brands').insert({ name, slug: slugify(name) }).select().single()
  if (error) throw error
  void logActivity('admin', 'brand_added', { details: { name } })
  return data
}

export async function updateBrand(id: string, input: Partial<Brand>): Promise<void> {
  const { error } = await supabase.from('brands').update(input).eq('id', id)
  if (error) throw error
  void logActivity('admin', 'active' in input ? 'brand_status_changed' : 'brand_updated', { details: input })
}

// ============================================================
// Material types (what the product fundamentally is, under a category)
// ============================================================

export async function listMaterialTypes(): Promise<MaterialType[]> {
  const { data, error } = await supabase.from('material_types').select('*').order('name')
  if (error) throw error
  return data
}

export async function createMaterialType(categoryId: string, name: string): Promise<MaterialType> {
  const { data, error } = await supabase
    .from('material_types')
    .insert({ category_id: categoryId, name, slug: slugify(name) })
    .select()
    .single()
  if (error) throw error
  void logActivity('admin', 'material_type_added', { details: { name } })
  return data
}

export async function updateMaterialType(id: string, input: Partial<MaterialType>): Promise<void> {
  const { error } = await supabase.from('material_types').update(input).eq('id', id)
  if (error) throw error
  void logActivity('admin', 'active' in input ? 'material_type_status_changed' : 'material_type_updated', {
    details: input,
  })
}

// ============================================================
// Variants — the actual sellable catalog products
// ============================================================

export interface VariantWithLookups extends MasterMaterialVariant {
  material_types: { name: string; category_id: string; material_categories: { name: string } | null } | null
  brands: { name: string } | null
}

const VARIANT_SELECT = '*, material_types(name, category_id, material_categories(name)), brands(name)'

export async function listVariants(): Promise<VariantWithLookups[]> {
  const { data, error } = await supabase.from('master_material_variants').select(VARIANT_SELECT).order('name')
  if (error) throw error
  return data as VariantWithLookups[]
}

// Single search implementation shared by the admin catalog page and the
// supplier's Browse Catalog — matches name, category, type, brand, unit,
// admin-entered aliases, and every attribute value via the trigger-maintained
// `search_text` column (see supabase/migrations/004_master_catalog.sql).
export async function searchCatalog(query: string, opts?: { activeOnly?: boolean }): Promise<VariantWithLookups[]> {
  let q = supabase.from('master_material_variants').select(VARIANT_SELECT)
  if (opts?.activeOnly) q = q.eq('active', true)
  // Match each word of the query as its own substring (PostgREST ANDs repeated
  // filters on the same column) rather than the whole query as one substring,
  // so "12 mm" / "20mm gitti" / "ultra tech" match regardless of word order or
  // spacing differences from how the catalog text is stored.
  for (const word of query.trim().toLowerCase().split(/\s+/).filter(Boolean)) {
    q = q.ilike('search_text', `%${word}%`)
  }
  const { data, error } = await q.order('name')
  if (error) throw error
  return data as VariantWithLookups[]
}

export interface VariantInput {
  material_type_id: string
  brand_id: string | null
  name: string
  attributes: VariantAttributes
  unit: string | null
  search_keywords: string | null
  image_url: string | null
}

export async function createVariant(input: VariantInput): Promise<MasterMaterialVariant> {
  const { data, error } = await supabase.from('master_material_variants').insert(input).select().single()
  if (error) throw error
  void logActivity('admin', 'material_catalog_added', { details: { name: input.name } })
  return data
}

export async function updateVariant(id: string, input: Partial<VariantInput> & { active?: boolean }): Promise<void> {
  const { error } = await supabase.from('master_material_variants').update(input).eq('id', id)
  if (error) throw error
  const isStatusChange = 'active' in input && Object.keys(input).length === 1
  void logActivity('admin', isStatusChange ? 'material_catalog_status_changed' : 'material_catalog_updated', {
    details: input,
  })
}

export async function uploadCatalogImage(file: File): Promise<string> {
  const ext = file.name.split('.').pop()
  const path = `${crypto.randomUUID()}.${ext}`

  const { error: uploadError } = await supabase.storage.from('catalog').upload(path, file)
  if (uploadError) throw uploadError

  const { data } = supabase.storage.from('catalog').getPublicUrl(path)
  return data.publicUrl
}
