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
  if (error) throw error
  if (data?.error) throw new Error(data.error)
  return data as T
}

export async function createSupplierAccount(input: CreateSupplierInput): Promise<{ id: string }> {
  return invokeAdminFunction('create_supplier', input)
}

export async function resetSupplierPassword(supplierId: string, newPassword: string): Promise<void> {
  await invokeAdminFunction('reset_password', { supplier_id: supplierId, new_password: newPassword })
}

export async function setSupplierBan(supplierId: string, banned: boolean): Promise<void> {
  await invokeAdminFunction('set_ban', { supplier_id: supplierId, banned })
}

// Everything below is a plain RLS-protected update — admin already has
// update rights on any suppliers row via the suppliers_update policy,
// so none of this needs the privileged Edge Function.

export async function updateSupplierRecord(id: string, input: Partial<Supplier>): Promise<Supplier> {
  const { data, error } = await supabase.from('suppliers').update(input).eq('id', id).select().single()
  if (error) throw error
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
