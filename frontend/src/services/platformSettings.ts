import { supabase } from '@/lib/supabase'
import type { PlatformSettings } from '@/lib/database.types'

export async function getPlatformSettings(): Promise<PlatformSettings> {
  const { data, error } = await supabase.from('platform_settings').select('*').single()
  if (error) throw error
  return data
}

export async function updatePlatformSettings(input: Partial<PlatformSettings>): Promise<PlatformSettings> {
  const { data, error } = await supabase
    .from('platform_settings')
    .update(input)
    .eq('id', true)
    .select()
    .single()
  if (error) throw error
  return data
}
