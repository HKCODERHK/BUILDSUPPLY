import { FunctionsHttpError } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import type {
  AdminDashboardStats,
  Plan,
  Supplier,
  SupplierAccountStatus,
  SupplierOverview,
} from '@/lib/database.types'
import { logActivity } from './activityLog'

export async function listSuppliersOverview(): Promise<SupplierOverview[]> {
  const { data, error } = await supabase.rpc('admin_list_suppliers')
  if (error) throw error
  return (data ?? []) as SupplierOverview[]
}

export async function getDashboardStats(): Promise<AdminDashboardStats | null> {
  const { data, error } = await supabase.rpc('admin_dashboard_stats')
  if (error) throw error
  return (data?.[0] as AdminDashboardStats) ?? null
}

interface CreateSupplierInput {
  email: string
  password: string
  business_name: string
  owner_name?: string
  phone?: string
  address?: string
  plan?: Plan
  subscription_start?: string
  subscription_expiry?: string
}

async function invokeAdminFunction<T>(action: string, payload: object): Promise<T> {
  const { data, error } = await supabase.functions.invoke('admin-manage-supplier', {
    body: { action, ...payload },
  })
  if (error) {
    // supabase-js only exposes a generic "non-2xx status" message by default —
    // the function's actual {error: "..."} body is on error.context (a Response).
    if (error instanceof FunctionsHttpError) {
      const body = await error.context.json().catch(() => null)
      throw new Error(body?.error ?? error.message)
    }
    throw error
  }
  if (data?.error) throw new Error(data.error)
  return data as T
}

export async function createSupplierAccount(input: CreateSupplierInput): Promise<{ id: string }> {
  return invokeAdminFunction('create_supplier', input)
}

export async function resetSupplierPassword(supplierId: string, newPassword: string): Promise<void> {
  await invokeAdminFunction('reset_password', { supplier_id: supplierId, new_password: newPassword })
}

export interface DeleteSupplierResult {
  ok: true
  business_name: string
  deleted: Record<string, number>
  /** Set when the supplier was deleted but their logo could not be removed. */
  warning?: string
}

/**
 * Permanently deletes a supplier: their login, their business data and their
 * logo. There is no undo and no soft-delete flag — Deactivate is what keeps
 * the data.
 *
 * `confirmName` must match the business name exactly; the Edge Function
 * re-checks it against the row it is about to destroy, so a mistyped id
 * cannot take out the wrong business.
 */
export async function deleteSupplierAccount(supplierId: string, confirmName: string): Promise<DeleteSupplierResult> {
  return invokeAdminFunction('delete_supplier', { supplier_id: supplierId, confirm_name: confirmName })
}

export async function setSupplierBan(supplierId: string, banned: boolean): Promise<void> {
  await invokeAdminFunction('set_ban', { supplier_id: supplierId, banned })
}

// Everything below is a plain RLS-protected update — admin already has
// update rights on any suppliers row via the suppliers_update policy,
// so none of this needs the privileged Edge Function.

/**
 * Records that the admin has just reached out to this supplier.
 *
 * Called when they tap Call or WhatsApp from the admin panel — it cannot
 * know whether the call was answered, only that the admin has already tried,
 * which is the thing worth not doing twice.
 */
export async function markSupplierContacted(id: string): Promise<void> {
  const { error } = await supabase
    .from('suppliers')
    .update({ last_contacted_at: new Date().toISOString() })
    .eq('id', id)
  if (error) throw error
}

export async function updateSupplierRecord(id: string, input: Partial<Supplier>): Promise<Supplier> {
  const { data, error } = await supabase.from('suppliers').update(input).eq('id', id).select().single()
  if (error) throw error
  return data
}

// Same underlying update as updateSupplierRecord, but tagged with its own
// activity-log entry — kept separate so status-change actions (which log
// their own supplier_status_* event) don't also produce a generic one.
export async function updateSupplierSubscription(
  id: string,
  input: Partial<Pick<Supplier, 'plan' | 'subscription_start' | 'subscription_expiry' | 'subscription_status'>>,
): Promise<Supplier> {
  const data = await updateSupplierRecord(id, input)
  await logActivity('admin', 'subscription_changed', { supplierId: id, details: input })
  return data
}

export async function setSupplierStatus(
  id: string,
  status: SupplierAccountStatus,
  opts?: { suspensionReason?: string },
): Promise<void> {
  await setSupplierBan(id, status !== 'active')
  await updateSupplierRecord(id, {
    status,
    suspension_reason: status === 'suspended' ? opts?.suspensionReason ?? null : null,
  })
  await logActivity('admin', `supplier_status_${status}`, { supplierId: id })
}
