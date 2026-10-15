import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Info } from 'lucide-react'
import { PageHeader } from '@/components/layout/PageHeader'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Modal } from '@/components/ui/modal'
import { TruckLoader } from '@/components/TruckLoader'
import { useAuth } from '@/context/AuthContext'
import { cn } from '@/lib/utils'
import type { ComplianceRecord } from '@/services/compliance'
import {
  COMPLIANCE_STATUS_LABEL as STATUS_LABEL,
  COMPLIANCE_STATUS_TONE as STATUS_TONE,
  listAllCompliance,
  listRetention,
  listTextVersions,
  publishTextVersion,
  saveRetention,
  type RetentionRow,
  type TextVersion,
} from '@/services/adminCompliance'

/**
 * Supplier Compliance (admin, round 3 of the compliance work, 2026-10-13):
 * applications and KYC waiting for a decision, the legal texts suppliers
 * accept, and how long records are meant to be kept. The one new admin
 * screen the user agreed to; every other admin screen is unchanged. English
 * only, like all admin screens.
 */

const DEFAULT_NOTICE =
  'This system records contractual and compliance information but does not itself determine legal liability. Agreement wording should be reviewed by qualified legal counsel before production use.'

type Tab = 'queue' | 'texts' | 'retention'
type Filter = 'action' | 'applications' | 'pending' | 'approved' | 'rejected' | 'suspended' | 'all'

const FILTERS: { id: Filter; label: string; match: (r: ComplianceRecord) => boolean }[] = [
  { id: 'action', label: 'Needs a decision', match: (r) => r.status === 'UNDER_REVIEW' },
  { id: 'applications', label: 'New shops', match: (r) => r.is_applicant },
  { id: 'pending', label: 'KYC not sent', match: (r) => r.status === 'PENDING' },
  { id: 'approved', label: 'Approved', match: (r) => r.status === 'APPROVED' },
  { id: 'rejected', label: 'Rejected', match: (r) => r.status === 'REJECTED' },
  { id: 'suspended', label: 'Suspended', match: (r) => r.status === 'SUSPENDED' },
  { id: 'all', label: 'All', match: () => true },
]

const fmtDate = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'

export default function AdminCompliance() {
  const [params, setParams] = useSearchParams()
  const tab = (['queue', 'texts', 'retention'].includes(params.get('tab') ?? '') ? params.get('tab') : 'queue') as Tab
  const [notice, setNotice] = useState<string>(DEFAULT_NOTICE)

  useEffect(() => {
    listTextVersions()
      .then((v) => {
        const n = v.find((x) => x.kind === 'admin_notice' && x.is_active)
        if (n) setNotice(n.body)
      })
      .catch(() => undefined)
  }, [])

  const tabs: { id: Tab; label: string }[] = [
    { id: 'queue', label: 'Review' },
    { id: 'texts', label: 'Legal texts' },
    { id: 'retention', label: 'Record keeping' },
  ]

  return (
    <div>
      <PageHeader title="Supplier Compliance" subtitle="Applications, KYC, agreements and suspensions" />

      <div className="mb-4 flex items-start gap-2.5 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900 dark:border-blue-900 dark:bg-blue-950 dark:text-blue-200">
        <Info size={17} className="mt-0.5 shrink-0" />
        <p>{notice}</p>
      </div>

      <div className="mb-4 flex gap-1 rounded-xl bg-surface p-1">
        {tabs.map((x) => (
          <button
            key={x.id}
            type="button"
            onClick={() => setParams(x.id === 'queue' ? {} : { tab: x.id }, { replace: true })}
            className={cn(
              'flex-1 rounded-lg px-3 py-2 text-sm font-semibold transition-colors',
              tab === x.id ? 'bg-card text-ink shadow-sm' : 'text-muted hover:text-ink',
            )}
          >
            {x.label}
          </button>
        ))}
      </div>

      {tab === 'queue' && <Queue />}
      {tab === 'texts' && <LegalTexts />}
      {tab === 'retention' && <Retention />}
    </div>
  )
}

function Queue() {
  const [rows, setRows] = useState<ComplianceRecord[] | null>(null)
  const [failed, setFailed] = useState(false)
  const [filter, setFilter] = useState<Filter>('action')
  const [q, setQ] = useState('')

  useEffect(() => {
    listAllCompliance().then(setRows, () => setFailed(true))
  }, [])

  const shown = useMemo(() => {
    if (!rows) return []
    const f = FILTERS.find((x) => x.id === filter)!
    const s = q.trim().toLowerCase()
    return rows.filter(
      (r) =>
        f.match(r) &&
        (!s || [r.legal_name, r.contact_name, r.mobile, r.email].some((v) => v?.toLowerCase().includes(s))),
    )
  }, [rows, filter, q])

  if (failed) return <Card className="text-sm text-red-600">Could not load the records. Reload the page to try again.</Card>
  if (!rows) return <TruckLoader label="Loading…" />

  return (
    <div>
      <div className="mb-3 flex flex-wrap gap-2">
        {FILTERS.map((f) => {
          const n = rows.filter(f.match).length
          return (
            <button
              key={f.id}
              type="button"
              onClick={() => setFilter(f.id)}
              className={cn(
                'rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors',
                filter === f.id ? 'border-accent bg-accent-bg text-accent-text' : 'border-border bg-card text-muted hover:text-ink',
              )}
            >
              {f.label} · {n}
            </button>
          )
        })}
      </div>
      <Input className="mb-3 max-w-sm" placeholder="Search name, mobile or email" value={q} onChange={(e) => setQ(e.target.value)} />

      {shown.length === 0 ? (
        <Card className="text-sm text-muted">Nothing here.</Card>
      ) : (
        <div className="flex flex-col gap-2">
          {shown.map((r) => (
            <Link key={r.user_id} to={`/admin/compliance/${r.user_id}`} className="block">
              <Card className="flex flex-wrap items-center justify-between gap-3 p-4 transition-colors hover:bg-surface sm:p-4">
                <div className="min-w-0">
                  <p className="truncate font-semibold text-ink">{r.legal_name || '(no name yet)'}</p>
                  <p className="truncate text-xs text-muted">
                    {[r.contact_name, r.mobile, r.email].filter(Boolean).join(' · ')}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  {r.is_applicant && <Badge tone="info">New shop{r.requested_plan ? ` · ${r.requested_plan}` : ''}</Badge>}
                  {r.grandfathered && <Badge tone="neutral">Existing shop</Badge>}
                  {r.terminated_at && <Badge tone="danger">Terminated</Badge>}
                  <Badge tone={STATUS_TONE[r.status]}>{STATUS_LABEL[r.status]}</Badge>
                  <span className="text-xs text-muted">{r.submitted_at ? `Sent ${fmtDate(r.submitted_at)}` : ''}</span>
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}

const KIND_LABEL: Record<TextVersion['kind'], string> = {
  agreement: 'Supplier Agreement',
  declaration: 'Declaration',
  order_disclosure: 'Disclosure shown to customers',
  admin_notice: 'Admin notice',
}

function LegalTexts() {
  const { session } = useAuth()
  const [versions, setVersions] = useState<TextVersion[] | null>(null)
  const [failed, setFailed] = useState(false)
  const [editing, setEditing] = useState<TextVersion | null>(null)
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = () => listTextVersions().then(setVersions, () => setFailed(true))
  useEffect(() => {
    listTextVersions().then(setVersions, () => setFailed(true))
  }, [])

  if (failed) return <Card className="text-sm text-red-600">Could not load the texts.</Card>
  if (!versions) return <TruckLoader label="Loading…" />

  const groups = new Map<string, TextVersion[]>()
  for (const v of versions) {
    const k = `${v.kind}:${v.key}`
    groups.set(k, [...(groups.get(k) ?? []), v])
  }

  function open(v: TextVersion) {
    setEditing(v)
    setTitle(v.title)
    setBody(v.body)
    setError(null)
  }

  async function publish() {
    if (!editing || !session) return
    if (!title.trim() || !body.trim()) return setError('Title and wording are both needed.')
    if (title.trim() === editing.title && body.trim() === editing.body) return setError('Nothing changed.')
    setBusy(true)
    setError(null)
    try {
      await publishTextVersion(editing.kind, editing.key, title, body, session.user.id)
      setEditing(null)
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not publish.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-muted">
        A published version is never edited — changing the wording publishes a new version, and suppliers who accepted an
        older one keep their record of exactly what they accepted. A new version of the agreement or a declaration shows
        in each shop&rsquo;s KYC screen, waiting to be accepted; it does not change any shop&rsquo;s status by itself.
      </p>
      {[...groups.entries()].map(([k, list]) => {
        const active = list.find((v) => v.is_active) ?? list[0]
        return (
          <Card key={k} className="p-4 sm:p-5">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted">
                  {KIND_LABEL[active.kind]}
                  {active.kind === 'declaration' ? ` ${active.key.replace(/^d/, '')}` : ''}
                </p>
                <p className="font-semibold text-ink">{active.title}</p>
                <p className="text-xs text-muted">
                  Version {active.version} in force{list.length > 1 ? ` · ${list.length} versions` : ''} · since {fmtDate(active.created_at)}
                </p>
              </div>
              <Button size="sm" variant="outline" onClick={() => open(active)}>
                New version
              </Button>
            </div>
            <p className="mt-2 line-clamp-3 whitespace-pre-line text-sm text-muted">{active.body}</p>
          </Card>
        )
      })}

      {editing && (
        <Modal title={`New version of: ${KIND_LABEL[editing.kind]}`} onClose={() => setEditing(null)}>
          <div className="flex flex-col gap-3">
            <div>
              <Label htmlFor="lt-title">Title</Label>
              <Input id="lt-title" value={title} maxLength={200} onChange={(e) => setTitle(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="lt-body">Wording</Label>
              <textarea
                id="lt-body"
                value={body}
                maxLength={60000}
                onChange={(e) => setBody(e.target.value)}
                className="vh-cap-55 min-h-48 w-full rounded-lg border border-border bg-card p-3 text-sm text-ink"
              />
            </div>
            <p className="text-xs text-muted">This becomes version {Math.max(...(groups.get(`${editing.kind}:${editing.key}`) ?? []).map((v) => v.version)) + 1}.</p>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setEditing(null)}>
                Cancel
              </Button>
              <Button disabled={busy} onClick={() => void publish()}>
                {busy ? 'Publishing…' : 'Publish'}
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}

function Retention() {
  const [rows, setRows] = useState<RetentionRow[] | null>(null)
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    listRetention().then(setRows, () => setFailed(true))
  }, [])
  if (failed) return <Card className="text-sm text-red-600">Could not load the settings.</Card>
  if (!rows) return <TruckLoader label="Loading…" />
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-muted">
        How long each kind of record is meant to be kept. Nothing is deleted automatically — these are the periods you have
        decided on, to be set with legal advice. Leave a period empty for “keep until decided”.
      </p>
      {rows.map((r) => (
        <RetentionCard key={r.record_type} row={r} />
      ))}
    </div>
  )
}

function RetentionCard({ row }: { row: RetentionRow }) {
  const [years, setYears] = useState(row.keep_years?.toString() ?? '')
  const [note, setNote] = useState(row.note ?? '')
  const [base, setBase] = useState({ years: row.keep_years?.toString() ?? '', note: row.note ?? '' })
  const [state, setState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const changed = years !== base.years || note !== base.note
  const bad = years !== '' && !(Number.isInteger(Number(years)) && Number(years) >= 1 && Number(years) <= 100)

  async function save() {
    setState('saving')
    try {
      await saveRetention(row.record_type, years === '' ? null : Number(years), note)
      setBase({ years, note })
      setState('saved')
    } catch {
      setState('error')
    }
  }

  return (
    <Card className="p-4 sm:p-5">
      <p className="mb-2 font-semibold text-ink">{row.label}</p>
      <div className="grid gap-3 sm:grid-cols-[8rem_1fr_auto] sm:items-end">
        <div>
          <Label htmlFor={`ry-${row.record_type}`}>Keep for (years)</Label>
          <Input
            id={`ry-${row.record_type}`}
            inputMode="numeric"
            value={years}
            placeholder="Until decided"
            onChange={(e) => {
              setYears(e.target.value.replace(/\D/g, '').slice(0, 3))
              setState('idle')
            }}
          />
        </div>
        <div>
          <Label htmlFor={`rn-${row.record_type}`}>Note</Label>
          <Input id={`rn-${row.record_type}`} value={note} maxLength={500} onChange={(e) => { setNote(e.target.value); setState('idle') }} />
        </div>
        <Button disabled={!changed || bad || state === 'saving'} onClick={() => void save()}>
          {state === 'saving' ? 'Saving…' : 'Save'}
        </Button>
      </div>
      {bad && <p className="mt-1 text-xs text-red-600">Between 1 and 100 years.</p>}
      {state === 'saved' && <p className="mt-1 text-xs text-accent-text">Saved.</p>}
      {state === 'error' && <p className="mt-1 text-xs text-red-600">Could not save.</p>}
    </Card>
  )
}
