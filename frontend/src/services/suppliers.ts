import { supabase } from '@/lib/supabase'
import type { Supplier } from '@/lib/database.types'

// Admin-only in practice: RLS only returns every row when the caller's
// own suppliers.role = 'admin' (see is_admin() in schema.sql).
export async function listAllSuppliers(): Promise<Supplier[]> {
  const { data, error } = await supabase.from('suppliers').select('*').order('created_at', { ascending: false })
  if (error) throw error
  return data
}

export async function updateSupplierProfile(id: string, input: Partial<Supplier>): Promise<Supplier> {
  const { data, error } = await supabase.from('suppliers').update(input).eq('id', id).select().single()
  if (error) throw error
  return data
}

/** Settings → UPI (migration 029). A malformed UPI ID comes back as 'upi-invalid'. */
export async function saveUpiSettings(id: string, input: Pick<Supplier, 'upi_id' | 'khata_upi_enabled'>): Promise<Supplier> {
  const { data, error } = await supabase.from('suppliers').update(input).eq('id', id).select().single()
  if (error) {
    if (error.code === '23514') throw new Error('upi-invalid')
    throw error
  }
  return data
}

export async function uploadLogo(supplierId: string, file: File): Promise<string> {
  const ext = file.name.split('.').pop()
  const path = `${supplierId}/logo.${ext}`

  const { error: uploadError } = await supabase.storage.from('logos').upload(path, file, { upsert: true })
  if (uploadError) throw uploadError

  const { data } = supabase.storage.from('logos').getPublicUrl(path)
  await updateSupplierProfile(supplierId, { logo_url: data.publicUrl })
  return data.publicUrl
}
