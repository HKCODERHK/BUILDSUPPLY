import { supabase } from '@/lib/supabase'
import type { Driver } from '@/lib/database.types'

// The supplier's own drivers (migration 031): a name and a 10-digit number,
// for "Send to driver" on WhatsApp. Row-level security keeps each supplier to
// their own list; the admin sees none.

export async function listDrivers(): Promise<Driver[]> {
  const { data, error } = await supabase.from('drivers').select('*').order('name').order('id')
  if (error) throw error
  return (data ?? []) as Driver[]
}

/** The same number twice comes back as 'driver-exists', a bad one as 'driver-invalid'. */
export async function addDriver(name: string, phone: string): Promise<Driver> {
  const { data, error } = await supabase.from('drivers').insert({ name: name.trim(), phone }).select().single()
  if (error) {
    if (error.code === '23505') throw new Error('driver-exists')
    if (error.code === '23514') throw new Error('driver-invalid')
    throw error
  }
  return data as Driver
}

export async function removeDriver(id: string): Promise<void> {
  const { error } = await supabase.from('drivers').delete().eq('id', id)
  if (error) throw error
}
