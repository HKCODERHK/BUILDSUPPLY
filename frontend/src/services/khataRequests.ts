import { supabase } from '@/lib/supabase'
import { callRpc } from './db'

/**
 * A customer asking their shop to resend their khata link (migration 048).
 * The customer side asks by mobile number and always gets the same answer;
 * the shop sees its own open requests and sends the link from the usual
 * Share khata link dialog.
 */

export interface KhataLinkRequest {
  id: string
  customer_id: string
  created_at: string
}

/** Signed out. The answer never says whether the number belongs to anyone. */
export async function requestKhataLink(phone: string): Promise<void> {
  await callRpc('request_khata_link', { p_phone: phone })
}

/** Signed out, to one shop this phone has used (049), named by its order link. Same answer either way. */
export async function requestKhataLinkFrom(phone: string, link: string): Promise<void> {
  await callRpc('request_khata_link_from', { p_phone: phone, p_link: link })
}

/** The shop's own open requests; none on a database without 048. */
export async function openKhataLinkRequests(): Promise<KhataLinkRequest[]> {
  const { data, error } = await supabase.rpc('open_khata_link_requests')
  if (error || !Array.isArray(data)) return []
  return data as KhataLinkRequest[]
}

/** The shop has dealt with it — every open request from that customer goes. */
export async function handleKhataLinkRequest(id: string): Promise<void> {
  await callRpc('handle_khata_link_request', { p_id: id })
}
