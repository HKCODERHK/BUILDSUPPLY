import { FunctionsHttpError } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import { callRpc } from './db'

/**
 * Supplier verification (migration 045): the KYC record, its documents, the
 * agreement and declarations, and a new shop's application. Every status
 * change happens in the database's own functions; the account itself only
 * edits its business details, and only while the record is open.
 */

export type ComplianceStatus = 'PENDING' | 'UNDER_REVIEW' | 'APPROVED' | 'REJECTED' | 'SUSPENDED'
export type RequestedPlan = 'trial' | 'basic' | 'pro' | 'yearly'
export type BusinessType = 'proprietor' | 'partnership' | 'llp' | 'private_limited' | 'other'

export interface ComplianceRecord {
  user_id: string
  status: ComplianceStatus
  is_applicant: boolean
  grandfathered: boolean
  correction_reason: string | null
  requested_plan: RequestedPlan | null
  legal_name: string | null
  contact_name: string | null
  mobile: string | null
  email: string | null
  address: string | null
  district: string | null
  state: string | null
  pin_code: string | null
  business_type: BusinessType | null
  business_type_other: string | null
  pan: string | null
  gstin: string | null
  registration_details: string | null
  submitted_at: string | null
  decided_at: string | null
  decision_reason: string | null
  suspended_at: string | null
  suspension_code: string | null
  suspension_note: string | null
  terminated_at: string | null
  termination_reason: string | null
  termination_notes: string | null
}

/** The business fields the account may edit itself. */
export type ComplianceDetails = Pick<
  ComplianceRecord,
  | 'legal_name'
  | 'contact_name'
  | 'mobile'
  | 'email'
  | 'address'
  | 'district'
  | 'state'
  | 'pin_code'
  | 'business_type'
  | 'business_type_other'
  | 'pan'
  | 'gstin'
  | 'registration_details'
>

export interface Requirement {
  doc_type: string
  label: string
  required: boolean
  sort: number
}

export interface ComplianceDocument {
  id: string
  doc_type: string
  storage_path: string
  file_name: string
  mime_type: string
  size_bytes: number
  uploaded_at: string
  replaced_at: string | null
  review_status: 'pending' | 'accepted' | 'rejected'
  review_note: string | null
}

export interface LegalText {
  id: string
  kind: 'agreement' | 'declaration'
  key: string
  version: number
  title: string
  body: string
}

export interface Acceptance {
  text_id: string
  kind: string
  text_key: string
  version: number
  accepted_at: string
}

export const KYC_MAX_BYTES = 5 * 1024 * 1024
export const KYC_TYPES = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp']

/** The signed-in account's own record, or null when it has none. */
export async function getMyCompliance(userId: string): Promise<ComplianceRecord | null> {
  const { data, error } = await supabase.from('supplier_compliance').select('*').eq('user_id', userId).maybeSingle()
  if (error) {
    // Before 045 the table does not exist: there is simply nothing to show.
    if (/supplier_compliance/.test(error.message) || error.code === '42P01' || error.code === 'PGRST205') return null
    throw error
  }
  return (data as ComplianceRecord | null) ?? null
}

/** A supplier made after 045 has no record yet; this opens one. */
export async function startCompliance(): Promise<ComplianceRecord> {
  return callRpc<ComplianceRecord>('start_compliance', {})
}

export async function saveComplianceDetails(userId: string, details: Partial<ComplianceDetails>): Promise<void> {
  const { error } = await supabase.from('supplier_compliance').update(details).eq('user_id', userId)
  if (error) throw new Error(error.message)
}

export async function listRequirements(): Promise<Requirement[]> {
  const { data, error } = await supabase
    .from('compliance_requirements')
    .select('doc_type, label, required, sort')
    .eq('active', true)
    .order('sort')
  if (error) throw error
  return (data ?? []) as Requirement[]
}

/** The current upload of each document type (older ones are kept as history). */
export async function listMyDocuments(userId: string): Promise<ComplianceDocument[]> {
  const { data, error } = await supabase
    .from('supplier_documents')
    .select('id, doc_type, storage_path, file_name, mime_type, size_bytes, uploaded_at, replaced_at, review_status, review_note')
    .eq('user_id', userId)
    .is('replaced_at', null)
    .order('uploaded_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as ComplianceDocument[]
}

const EXT: Record<string, string> = {
  'application/pdf': 'pdf',
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
}

/**
 * Uploads one document into the account's own folder of the private `kyc`
 * bucket, then records it. A new upload never replaces the old file — it is
 * a new file, and the old record stays as history.
 */
export async function uploadDocument(userId: string, docType: string, file: File): Promise<void> {
  if (!KYC_TYPES.includes(file.type)) throw new Error('type')
  if (file.size < 1 || file.size > KYC_MAX_BYTES) throw new Error('size')
  const path = `${userId}/${docType}-${Date.now()}-${crypto.randomUUID().slice(0, 8)}.${EXT[file.type]}`
  const { error: upError } = await supabase.storage.from('kyc').upload(path, file, { contentType: file.type, upsert: false })
  if (upError) throw new Error(upError.message)
  await callRpc('add_compliance_document', { p_doc_type: docType, p_path: path, p_file_name: file.name.slice(0, 200) })
}

/** A short-lived private link to view one's own document. Never public. */
export async function documentLink(path: string): Promise<string> {
  const { data, error } = await supabase.storage.from('kyc').createSignedUrl(path, 120)
  if (error || !data) throw new Error(error?.message ?? 'link')
  return data.signedUrl
}

/** The agreement and every declaration currently in force. */
export async function listActiveTexts(): Promise<LegalText[]> {
  const { data, error } = await supabase
    .from('compliance_texts')
    .select('id, kind, key, version, title, body')
    .eq('is_active', true)
    .in('kind', ['agreement', 'declaration'])
    .order('kind')
    .order('key')
  if (error) throw error
  return (data ?? []) as LegalText[]
}

export async function listMyAcceptances(userId: string): Promise<Acceptance[]> {
  const { data, error } = await supabase
    .from('supplier_acceptances')
    .select('text_id, kind, text_key, version, accepted_at')
    .eq('user_id', userId)
  if (error) throw error
  return (data ?? []) as Acceptance[]
}

/** Records acceptance of one text, with the device's own description of itself. */
export async function acceptText(textId: string): Promise<void> {
  await callRpc('accept_compliance_text', { p_text: textId, p_user_agent: navigator.userAgent.slice(0, 400) })
}

/** What still stops the record being submitted. Empty means ready. */
export async function missingItems(): Promise<string[]> {
  return (await callRpc<string[] | null>('compliance_missing', {})) ?? []
}

export async function submitCompliance(): Promise<ComplianceStatus> {
  return callRpc<ComplianceStatus>('submit_compliance', {})
}

export interface ApplicationInput {
  business_name: string
  owner_name: string
  mobile: string
  email: string
  password: string
  district: string
  state: string
  plan: RequestedPlan
  /** The bot trap; people never see it. */
  website: string
}

/**
 * Sends a new shop's application (Edge Function `supplier-apply`). Returns
 * nothing on success; throws an Error whose message is a short code
 * (`email_taken`, `busy`, `bad_mobile`, …) the screen turns into words.
 */
export async function applyAsSupplier(input: ApplicationInput): Promise<void> {
  const { data, error } = await supabase.functions.invoke('supplier-apply', { body: input })
  if (error) {
    if (error instanceof FunctionsHttpError) {
      const body = await error.context.json().catch(() => null)
      throw new Error(body?.error ?? 'server')
    }
    throw new Error('network')
  }
  if (data?.error) throw new Error(data.error)
}
