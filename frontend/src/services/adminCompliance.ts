import { supabase } from '@/lib/supabase'
import { callRpc } from './db'
import type { ComplianceDocument, ComplianceRecord, ComplianceStatus } from './compliance'

/**
 * The admin's side of supplier verification (migration 045). Every decision
 * goes through the database's own functions — `compliance_decide`,
 * `accept_supplier_application`, `review_compliance_document` — which check
 * the caller is the admin and write the audit log. Nothing here writes a
 * status directly; the table's guard would refuse it anyway.
 */

export const COMPLIANCE_STATUS_LABEL: Record<ComplianceStatus, string> = {
  PENDING: 'Pending',
  UNDER_REVIEW: 'Under review',
  APPROVED: 'Approved',
  REJECTED: 'Rejected',
  SUSPENDED: 'Suspended',
}
export const COMPLIANCE_STATUS_TONE: Record<ComplianceStatus, 'success' | 'warning' | 'danger' | 'neutral' | 'info'> = {
  PENDING: 'warning',
  UNDER_REVIEW: 'info',
  APPROVED: 'success',
  REJECTED: 'danger',
  SUSPENDED: 'danger',
}

export type DecideAction = 'approve' | 'reject' | 'request_correction' | 'suspend' | 'reinstate' | 'terminate'

export const SUSPENSION_REASONS: { code: string; label: string }[] = [
  { code: 'fraud', label: 'Fraud' },
  { code: 'fake_documents', label: 'Fake or forged documents' },
  { code: 'counterfeit', label: 'Counterfeit materials' },
  { code: 'repeated_complaints', label: 'Repeated customer complaints' },
  { code: 'unresolved_complaints', label: 'Complaints not resolved' },
  { code: 'unsafe_conduct', label: 'Unsafe conduct' },
  { code: 'misrepresentation', label: 'Misrepresentation' },
  { code: 'quality', label: 'Quality problems' },
  { code: 'regulatory', label: 'Regulatory issue' },
  { code: 'other', label: 'Other (describe)' },
]

export interface AdminDocument extends ComplianceDocument {
  reviewed_at: string | null
}

export interface AdminAcceptance {
  id: string
  kind: string
  text_key: string
  version: number
  accepted_at: string
  ip_hash: string | null
  user_agent: string | null
  compliance_texts: { title: string } | null
}

export interface AuditEntry {
  id: string
  actor_role: 'supplier' | 'admin' | 'system'
  action: string
  prev_status: string | null
  new_status: string | null
  details: Record<string, unknown> | null
  created_at: string
}

export interface TextVersion {
  id: string
  kind: 'agreement' | 'declaration' | 'order_disclosure' | 'admin_notice'
  key: string
  version: number
  title: string
  body: string
  effective_from: string
  is_active: boolean
  created_at: string
}

export interface RetentionRow {
  record_type: string
  label: string
  keep_years: number | null
  note: string | null
  updated_at: string
}

export async function listAllCompliance(): Promise<ComplianceRecord[]> {
  const { data, error } = await supabase
    .from('supplier_compliance')
    .select('*')
    .order('submitted_at', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as ComplianceRecord[]
}

export async function getCompliance(userId: string): Promise<ComplianceRecord | null> {
  const { data, error } = await supabase.from('supplier_compliance').select('*').eq('user_id', userId).maybeSingle()
  if (error) throw error
  return data as ComplianceRecord | null
}

/** Every upload, newest first — replaced ones included, as history. */
export async function listDocumentsFor(userId: string): Promise<AdminDocument[]> {
  const { data, error } = await supabase
    .from('supplier_documents')
    .select('id, doc_type, storage_path, file_name, mime_type, size_bytes, uploaded_at, replaced_at, review_status, review_note, reviewed_at')
    .eq('user_id', userId)
    .order('uploaded_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as AdminDocument[]
}

export async function listAcceptancesFor(userId: string): Promise<AdminAcceptance[]> {
  const { data, error } = await supabase
    .from('supplier_acceptances')
    .select('id, kind, text_key, version, accepted_at, ip_hash, user_agent, compliance_texts(title)')
    .eq('user_id', userId)
    .order('accepted_at', { ascending: true })
  if (error) throw error
  return (data ?? []) as unknown as AdminAcceptance[]
}

export async function listAuditFor(userId: string): Promise<AuditEntry[]> {
  const { data, error } = await supabase
    .from('compliance_audit_log')
    .select('id, actor_role, action, prev_status, new_status, details, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(200)
  if (error) throw error
  return (data ?? []) as AuditEntry[]
}

export async function missingFor(userId: string): Promise<string[]> {
  return (await callRpc<string[] | null>('compliance_missing', { p_user: userId })) ?? []
}

export async function decide(userId: string, action: DecideAction, reason?: string, code?: string, notes?: string) {
  return callRpc<string>('compliance_decide', {
    p_user: userId,
    p_action: action,
    p_reason: reason?.trim() || null,
    p_code: code || null,
    p_notes: notes?.trim() || null,
  })
}

export async function reviewDocument(docId: string, status: 'accepted' | 'rejected', note?: string) {
  await callRpc('review_compliance_document', { p_doc: docId, p_status: status, p_note: note?.trim() || null })
}

export async function acceptApplication(userId: string, plan: 'starter' | 'pro', cycle: 'monthly' | 'yearly', start: string, expiry: string) {
  await callRpc('accept_supplier_application', { p_user: userId, p_plan: plan, p_cycle: cycle, p_start: start, p_expiry: expiry })
}

/** A short private link to look at a KYC file (the admin may read every folder). */
export async function adminDocumentLink(path: string): Promise<string> {
  const { data, error } = await supabase.storage.from('kyc').createSignedUrl(path, 120)
  if (error || !data) throw new Error(error?.message ?? 'link')
  return data.signedUrl
}

export async function listTextVersions(): Promise<TextVersion[]> {
  const { data, error } = await supabase
    .from('compliance_texts')
    .select('id, kind, key, version, title, body, effective_from, is_active, created_at')
    .order('kind')
    .order('key')
    .order('version', { ascending: false })
  if (error) throw error
  return (data ?? []) as TextVersion[]
}

/**
 * Publishes new wording as the next version of one text. Old versions are
 * never edited (the database refuses it) — the old one is switched off and
 * the new one on. If the new one cannot be saved, the old one is switched
 * back on, so a text is never left with no version in force.
 */
export async function publishTextVersion(kind: TextVersion['kind'], key: string, title: string, body: string, userId: string) {
  const { data: rows, error: readError } = await supabase
    .from('compliance_texts')
    .select('id, version, is_active')
    .eq('kind', kind)
    .eq('key', key)
  if (readError) throw readError
  const next = Math.max(0, ...(rows ?? []).map((r) => r.version as number)) + 1
  const active = (rows ?? []).find((r) => r.is_active)
  if (active) {
    const { error } = await supabase.from('compliance_texts').update({ is_active: false }).eq('id', active.id)
    if (error) throw error
  }
  const { error: insertError } = await supabase.from('compliance_texts').insert({
    kind,
    key,
    version: next,
    title: title.trim(),
    body: body.trim(),
    is_active: true,
    created_by: userId,
  })
  if (insertError) {
    if (active) await supabase.from('compliance_texts').update({ is_active: true }).eq('id', active.id)
    throw insertError
  }
  return next
}

export async function listRetention(): Promise<RetentionRow[]> {
  const { data, error } = await supabase.from('retention_settings').select('*').order('label')
  if (error) throw error
  return (data ?? []) as RetentionRow[]
}

export async function saveRetention(recordType: string, keepYears: number | null, note: string | null) {
  const { error } = await supabase
    .from('retention_settings')
    .update({ keep_years: keepYears, note: note?.trim() || null, updated_at: new Date().toISOString() })
    .eq('record_type', recordType)
  if (error) throw error
}
