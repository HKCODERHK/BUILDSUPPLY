import { supabase } from '@/lib/supabase'
import { customerClient } from '@/lib/customerAuth'
import { shrinkImage } from '@/lib/imageResize'
import type { Material, Supplier, SupplierOffer } from '@/lib/database.types'
import { callRpc } from './db'

// The shop's own page for customers (migration 042): the supplier edits it in
// Settings → Shop page, customers read it through shop_profile /
// my_shop_profile — never the tables.

export interface ShopProfile {
  found: true
  business_name: string
  logo_url: string | null
  phone: string | null
  address: string | null
  cover_url: string | null
  brand_color: string | null
  about: string | null
  whatsapp: string | null
  hours: unknown
  delivery_info: string | null
  social: Record<string, unknown> | null
  /** Only while the shop takes online orders. */
  order_link: string | null
  offers: { title: string; details: string | null; valid_until: string | null }[]
  /** material id → photo (the shop's own, or the catalog's). */
  photos: Record<string, string>
}

/** By the order link or a khata code. Null when there is none, or on a database without 042. */
export async function getShopProfile(by: { link?: string; khata?: string }): Promise<ShopProfile | null> {
  try {
    const p = await callRpc<ShopProfile | { found: false }>('shop_profile', { p_link: by.link ?? null, p_khata: by.khata ?? null })
    return p.found ? p : null
  } catch {
    return null
  }
}

/** For a customer's own account (041). */
export async function getMyShopProfile(connection: string): Promise<ShopProfile | null> {
  const { data, error } = await customerClient().rpc('my_shop_profile', { p_connection: connection })
  if (error || !data?.found) return null
  return data as ShopProfile
}

/** Whether this database has 042: the signed-in supplier's row carries its columns. */
export function shopPageAvailable(supplier: Supplier | null): boolean {
  return !!supplier && 'brand_color' in supplier
}

export type ShopPageFields = Pick<Supplier, 'brand_color' | 'about' | 'whatsapp' | 'hours' | 'delivery_info' | 'social' | 'cover_url'>

/** A value the database refuses (a check constraint) comes back as 'shop-invalid'. */
export async function saveShopPage(id: string, input: Partial<ShopPageFields>): Promise<Supplier> {
  const { data, error } = await supabase.from('suppliers').update(input).eq('id', id).select().single()
  if (error) {
    if (error.code === '23514') throw new Error('shop-invalid')
    throw error
  }
  return data
}

/** The path inside the logos bucket, for a public URL this app made there. */
function ownPath(url: string | null | undefined, supplierId: string): string | null {
  const marker = '/storage/v1/object/public/logos/'
  if (!url || !url.includes(marker)) return null
  const path = decodeURIComponent(url.split(marker)[1].split('?')[0])
  return path.startsWith(`${supplierId}/`) && !path.startsWith(`${supplierId}/logo.`) ? path : null
}

/**
 * Shrinks the picture on the phone, uploads it into the supplier's own folder
 * of the public logos bucket under a new name (so customers' phones never keep
 * showing a cached old one), then has `save` record its address. Only once
 * that has worked is the picture it replaces removed; if it fails, the new
 * upload is removed instead — so a failed save never leaves the shop pointing
 * at a deleted picture, nor a stray file in the bucket.
 */
export async function replaceShopImage(
  supplierId: string,
  file: File,
  kind: 'cover' | `material-${string}`,
  replacing: string | null | undefined,
  save: (url: string) => Promise<void>,
): Promise<string> {
  if (!file.type.startsWith('image/')) throw new Error('not-image')
  const small = await shrinkImage(file, kind === 'cover' ? 1600 : 900, kind === 'cover' ? 900 : 900)
  const ext = small.type === 'image/webp' ? 'webp' : 'jpg'
  const path = `${supplierId}/${kind}-${Date.now()}.${ext}`
  const { error } = await supabase.storage.from('logos').upload(path, small, { contentType: small.type, upsert: false })
  if (error) throw error
  const url = supabase.storage.from('logos').getPublicUrl(path).data.publicUrl
  try {
    await save(url)
  } catch (err) {
    await supabase.storage.from('logos').remove([path]).catch(() => undefined)
    throw err
  }
  const old = ownPath(replacing, supplierId)
  if (old) await supabase.storage.from('logos').remove([old]).catch(() => undefined)
  return url
}

/** Removes a picture this app uploaded (a cover or a product photo being cleared). */
export async function removeShopImage(supplierId: string, url: string | null | undefined): Promise<void> {
  const old = ownPath(url, supplierId)
  if (old) await supabase.storage.from('logos').remove([old]).catch(() => undefined)
}

export async function setMaterialPhoto(materialId: string, url: string | null): Promise<void> {
  const { error } = await supabase.from('materials').update({ photo_url: url }).eq('id', materialId)
  if (error) throw error
}

/** The supplier's materials with their own photo, and the catalog photo behind them. */
export async function listMaterialPhotos(): Promise<(Pick<Material, 'id' | 'name' | 'photo_url'> & { catalog_photo: string | null })[]> {
  const { data, error } = await supabase
    .from('materials')
    .select('id, name, photo_url, master_material_variants(image_url)')
    .order('name')
  if (error) throw error
  return (data ?? []).map((m: Record<string, unknown>) => {
    const v = m.master_material_variants as { image_url: string | null } | null
    return { id: m.id as string, name: m.name as string, photo_url: (m.photo_url as string | null) ?? null, catalog_photo: v?.image_url ?? null }
  })
}

export async function listOffers(): Promise<SupplierOffer[]> {
  const { data, error } = await supabase.from('supplier_offers').select('*').order('created_at', { ascending: false })
  if (error) throw error
  return data ?? []
}

export async function addOffer(input: Pick<SupplierOffer, 'title' | 'details' | 'valid_until'>): Promise<void> {
  const { error } = await supabase.from('supplier_offers').insert({ ...input, active: true })
  if (error) throw error
}

export async function setOfferActive(id: string, active: boolean): Promise<void> {
  const { error } = await supabase.from('supplier_offers').update({ active }).eq('id', id)
  if (error) throw error
}

export async function deleteOffer(id: string): Promise<void> {
  const { error } = await supabase.from('supplier_offers').delete().eq('id', id)
  if (error) throw error
}
