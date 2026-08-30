import { supabase } from '@/lib/supabase'
import type { ActivityActorRole, ActivityLogEntry, AdminActivityEntry } from '@/lib/database.types'

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

/** A supplier's own activity — used by supplier-facing screens. */
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

/**
 * One supplier's activity, for the admin's supplier profile screen.
 *
 * Goes through an RPC rather than the table because RLS deliberately no
 * longer lets the admin read `activity_log` rows (migration 019), and
 * because the RPC omits the `details` column — it holds that supplier's
 * customer names and invoice amounts, which are none of the platform
 * owner's business. The admin still sees *what* happened and *when*, which
 * is what supporting an account and judging whether it's being used needs.
 */
export async function listSupplierActivityForAdmin(supplierId: string): Promise<AdminActivityEntry[]> {
  const { data, error } = await supabase.rpc('admin_supplier_activity', { p_supplier_id: supplierId })
  if (error) throw error
  return (data ?? []) as AdminActivityEntry[]
}
