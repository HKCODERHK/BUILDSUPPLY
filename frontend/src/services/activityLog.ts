import { supabase } from '@/lib/supabase'
import type { ActivityActorRole, ActivityLogEntry } from '@/lib/database.types'

// Fire-and-forget: a failed activity write should never block the real
// action (creating an invoice, etc.) that triggered it.
export async function logActivity(
  actorRole: ActivityActorRole,
  action: string,
  opts?: { supplierId?: string; details?: Record<string, unknown> },
): Promise<void> {
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return

  const { error } = await supabase.from('activity_log').insert({
    actor_id: user.id,
    actor_role: actorRole,
    supplier_id: opts?.supplierId ?? user.id,
    action,
    details: opts?.details ?? null,
  })
  if (error) console.warn('[activity_log] failed to record activity:', error.message)
}

export async function listActivity(supplierId: string): Promise<ActivityLogEntry[]> {
  const { data, error } = await supabase
    .from('activity_log')
    .select('*')
    .eq('supplier_id', supplierId)
    .order('created_at', { ascending: false })
    .limit(200)
  if (error) throw error
  return data
}
