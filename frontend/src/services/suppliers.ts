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

/**
 * What the logo bucket accepts (migration 039 sets the same two rules on the
 * bucket itself, which is the one that actually holds). The formats are the
 * three the app displays; SVG is deliberately not among them — it is a
 * scriptable document, not a picture, and this bucket is public.
 */
const LOGO_EXTENSION: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
}
const LOGO_MAX_BYTES = 2 * 1024 * 1024

/** True when this file is one the bucket will take. The caller words the refusal. */
export function isAllowedLogo(file: File): boolean {
  return !!LOGO_EXTENSION[file.type] && file.size <= LOGO_MAX_BYTES
}

export async function uploadLogo(supplierId: string, file: File): Promise<string> {
  // The name a file carries is the uploader's to choose, so it does not decide
  // what gets stored: the extension comes from the type the browser read off
  // the file. The path is otherwise exactly what it always was,
  // `<supplier id>/logo.<ext>`, which is what the storage policy scopes to the
  // supplier's own folder.
  const ext = LOGO_EXTENSION[file.type]
  if (!ext) throw new Error('Use a PNG, JPG or WebP image.')
  if (file.size > LOGO_MAX_BYTES) throw new Error('That image is too large. Use one under 2 MB.')
  const path = `${supplierId}/logo.${ext}`

  const { error: uploadError } = await supabase.storage
    .from('logos')
    .upload(path, file, { upsert: true, contentType: file.type })
  if (uploadError) throw uploadError

  const { data } = supabase.storage.from('logos').getPublicUrl(path)
  await updateSupplierProfile(supplierId, { logo_url: data.publicUrl })
  return data.publicUrl
}
