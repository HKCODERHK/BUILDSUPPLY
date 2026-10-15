import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { useParams } from 'react-router-dom'
import { FileText, Phone } from 'lucide-react'
import { PageHeader } from '@/components/layout/PageHeader'
import { Card, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Modal } from '@/components/ui/modal'
import { TruckLoader } from '@/components/TruckLoader'
import { WhatsAppIcon } from '@/components/icons/WhatsAppIcon'
import { usePin } from '@/context/PinContext'
import { openWhatsAppShare } from '@/lib/whatsapp'
import { PLAN_CHOICES, type PlanChoice } from '@/lib/plans'
import { TRIAL_DAYS } from '@/lib/site'
import { today, todayPlusDays, renewedExpiry } from '@/lib/subscription'
import type { ComplianceRecord } from '@/services/compliance'
import { listComplaintsForSupplier, type ShopComplaint } from '@/services/complaints'
import {
  COMPLIANCE_STATUS_LABEL,
  COMPLIANCE_STATUS_TONE,
  SUSPENSION_REASONS,
  acceptApplication,
  adminDocumentLink,
  decide,
  getCompliance,
  listAcceptancesFor,
  listAuditFor,
  listDocumentsFor,
  missingFor,
  reviewDocument,
  type AdminAcceptance,
  type AdminDocument,
  type AuditEntry,
  type DecideAction,
} from '@/services/adminCompliance'

/**
 * One shop's verification, for the admin: what they told us, their
 * documents, what they accepted and when, the full history, and the
 * decisions. Every decision is the database's own function, PIN-gated here
 * like the admin's other irreversible actions.
 */

const fmt = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' }) : '—'

const DOC_LABEL: Record<string, string> = {
  pan: 'PAN card',
  address_proof: 'Address / business proof',
  gst_certificate: 'GST certificate',
  business_registration: 'Business registration',
  licence: 'Trade licence',
}

const COMPLAINT_LABEL: Record<string, string> = {
  quality: 'Quality',
  quantity: 'Less quantity',
  wrong_item: 'Wrong material',
  damaged: 'Damaged',
  delivery: 'Delivery',
  billing: 'Bill or rate',
  behaviour: 'Staff behaviour',
  other: 'Other',
}

const TYPE_LABEL: Record<string, string> = {
  proprietor: 'Proprietor',
  partnership: 'Partnership',
  llp: 'LLP',
  private_limited: 'Private limited',
  other: 'Other',
}

const ACTION_LABEL: Record<string, string> = {
  application_created: 'Applied',
  compliance_started: 'Verification started',
  kyc_updated: 'Details edited',
  document_uploaded: 'Document uploaded',
  document_reviewed: 'Document reviewed',
  agreement_accepted: 'Agreement accepted',
  declaration_accepted: 'Declaration accepted',
  kyc_submitted: 'Sent for review',
  correction_requested: 'Correction requested',
  supplier_approved: 'Approved',
  supplier_rejected: 'Rejected',
  supplier_suspended: 'Suspended',
  supplier_reinstated: 'Reinstated',
  supplier_terminated: 'Agreement terminated',
}

const FIELD_LABEL: Record<string, string> = {
  legal_name: 'registered name',
  contact_name: 'contact person',
  mobile: 'mobile',
  email: 'email',
  address: 'address',
  district: 'district',
  state: 'state',
  pin_code: 'PIN code',
  business_type: 'type of business',
  pan: 'PAN number',
}

/** compliance_missing's codes in words: fields, then documents, then the texts. */
function missingWords(codes: string[]) {
  const words: string[] = []
  for (const c of codes) {
    const w = c.startsWith('doc:')
      ? `${DOC_LABEL[c.slice(4)] ?? c.slice(4)} (document)`
      : c.startsWith('agreement:')
        ? 'the agreement'
        : c.startsWith('declaration:')
          ? 'the declarations'
          : (FIELD_LABEL[c] ?? c.replace(/_/g, ' '))
    if (!words.includes(w)) words.push(w)
  }
  return words.join(', ')
}

/** The plan and dates the admin is offered on accepting, from what the shop asked for. */
function suggested(r: ComplianceRecord): { choice: PlanChoice; start: string; expiry: string } {
  const start = today()
  switch (r.requested_plan) {
    case 'basic':
      return { choice: 'basic', start, expiry: renewedExpiry(null, 1) }
    case 'yearly':
      return { choice: 'yearly', start, expiry: renewedExpiry(null, 12) }
    case 'pro':
      return { choice: 'pro', start, expiry: renewedExpiry(null, 1) }
    default:
      // The free trial is Pro with a short expiry.
      return { choice: 'pro', start, expiry: todayPlusDays(TRIAL_DAYS) }
  }
}

type Dialog =
  | { kind: 'accept' }
  | { kind: 'reason'; action: Extract<DecideAction, 'reject' | 'request_correction'> }
  | { kind: 'suspend' }
  | { kind: 'terminate' }
  | { kind: 'doc'; doc: AdminDocument; status: 'accepted' | 'rejected' }
  | null

export default function AdminComplianceDetail() {
  const { id = '' } = useParams()
  const { confirmWithPin } = usePin()
  const [record, setRecord] = useState<ComplianceRecord | null | undefined>(undefined)
  const [docs, setDocs] = useState<AdminDocument[]>([])
  const [acc, setAcc] = useState<AdminAcceptance[]>([])
  const [audit, setAudit] = useState<AuditEntry[]>([])
  const [missing, setMissing] = useState<string[]>([])
  const [complaints, setComplaints] = useState<ShopComplaint[]>([])
  const [dialog, setDialog] = useState<Dialog>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)

  const fetchAll = useCallback(async () => {
    const [r, d, a, l, m, k] = await Promise.all([
      getCompliance(id),
      listDocumentsFor(id),
      listAcceptancesFor(id),
      listAuditFor(id),
      missingFor(id),
      listComplaintsForSupplier(id).catch(() => [] as ShopComplaint[]),
    ])
    return { r, d, a, l, m, k }
  }, [id])
  const apply = useCallback((x: Awaited<ReturnType<typeof fetchAll>>) => {
    setRecord(x.r)
    setDocs(x.d)
    setAcc(x.a)
    setAudit(x.l)
    setMissing(x.m)
    setComplaints(x.k)
  }, [])
  const reload = useCallback(() => fetchAll().then(apply), [fetchAll, apply])

  useEffect(() => {
    let live = true
    fetchAll().then(
      (x) => live && apply(x),
      () => live && setRecord(null),
    )
    return () => {
      live = false
    }
  }, [fetchAll, apply])

  async function run(what: string, pin: string | null, job: () => Promise<unknown>) {
    if (pin && !(await confirmWithPin(pin))) return false
    setBusy(true)
    setMessage(null)
    try {
      await job()
      setMessage({ ok: true, text: what })
      setDialog(null)
      await reload()
      return true
    } catch (e) {
      setMessage({ ok: false, text: e instanceof Error ? e.message : 'That did not work.' })
      return false
    } finally {
      setBusy(false)
    }
  }

  if (record === undefined) return <TruckLoader label="Loading…" />
  if (record === null) return <Card className="text-sm text-muted">No verification record for this account.</Card>

  const r = record
  const name = r.legal_name || '(no name yet)'
  const terminated = !!r.terminated_at
  const complete = missing.length === 0
  const current = docs.filter((d) => !d.replaced_at)
  const history = docs.filter((d) => d.replaced_at)

  async function view(path: string) {
    const w = window.open('', '_blank')
    try {
      const url = await adminDocumentLink(path)
      if (w) w.location.href = url
      else window.location.assign(url)
    } catch {
      w?.close()
      setMessage({ ok: false, text: 'Could not open the document.' })
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title={name} subtitle="Supplier verification" />

      <Card>
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge tone={COMPLIANCE_STATUS_TONE[r.status]}>{COMPLIANCE_STATUS_LABEL[r.status]}</Badge>
          {r.is_applicant && <Badge tone="info">New shop — no account yet</Badge>}
          {r.grandfathered && <Badge tone="neutral">Existing shop (keeps working)</Badge>}
          {terminated && <Badge tone="danger">Agreement terminated {fmt(r.terminated_at)}</Badge>}
          {r.requested_plan && <Badge tone="neutral">Asked for: {r.requested_plan}</Badge>}
        </div>
        {r.correction_reason && r.status === 'PENDING' && (
          <p className="mt-3 text-sm text-amber-800 dark:text-amber-300">Correction asked: {r.correction_reason}</p>
        )}
        {r.status === 'REJECTED' && r.decision_reason && <p className="mt-3 text-sm text-red-700 dark:text-red-300">Rejected: {r.decision_reason}</p>}
        {r.status === 'SUSPENDED' && (
          <p className="mt-3 text-sm text-red-700 dark:text-red-300">
            Suspended {fmt(r.suspended_at)}: {SUSPENSION_REASONS.find((x) => x.code === r.suspension_code)?.label ?? r.suspension_code}
            {r.suspension_note ? ` — ${r.suspension_note}` : ''}
          </p>
        )}
        {terminated && (
          <p className="mt-1 text-sm text-red-700 dark:text-red-300">
            Termination: {r.termination_reason}
            {r.termination_notes ? ` (${r.termination_notes})` : ''}
          </p>
        )}
        {!complete && r.status !== 'APPROVED' && (
          <p className="mt-3 text-sm text-muted">Still missing: {missingWords(missing)}</p>
        )}
        {r.mobile && (
          <div className="mt-4 flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={() => window.location.assign(`tel:${r.mobile}`)}>
              <Phone size={15} /> Call
            </Button>
            <Button size="sm" variant="outline" onClick={() => openWhatsAppShare(r.mobile!, `Hi ${r.contact_name ?? ''}, this is BuildSupply about your verification.`)}>
              <WhatsAppIcon size={15} /> WhatsApp
            </Button>
          </div>
        )}
      </Card>

      {message && (
        <p className={message.ok ? 'text-sm font-medium text-accent-text' : 'text-sm text-red-600 dark:text-red-400'}>{message.text}</p>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Decisions</CardTitle>
        </CardHeader>
        <div className="flex flex-wrap gap-2">
          {r.is_applicant && !terminated && (
            <Button disabled={busy || !complete} onClick={() => setDialog({ kind: 'accept' })}>
              Accept application
            </Button>
          )}
          {!r.is_applicant && r.status !== 'APPROVED' && r.status !== 'SUSPENDED' && (
            <Button
              disabled={busy || !complete}
              onClick={() => void run('Approved.', `approve the KYC of ${name}`, () => decide(r.user_id, 'approve'))}
            >
              Approve
            </Button>
          )}
          {(r.status === 'PENDING' || r.status === 'UNDER_REVIEW') && (
            <>
              <Button variant="outline" disabled={busy} onClick={() => setDialog({ kind: 'reason', action: 'request_correction' })}>
                Ask for a correction
              </Button>
              <Button variant="outline" disabled={busy} onClick={() => setDialog({ kind: 'reason', action: 'reject' })}>
                Reject
              </Button>
            </>
          )}
          {!r.is_applicant && r.status !== 'SUSPENDED' && !terminated && (
            <Button variant="outline" disabled={busy} onClick={() => setDialog({ kind: 'suspend' })}>
              Suspend online orders
            </Button>
          )}
          {r.status === 'SUSPENDED' && !terminated && (
            <Button variant="outline" disabled={busy} onClick={() => void run('Reinstated.', `reinstate ${name}`, () => decide(r.user_id, 'reinstate'))}>
              Reinstate
            </Button>
          )}
          {!r.is_applicant && !terminated && (
            <Button variant="danger" disabled={busy} onClick={() => setDialog({ kind: 'terminate' })}>
              Terminate agreement
            </Button>
          )}
        </div>
        {(r.is_applicant || r.status === 'UNDER_REVIEW') && !complete && (
          <p className="mt-2 text-xs text-muted">Accepting or approving opens once everything required is in.</p>
        )}
        <p className="mt-3 text-xs text-muted">
          Suspending here pauses online orders only — the shop keeps its login and records. Blocking a login entirely is
          still Suspend on the supplier&rsquo;s own admin page.
        </p>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Business details</CardTitle>
        </CardHeader>
        <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
          <Row k="Registered name" v={r.legal_name} />
          <Row k="Contact person" v={r.contact_name} />
          <Row k="Mobile" v={r.mobile} />
          <Row k="Email (login)" v={r.email} />
          <Row k="Address" v={[r.address, r.district, r.state, r.pin_code].filter(Boolean).join(', ')} wide />
          <Row k="Type" v={r.business_type ? `${TYPE_LABEL[r.business_type]}${r.business_type_other ? ` — ${r.business_type_other}` : ''}` : null} />
          <Row k="PAN" v={r.pan} />
          <Row k="GSTIN" v={r.gstin} />
          <Row k="Other registration" v={r.registration_details} wide />
          <Row k="Sent for review" v={fmt(r.submitted_at)} />
          <Row k="Last decision" v={fmt(r.decided_at)} />
        </dl>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Documents</CardTitle>
        </CardHeader>
        {current.length === 0 ? (
          <p className="text-sm text-muted">No documents yet.</p>
        ) : (
          <div className="flex flex-col divide-y divide-border">
            {current.map((d) => (
              <div key={d.id} className="flex flex-wrap items-center justify-between gap-2 py-3 first:pt-0 last:pb-0">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-ink">{DOC_LABEL[d.doc_type] ?? d.doc_type}</p>
                  <p className="truncate text-xs text-muted">
                    {d.file_name} · {(d.size_bytes / 1024).toFixed(0)} KB · {fmt(d.uploaded_at)}
                  </p>
                  {d.review_note && <p className="text-xs text-muted">Note: {d.review_note}</p>}
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  <Badge tone={d.review_status === 'accepted' ? 'success' : d.review_status === 'rejected' ? 'danger' : 'neutral'}>
                    {d.review_status === 'pending' ? 'Not checked' : d.review_status === 'accepted' ? 'Accepted' : 'Not accepted'}
                  </Badge>
                  <Button size="sm" variant="ghost" onClick={() => void view(d.storage_path)}>
                    <FileText size={15} /> View
                  </Button>
                  <Button size="sm" variant="outline" disabled={busy} onClick={() => setDialog({ kind: 'doc', doc: d, status: 'accepted' })}>
                    Accept
                  </Button>
                  <Button size="sm" variant="outline" disabled={busy} onClick={() => setDialog({ kind: 'doc', doc: d, status: 'rejected' })}>
                    Not OK
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
        {history.length > 0 && (
          <details className="mt-3 text-sm">
            <summary className="cursor-pointer text-muted">Earlier uploads ({history.length})</summary>
            <ul className="mt-2 flex flex-col gap-1">
              {history.map((d) => (
                <li key={d.id} className="flex flex-wrap items-center gap-2 text-xs text-muted">
                  <span>{DOC_LABEL[d.doc_type] ?? d.doc_type}</span>
                  <span className="truncate">{d.file_name}</span>
                  <span>{fmt(d.uploaded_at)}</span>
                  <button type="button" className="font-semibold text-accent-text" onClick={() => void view(d.storage_path)}>
                    View
                  </button>
                </li>
              ))}
            </ul>
          </details>
        )}
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Agreement and declarations accepted</CardTitle>
        </CardHeader>
        {acc.length === 0 ? (
          <p className="text-sm text-muted">Nothing accepted yet.</p>
        ) : (
          <div className="flex flex-col gap-2 text-sm">
            {acc.map((a) => (
              <div key={a.id} className="rounded-lg border border-border p-2.5">
                <p className="font-medium text-ink">
                  {a.compliance_texts?.title ?? `${a.kind} ${a.text_key}`} <span className="text-xs text-muted">· version {a.version}</span>
                </p>
                <p className="text-xs text-muted">
                  {fmt(a.accepted_at)} · address code {a.ip_hash ? `${a.ip_hash.slice(0, 12)}…` : 'not recorded'}
                </p>
                {a.user_agent && <p className="truncate text-xs text-muted">Device: {a.user_agent}</p>}
              </div>
            ))}
          </div>
        )}
      </Card>

      {!r.is_applicant && (
        <Card>
          <CardHeader>
            <CardTitle>
              Customer complaints
              {complaints.length > 0 &&
                ` · ${complaints.filter((c) => c.status === 'open' || c.status === 'in_progress').length} open of ${complaints.length}`}
            </CardTitle>
          </CardHeader>
          {complaints.length === 0 ? (
            <p className="text-sm text-muted">None.</p>
          ) : (
            <div className="flex flex-col gap-2 text-sm">
              {complaints.map((c) => (
                <div key={c.id} className="rounded-lg border border-border p-2.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-medium text-ink">
                      {COMPLAINT_LABEL[c.category] ?? c.category} · Bill {c.invoice_no}
                      {c.customers ? ` · ${c.customers.name}` : ''}
                    </span>
                    <Badge tone={c.status === 'resolved' || c.status === 'closed' ? 'success' : c.status === 'in_progress' ? 'info' : 'warning'}>
                      {c.status.replace('_', ' ')}
                    </Badge>
                  </div>
                  <p className="mt-1 whitespace-pre-line text-ink">{c.description}</p>
                  {c.supplier_response && <p className="mt-1 text-muted">Shop replied: {c.supplier_response}</p>}
                  <p className="mt-1 text-xs text-muted">{fmt(c.created_at)}</p>
                </div>
              ))}
            </div>
          )}
          <p className="mt-3 text-xs text-muted">Read-only here: the shop answers its own complaints. Repeated or unresolved ones are a reason you may suspend online orders.</p>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>History</CardTitle>
        </CardHeader>
        <ol className="flex flex-col gap-2 text-sm">
          {audit.map((e) => (
            <li key={e.id} className="flex flex-wrap items-baseline justify-between gap-x-3">
              <span className="text-ink">
                {ACTION_LABEL[e.action] ?? e.action}
                {e.prev_status && e.new_status && e.prev_status !== e.new_status ? ` (${e.prev_status} → ${e.new_status})` : ''}
                {typeof e.details?.reason === 'string' ? ` — ${e.details.reason}` : ''}
                <span className="text-xs text-muted"> · by {e.actor_role}</span>
              </span>
              <span className="text-xs text-muted">{fmt(e.created_at)}</span>
            </li>
          ))}
        </ol>
      </Card>

      {dialog?.kind === 'accept' && (
        <AcceptDialog
          record={r}
          busy={busy}
          onClose={() => setDialog(null)}
          onAccept={(plan, cycle, start, expiry) =>
            run(`Accepted. ${name} can now use BuildSupply.`, `accept ${name} as a supplier`, () => acceptApplication(r.user_id, plan, cycle, start, expiry))
          }
        />
      )}
      {dialog?.kind === 'reason' && (
        <TextDialog
          title={dialog.action === 'reject' ? 'Reject' : 'Ask for a correction'}
          label={dialog.action === 'reject' ? 'Why (the shop sees this)' : 'What needs correcting (the shop sees this)'}
          busy={busy}
          onClose={() => setDialog(null)}
          onSubmit={(text) =>
            run(dialog.action === 'reject' ? 'Rejected.' : 'Correction asked.', dialog.action === 'reject' ? `reject ${name}` : null, () =>
              decide(r.user_id, dialog.action, text),
            )
          }
        />
      )}
      {dialog?.kind === 'suspend' && (
        <SuspendDialog
          busy={busy}
          onClose={() => setDialog(null)}
          onSubmit={(code, note) => run('Suspended. Online orders are off.', `suspend online orders for ${name}`, () => decide(r.user_id, 'suspend', note, code))}
        />
      )}
      {dialog?.kind === 'terminate' && (
        <TerminateDialog
          name={name}
          busy={busy}
          onClose={() => setDialog(null)}
          onSubmit={(reason, notes) => run('Agreement terminated.', `terminate the agreement with ${name}`, () => decide(r.user_id, 'terminate', reason, undefined, notes))}
        />
      )}
      {dialog?.kind === 'doc' && (
        <TextDialog
          title={dialog.status === 'accepted' ? `Accept ${DOC_LABEL[dialog.doc.doc_type] ?? 'document'}` : `Not OK: ${DOC_LABEL[dialog.doc.doc_type] ?? 'document'}`}
          label={dialog.status === 'accepted' ? 'Note (optional)' : 'What is wrong (the shop sees this)'}
          optional={dialog.status === 'accepted'}
          busy={busy}
          onClose={() => setDialog(null)}
          onSubmit={(text) => run('Document reviewed.', null, () => reviewDocument(dialog.doc.id, dialog.status, text))}
        />
      )}
    </div>
  )
}

function Row({ k, v, wide }: { k: string; v: ReactNode; wide?: boolean }) {
  return (
    <div className={wide ? 'sm:col-span-2' : undefined}>
      <dt className="text-xs text-muted">{k}</dt>
      <dd className="break-words text-ink">{v || '—'}</dd>
    </div>
  )
}

function AcceptDialog({
  record,
  busy,
  onClose,
  onAccept,
}: {
  record: ComplianceRecord
  busy: boolean
  onClose: () => void
  onAccept: (plan: 'starter' | 'pro', cycle: 'monthly' | 'yearly', start: string, expiry: string) => Promise<boolean>
}) {
  const s = suggested(record)
  const [choice, setChoice] = useState<PlanChoice>(s.choice)
  const [start, setStart] = useState(s.start)
  const [expiry, setExpiry] = useState(s.expiry)
  const p = PLAN_CHOICES.find((x) => x.id === choice)!
  const bad = !start || !expiry || expiry < start
  return (
    <Modal title="Accept application" onClose={onClose}>
      <div className="flex flex-col gap-3">
        <p className="text-sm text-muted">
          Their shop account is created now, with this plan and these dates. Only accept once they have paid.
          {record.requested_plan === 'trial' ? ` They asked for the ${TRIAL_DAYS}-day free trial (Pro with a short expiry).` : ''}
        </p>
        <div>
          <Label htmlFor="acc-plan">Plan</Label>
          <select
            id="acc-plan"
            value={choice}
            onChange={(e) => setChoice(e.target.value as PlanChoice)}
            className="h-10 w-full rounded-lg border border-border bg-card px-3 text-sm text-ink"
          >
            {PLAN_CHOICES.map((x) => (
              <option key={x.id} value={x.id}>
                {x.label} — ₹{x.price.toLocaleString('en-IN')}/{x.period}
              </option>
            ))}
          </select>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="acc-start">Starts</Label>
            <Input id="acc-start" type="date" value={start} onChange={(e) => setStart(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="acc-exp">Expires</Label>
            <Input id="acc-exp" type="date" value={expiry} onChange={(e) => setExpiry(e.target.value)} />
          </div>
        </div>
        {bad && <p className="text-xs text-red-600">The expiry must be on or after the start.</p>}
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={busy || bad} onClick={() => void onAccept(p.plan, p.cycle, start, expiry)}>
            {busy ? 'Accepting…' : 'Accept'}
          </Button>
        </div>
      </div>
    </Modal>
  )
}

function TextDialog({
  title,
  label,
  optional = false,
  busy,
  onClose,
  onSubmit,
}: {
  title: string
  label: string
  optional?: boolean
  busy: boolean
  onClose: () => void
  onSubmit: (text: string) => Promise<boolean>
}) {
  const [text, setText] = useState('')
  const ok = optional || text.trim().length >= 3
  return (
    <Modal title={title} onClose={onClose}>
      <div className="flex flex-col gap-3">
        <div>
          <Label htmlFor="td-text">{label}</Label>
          <textarea
            id="td-text"
            value={text}
            maxLength={1000}
            onChange={(e) => setText(e.target.value)}
            className="min-h-24 w-full rounded-lg border border-border bg-card p-3 text-sm text-ink"
          />
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={busy || !ok} onClick={() => void onSubmit(text)}>
            {busy ? 'Saving…' : 'Confirm'}
          </Button>
        </div>
      </div>
    </Modal>
  )
}

function SuspendDialog({ busy, onClose, onSubmit }: { busy: boolean; onClose: () => void; onSubmit: (code: string, note: string) => Promise<boolean> }) {
  const [code, setCode] = useState('')
  const [note, setNote] = useState('')
  const ok = !!code && (code !== 'other' || note.trim().length >= 3)
  return (
    <Modal title="Suspend online orders" onClose={onClose}>
      <div className="flex flex-col gap-3">
        <p className="text-sm text-muted">The shop keeps its login and records and sees the reason. Online ordering is switched off and stays off until you reinstate them.</p>
        <div>
          <Label htmlFor="sus-code">Reason</Label>
          <select id="sus-code" value={code} onChange={(e) => setCode(e.target.value)} className="h-10 w-full rounded-lg border border-border bg-card px-3 text-sm text-ink">
            <option value="">Choose…</option>
            {SUSPENSION_REASONS.map((x) => (
              <option key={x.code} value={x.code}>
                {x.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <Label htmlFor="sus-note">Note {code === 'other' ? '(needed)' : '(optional — the shop sees this)'}</Label>
          <textarea id="sus-note" value={note} maxLength={1000} onChange={(e) => setNote(e.target.value)} className="min-h-20 w-full rounded-lg border border-border bg-card p-3 text-sm text-ink" />
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={busy || !ok} onClick={() => void onSubmit(code, note)}>
            {busy ? 'Saving…' : 'Suspend'}
          </Button>
        </div>
      </div>
    </Modal>
  )
}

function TerminateDialog({ name, busy, onClose, onSubmit }: { name: string; busy: boolean; onClose: () => void; onSubmit: (reason: string, notes: string) => Promise<boolean> }) {
  const [reason, setReason] = useState('')
  const [notes, setNotes] = useState('')
  const [typed, setTyped] = useState('')
  const ok = reason.trim().length >= 3 && typed.trim() === name.trim()
  return (
    <Modal title="Terminate agreement" onClose={onClose}>
      <div className="flex flex-col gap-3">
        <p className="text-sm text-muted">
          Permanent: the agreement ends and online orders stay off; it cannot be reinstated. The shop&rsquo;s records are
          kept. This does not delete or block their login.
        </p>
        <div>
          <Label htmlFor="ter-reason">Reason</Label>
          <Input id="ter-reason" value={reason} maxLength={1000} onChange={(e) => setReason(e.target.value)} />
        </div>
        <div>
          <Label htmlFor="ter-notes">Internal notes (optional)</Label>
          <textarea id="ter-notes" value={notes} maxLength={2000} onChange={(e) => setNotes(e.target.value)} className="min-h-20 w-full rounded-lg border border-border bg-card p-3 text-sm text-ink" />
        </div>
        <div>
          <Label htmlFor="ter-name">Type the shop&rsquo;s name to confirm: {name}</Label>
          <Input id="ter-name" value={typed} onChange={(e) => setTyped(e.target.value)} />
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="danger" disabled={busy || !ok} onClick={() => void onSubmit(reason, notes)}>
            {busy ? 'Saving…' : 'Terminate'}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
