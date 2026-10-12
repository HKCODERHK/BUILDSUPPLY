import { useCallback, useEffect, useRef, useState, type ChangeEvent, type FormEvent, type ReactNode } from 'react'
import { CheckCircle2, ChevronDown, FileText, LoaderCircle, Upload } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { PhoneInput } from '@/components/ui/phone-input'
import { TruckLoader } from '@/components/TruckLoader'
import { useLanguage } from '@/context/LanguageContext'
import type { TranslationKey } from '@/lib/i18n'
import { cn } from '@/lib/utils'
import {
  KYC_MAX_BYTES,
  KYC_TYPES,
  acceptText,
  documentLink,
  listActiveTexts,
  listMyAcceptances,
  listMyDocuments,
  listRequirements,
  missingItems,
  saveComplianceDetails,
  submitCompliance,
  uploadDocument,
  type Acceptance,
  type BusinessType,
  type ComplianceDetails,
  type ComplianceDocument,
  type ComplianceRecord,
  type ComplianceStatus,
  type LegalText,
  type Requirement,
} from '@/services/compliance'

/**
 * The verification steps (migration 045), one screen for both a new shop's
 * application and an existing supplier's KYC: business details, documents,
 * the Supplier Agreement and the declarations, then "Send to BuildSupply".
 * Editable only while the record is PENDING or REJECTED — the database
 * refuses anything else anyway. The legal texts come from the database and
 * stay in English, like every legal document in the app.
 */

const PAN = /^[A-Z]{5}[0-9]{4}[A-Z]$/
const GSTIN = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/
const PIN = /^[1-9][0-9]{5}$/
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const TYPES: BusinessType[] = ['proprietor', 'partnership', 'llp', 'private_limited', 'other']
// Document types with a name in all three languages; any other the admin
// adds later shows the label stored with it.
const NAMED_DOCS = new Set(['pan', 'address_proof', 'gst_certificate', 'business_registration', 'licence'])
const docLabel = (t: (k: TranslationKey) => string, type: string, fallback?: string) =>
  NAMED_DOCS.has(type) ? t(`kyc.d.${type}` as TranslationKey) : fallback || type

const STATUS_TONE: Record<ComplianceStatus, 'success' | 'warning' | 'danger' | 'neutral' | 'info'> = {
  PENDING: 'warning',
  UNDER_REVIEW: 'info',
  APPROVED: 'success',
  REJECTED: 'danger',
  SUSPENDED: 'danger',
}

const fmtDate = (iso: string) => new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })

type Form = Record<keyof ComplianceDetails, string>
const toForm = (r: ComplianceRecord): Form => ({
  legal_name: r.legal_name ?? '',
  contact_name: r.contact_name ?? '',
  mobile: r.mobile ?? '',
  email: r.email ?? '',
  address: r.address ?? '',
  district: r.district ?? '',
  state: r.state ?? '',
  pin_code: r.pin_code ?? '',
  business_type: r.business_type ?? '',
  business_type_other: r.business_type_other ?? '',
  pan: r.pan ?? '',
  gstin: r.gstin ?? '',
  registration_details: r.registration_details ?? '',
})

interface KycData {
  reqs: Requirement[]
  docs: ComplianceDocument[]
  texts: LegalText[]
  accepted: Acceptance[]
  missing: string[]
}

async function loadKyc(userId: string, editable: boolean): Promise<KycData> {
  const [reqs, docs, texts, accepted] = await Promise.all([
    listRequirements(),
    listMyDocuments(userId),
    listActiveTexts(),
    listMyAcceptances(userId),
  ])
  return { reqs, docs, texts, accepted, missing: editable ? await missingItems() : [] }
}

export function ComplianceForm({
  record,
  onChanged,
  lockEmail = false,
}: {
  record: ComplianceRecord
  /** Re-reads the record after anything that may have moved its status. */
  onChanged: () => Promise<void> | void
  /** An applicant's email is their login; it is not edited here. */
  lockEmail?: boolean
}) {
  const { t } = useLanguage()
  const editable = record.status === 'PENDING' || record.status === 'REJECTED'
  const [reqs, setReqs] = useState<Requirement[]>([])
  const [docs, setDocs] = useState<ComplianceDocument[]>([])
  const [texts, setTexts] = useState<LegalText[]>([])
  const [accepted, setAccepted] = useState<Acceptance[]>([])
  const [missing, setMissing] = useState<string[]>([])
  const [loaded, setLoaded] = useState(false)
  const [loadFailed, setLoadFailed] = useState(false)

  const apply = useCallback((d: KycData) => {
    setReqs(d.reqs)
    setDocs(d.docs)
    setTexts(d.texts)
    setAccepted(d.accepted)
    setMissing(d.missing)
    setLoadFailed(false)
    setLoaded(true)
  }, [])
  const fail = useCallback(() => {
    setLoadFailed(true)
    setLoaded(true)
  }, [])
  const reload = useCallback(
    () => loadKyc(record.user_id, editable).then(apply, fail),
    [record.user_id, editable, apply, fail],
  )

  useEffect(() => {
    let live = true
    loadKyc(record.user_id, editable).then(
      (d) => live && apply(d),
      () => live && fail(),
    )
    return () => {
      live = false
    }
  }, [record.user_id, editable, apply, fail])

  if (!loaded) return <TruckLoader />
  if (loadFailed) {
    return (
      <Card>
        <p className="text-sm text-red-600 dark:text-red-400">{t('kyc.failed')}</p>
        <Button className="mt-3" variant="outline" onClick={() => void reload()}>
          {t('account.retry')}
        </Button>
      </Card>
    )
  }

  const agreement = texts.find((x) => x.kind === 'agreement')
  const declarations = texts.filter((x) => x.kind === 'declaration')
  const acceptedIds = new Set(accepted.map((a) => a.text_id))
  const detailsDone = !missing.some((m) => !m.includes(':'))
  const docsDone = !missing.some((m) => m.startsWith('doc:'))

  return (
    <div className="flex flex-col gap-4">
      <StatusCard record={record} />

      <Step n={1} title={t('kyc.step1')} done={editable ? detailsDone : true}>
        <DetailsForm record={record} editable={editable} lockEmail={lockEmail} onSaved={async () => { await onChanged(); await reload() }} />
      </Step>

      <Step n={2} title={t('kyc.step2')} done={editable ? docsDone : true}>
        <p className="mb-3 text-xs text-muted">{t('kyc.docHint')}</p>
        <div className="flex flex-col divide-y divide-border">
          {reqs.map((q) => (
            <DocumentRow
              key={q.doc_type}
              userId={record.user_id}
              req={q}
              doc={docs.find((d) => d.doc_type === q.doc_type) ?? null}
              editable={editable}
              onUploaded={reload}
            />
          ))}
        </div>
      </Step>

      {agreement && (
        <Step n={3} title={t('kyc.step3')} done={acceptedIds.has(agreement.id)}>
          <AgreementBlock text={agreement} accepted={accepted.find((a) => a.text_id === agreement.id) ?? null} onAccepted={reload} />
        </Step>
      )}

      {declarations.length > 0 && (
        <Step n={4} title={t('kyc.step4')} done={declarations.every((d) => acceptedIds.has(d.id))}>
          <DeclarationsBlock texts={declarations} acceptedIds={acceptedIds} onAccepted={reload} />
        </Step>
      )}

      {editable && <SubmitBlock missing={missing} reqs={reqs} onSubmitted={async () => { await onChanged(); await reload() }} />}
    </div>
  )
}

/** The status at the top, with whatever BuildSupply said. */
export function StatusCard({ record }: { record: ComplianceRecord }) {
  const { t } = useLanguage()
  const s = record.status
  const note =
    s === 'UNDER_REVIEW' ? t('kyc.reviewNote')
    : s === 'APPROVED' ? t('kyc.approvedNote')
    : s === 'SUSPENDED' ? t('kyc.suspendedNote')
    : s === 'PENDING' && !record.correction_reason ? t('kyc.intro')
    : null
  const reason =
    s === 'SUSPENDED'
      ? record.suspension_note || (record.suspension_code ? t(`kyc.code.${record.suspension_code}` as TranslationKey) : null)
      : s === 'REJECTED'
        ? record.decision_reason
        : null
  return (
    <Card className={cn(s === 'SUSPENDED' || s === 'REJECTED' ? 'border-red-200 dark:border-red-900' : '')}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-semibold text-ink">{t('kyc.title')}</h2>
        <Badge tone={STATUS_TONE[s]}>{t(`kyc.st.${s}` as TranslationKey)}</Badge>
      </div>
      {note && <p className="mt-2 text-sm text-muted">{note}</p>}
      {record.correction_reason && s === 'PENDING' && (
        <div className="mt-3 rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
          <p className="font-semibold">{t('kyc.correction')}</p>
          <p className="mt-1 whitespace-pre-line">{record.correction_reason}</p>
        </div>
      )}
      {reason && <p className="mt-2 text-sm font-medium text-red-700 dark:text-red-300">{t('kyc.reason', { reason })}</p>}
    </Card>
  )
}

function Step({ n, title, done, children }: { n: number; title: string; done: boolean; children: ReactNode }) {
  const { t } = useLanguage()
  return (
    <Card>
      <div className="mb-4 flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-base font-semibold text-ink">
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent-bg text-xs font-bold text-accent-text">{n}</span>
          {title}
        </h3>
        {done && (
          <span className="flex items-center gap-1 text-xs font-semibold text-accent-text">
            <CheckCircle2 size={15} /> {t('kyc.done')}
          </span>
        )}
      </div>
      {children}
    </Card>
  )
}

function DetailsForm({
  record,
  editable,
  lockEmail,
  onSaved,
}: {
  record: ComplianceRecord
  editable: boolean
  lockEmail: boolean
  onSaved: () => Promise<void>
}) {
  const { t } = useLanguage()
  const [f, setF] = useState<Form>(() => toForm(record))
  const [touched, setTouched] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // A record re-read after a save or a status change resets the boxes only
  // when the person has not typed since.
  const lastRecord = useRef(record)
  useEffect(() => {
    if (lastRecord.current !== record && !touched) setF(toForm(record))
    lastRecord.current = record
  }, [record, touched])

  const set = (k: keyof Form) => (v: string) => {
    setTouched(true)
    setSaved(false)
    setF((prev) => ({ ...prev, [k]: v }))
  }
  const upper = (k: keyof Form) => (e: ChangeEvent<HTMLInputElement>) => set(k)(e.target.value.toUpperCase().replace(/\s/g, ''))

  const bad: Partial<Record<keyof Form, string>> = {}
  if (f.pan && !PAN.test(f.pan)) bad.pan = t('kyc.bad.pan')
  if (f.gstin && !GSTIN.test(f.gstin)) bad.gstin = t('kyc.bad.gstin')
  if (f.pin_code && !PIN.test(f.pin_code)) bad.pin_code = t('kyc.bad.pin')
  if (f.mobile && !/^[0-9]{10}$/.test(f.mobile)) bad.mobile = t('kyc.bad.mobile')
  if (f.email && !EMAIL.test(f.email)) bad.email = t('kyc.bad.email')
  for (const k of ['legal_name', 'contact_name', 'district', 'state'] as const) if (f[k] && f[k].trim().length < 2) bad[k] = t('kyc.bad.short')
  if (f.address && f.address.trim().length < 5) bad.address = t('kyc.bad.short')

  async function save(e: FormEvent) {
    e.preventDefault()
    if (Object.keys(bad).length) return
    setSaving(true)
    setError(null)
    const val = (v: string) => (v.trim() ? v.trim() : null)
    try {
      await saveComplianceDetails(record.user_id, {
        legal_name: val(f.legal_name),
        contact_name: val(f.contact_name),
        mobile: val(f.mobile),
        ...(lockEmail ? {} : { email: val(f.email) }),
        address: val(f.address),
        district: val(f.district),
        state: val(f.state),
        pin_code: val(f.pin_code),
        business_type: (val(f.business_type) as BusinessType | null) ?? null,
        business_type_other: f.business_type === 'other' ? val(f.business_type_other) : null,
        pan: val(f.pan),
        gstin: val(f.gstin),
        registration_details: val(f.registration_details),
      })
      setTouched(false)
      setSaved(true)
      await onSaved()
    } catch {
      setError(t('kyc.saveFailed'))
    } finally {
      setSaving(false)
    }
  }

  const field = (k: keyof Form, label: TranslationKey, input: ReactNode) => (
    <div>
      <Label htmlFor={`kyc-${k}`}>{t(label)}</Label>
      {input}
      {bad[k] && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{bad[k]}</p>}
    </div>
  )
  const text = (k: keyof Form, label: TranslationKey, extra: Record<string, unknown> = {}) =>
    field(k, label, <Input id={`kyc-${k}`} value={f[k]} disabled={!editable} onChange={(e) => set(k)(e.target.value)} {...extra} />)

  return (
    <form onSubmit={save} className="grid gap-3 sm:grid-cols-2">
      {text('legal_name', 'kyc.f.legal', { maxLength: 200, autoComplete: 'organization' })}
      {text('contact_name', 'kyc.f.contact', { maxLength: 120, autoComplete: 'name' })}
      {field('mobile', 'kyc.f.mobile', <PhoneInput id="kyc-mobile" value={f.mobile} disabled={!editable} onValueChange={set('mobile')} />)}
      {text('email', 'kyc.f.email', { type: 'email', maxLength: 254, disabled: !editable || lockEmail })}
      <div className="sm:col-span-2">{text('address', 'kyc.f.address', { maxLength: 500, autoComplete: 'street-address' })}</div>
      {text('district', 'kyc.f.district', { maxLength: 80 })}
      {text('state', 'kyc.f.state', { maxLength: 80 })}
      {text('pin_code', 'kyc.f.pin', { inputMode: 'numeric', maxLength: 6, onChange: (e: ChangeEvent<HTMLInputElement>) => set('pin_code')(e.target.value.replace(/\D/g, '')) })}
      {field(
        'business_type',
        'kyc.f.type',
        <select
          id="kyc-business_type"
          value={f.business_type}
          disabled={!editable}
          onChange={(e) => set('business_type')(e.target.value)}
          className="h-10 w-full rounded-lg border border-border bg-card px-3 text-sm text-ink disabled:opacity-60"
        >
          <option value="">{t('kyc.choose')}</option>
          {TYPES.map((ty) => (
            <option key={ty} value={ty}>
              {t(`kyc.t.${ty}` as TranslationKey)}
            </option>
          ))}
        </select>,
      )}
      {f.business_type === 'other' && text('business_type_other', 'kyc.f.typeOther', { maxLength: 80 })}
      {text('pan', 'kyc.f.pan', { maxLength: 10, autoCapitalize: 'characters', onChange: upper('pan') })}
      {text('gstin', 'kyc.f.gstin', { maxLength: 15, autoCapitalize: 'characters', onChange: upper('gstin') })}
      <div className="sm:col-span-2">{text('registration_details', 'kyc.f.reg', { maxLength: 500 })}</div>
      {editable && (
        <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
          <Button type="submit" disabled={saving || !touched || Object.keys(bad).length > 0}>
            {saving ? t('common.saving') : t('kyc.saveDetails')}
          </Button>
          {saved && <span className="text-sm font-medium text-accent-text">{t('kyc.saved')}</span>}
          {error && <span className="text-sm text-red-600 dark:text-red-400">{error}</span>}
        </div>
      )}
    </form>
  )
}

function DocumentRow({
  userId,
  req,
  doc,
  editable,
  onUploaded,
}: {
  userId: string
  req: Requirement
  doc: ComplianceDocument | null
  editable: boolean
  onUploaded: () => Promise<void>
}) {
  const { t } = useLanguage()
  const input = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const label = docLabel(t, req.doc_type, req.label)

  async function choose(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setError(null)
    if (!KYC_TYPES.includes(file.type)) return setError(t('kyc.bad.type'))
    if (file.size > KYC_MAX_BYTES) return setError(t('kyc.bad.size'))
    setBusy(true)
    try {
      await uploadDocument(userId, req.doc_type, file)
      await onUploaded()
    } catch (err) {
      const m = err instanceof Error ? err.message : ''
      setError(m === 'type' ? t('kyc.bad.type') : m === 'size' ? t('kyc.bad.size') : t('kyc.uploadFailed'))
    } finally {
      setBusy(false)
    }
  }

  async function view() {
    if (!doc) return
    // Opened first, then pointed at the link, so a phone does not treat it as
    // a pop-up once the link has taken a moment to arrive.
    const w = window.open('', '_blank')
    try {
      const url = await documentLink(doc.storage_path)
      if (w) w.location.href = url
      else window.location.assign(url)
    } catch {
      w?.close()
      setError(t('kyc.failed'))
    }
  }

  const tone = doc?.review_status === 'accepted' ? 'success' : doc?.review_status === 'rejected' ? 'danger' : 'neutral'
  return (
    <div className="py-3 first:pt-0 last:pb-0">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-medium text-ink">{label}</p>
          <p className="text-xs text-muted">{t(req.required ? 'kyc.required' : 'kyc.optional')}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {doc && (
            <Button type="button" size="sm" variant="ghost" onClick={() => void view()}>
              <FileText size={15} /> {t('kyc.view')}
            </Button>
          )}
          {editable && (
            <>
              <input ref={input} type="file" accept={KYC_TYPES.join(',')} className="hidden" onChange={choose} />
              <Button type="button" size="sm" variant={doc ? 'outline' : 'primary'} disabled={busy} onClick={() => input.current?.click()}>
                {busy ? <LoaderCircle size={15} className="animate-spin" /> : <Upload size={15} />}
                {busy ? t('kyc.uploading') : t(doc ? 'kyc.replace' : 'kyc.upload')}
              </Button>
            </>
          )}
        </div>
      </div>
      {doc && (
        <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-muted">
          <Badge tone={tone}>{t(`kyc.doc.${doc.review_status}` as TranslationKey)}</Badge>
          <span className="min-w-0 truncate">{doc.file_name}</span>
          <span>{fmtDate(doc.uploaded_at)}</span>
        </div>
      )}
      {doc?.review_note && doc.review_status === 'rejected' && (
        <p className="mt-1 text-xs text-red-600 dark:text-red-400">{doc.review_note}</p>
      )}
      {error && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{error}</p>}
    </div>
  )
}

function AgreementBlock({
  text,
  accepted,
  onAccepted,
}: {
  text: LegalText
  accepted: Acceptance | null
  onAccepted: () => Promise<void>
}) {
  const { t } = useLanguage()
  const [open, setOpen] = useState(!accepted)
  const [ticked, setTicked] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function accept() {
    setBusy(true)
    setError(null)
    try {
      await acceptText(text.id)
      await onAccepted()
    } catch {
      setError(t('kyc.failed'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      <p className="mb-2 text-xs text-muted">{t('kyc.legalEnglish')}</p>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-2 rounded-xl border border-border px-3 py-2.5 text-left text-sm font-medium text-ink hover:bg-surface"
        aria-expanded={open}
      >
        <span className="min-w-0">{text.title}</span>
        <ChevronDown size={16} className={cn('shrink-0 transition-transform', open && 'rotate-180')} />
      </button>
      {open && (
        <div lang="en" className="vh-cap-55 mt-2 overflow-y-auto whitespace-pre-line rounded-xl border border-border bg-surface p-3 text-xs leading-relaxed text-ink">
          {text.body}
        </div>
      )}
      {accepted ? (
        <p className="mt-3 flex items-center gap-1.5 text-sm font-medium text-accent-text">
          <CheckCircle2 size={16} /> {t('kyc.acceptedOn', { date: fmtDate(accepted.accepted_at) })}
        </p>
      ) : (
        <div className="mt-3">
          <label className="flex items-start gap-2.5 text-sm text-ink">
            <input type="checkbox" className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--color-accent)]" checked={ticked} onChange={(e) => setTicked(e.target.checked)} />
            <span>{t('kyc.agreeCheck', { v: text.version })}</span>
          </label>
          <Button className="mt-3" disabled={!ticked || busy} onClick={() => void accept()}>
            {busy ? t('common.saving') : t('kyc.accept')}
          </Button>
          {error && <p className="mt-2 text-xs text-red-600 dark:text-red-400">{error}</p>}
        </div>
      )}
    </div>
  )
}

function DeclarationsBlock({
  texts,
  acceptedIds,
  onAccepted,
}: {
  texts: LegalText[]
  acceptedIds: Set<string>
  onAccepted: () => Promise<void>
}) {
  const { t } = useLanguage()
  const [ticked, setTicked] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const open = texts.filter((x) => !acceptedIds.has(x.id))
  const allTicked = open.length > 0 && open.every((x) => ticked.has(x.id))

  async function confirm() {
    setBusy(true)
    setError(null)
    try {
      // One at a time, in order, each its own record.
      for (const x of open) await acceptText(x.id)
      await onAccepted()
    } catch {
      setError(t('kyc.failed'))
      await onAccepted()
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      {open.length > 0 && <p className="mb-3 text-xs text-muted">{t('kyc.declIntro')}</p>}
      <ul className="flex flex-col gap-3" lang="en">
        {texts.map((x) => {
          const done = acceptedIds.has(x.id)
          return (
            <li key={x.id}>
              <label className="flex items-start gap-2.5 text-sm text-ink">
                {done ? (
                  <CheckCircle2 size={17} className="mt-0.5 shrink-0 text-accent" />
                ) : (
                  <input
                    type="checkbox"
                    className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--color-accent)]"
                    checked={ticked.has(x.id)}
                    onChange={(e) =>
                      setTicked((prev) => {
                        const next = new Set(prev)
                        if (e.target.checked) next.add(x.id)
                        else next.delete(x.id)
                        return next
                      })
                    }
                  />
                )}
                <span>{x.body}</span>
              </label>
            </li>
          )
        })}
      </ul>
      {open.length > 0 && (
        <>
          <Button className="mt-4" disabled={!allTicked || busy} onClick={() => void confirm()}>
            {busy ? t('common.saving') : t('kyc.acceptDecl')}
          </Button>
          {error && <p className="mt-2 text-xs text-red-600 dark:text-red-400">{error}</p>}
        </>
      )}
    </div>
  )
}

function SubmitBlock({ missing, reqs, onSubmitted }: { missing: string[]; reqs: Requirement[]; onSubmitted: () => Promise<void> }) {
  const { t } = useLanguage()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  const FIELD: Record<string, TranslationKey> = {
    legal_name: 'kyc.f.legal',
    contact_name: 'kyc.f.contact',
    mobile: 'kyc.f.mobile',
    email: 'kyc.f.email',
    address: 'kyc.f.address',
    district: 'kyc.f.district',
    state: 'kyc.f.state',
    pin_code: 'kyc.f.pin',
    business_type: 'kyc.f.type',
    pan: 'kyc.f.pan',
  }
  const words: string[] = []
  for (const m of missing) {
    let w: string | null = null
    if (FIELD[m]) w = t(FIELD[m])
    else if (m.startsWith('doc:')) {
      const type = m.slice(4)
      w = docLabel(t, type, reqs.find((q) => q.doc_type === type)?.label)
    } else if (m.startsWith('agreement:')) w = t('kyc.miss.agreement')
    else if (m.startsWith('declaration:')) w = t('kyc.miss.declarations')
    if (w && !words.includes(w)) words.push(w)
  }

  async function submit() {
    setBusy(true)
    setError(null)
    try {
      await submitCompliance()
      setDone(true)
      await onSubmitted()
    } catch {
      setError(t('kyc.failed'))
      await onSubmitted()
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card className="border-accent/30">
      {words.length > 0 && <p className="mb-3 text-sm text-muted">{t('kyc.missing', { items: words.join(', ') })}</p>}
      <Button size="lg" className="w-full sm:w-auto" disabled={words.length > 0 || busy} onClick={() => void submit()}>
        {busy ? t('common.saving') : t('kyc.submit')}
      </Button>
      {done && <p className="mt-2 text-sm font-medium text-accent-text">{t('kyc.submitted')}</p>}
      {error && <p className="mt-2 text-sm text-red-600 dark:text-red-400">{error}</p>}
    </Card>
  )
}
