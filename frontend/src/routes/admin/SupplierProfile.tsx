import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { PageHeader } from '@/components/layout/PageHeader'
import { Card, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Modal } from '@/components/ui/modal'
import { listSuppliersOverview, setSupplierStatus, resetSupplierPassword, updateSupplierSubscription } from '@/services/adminSuppliers'
import { listActivity } from '@/services/activityLog'
import type { ActivityLogEntry, SupplierOverview } from '@/lib/database.types'

type Tab = 'overview' | 'activity'

export default function SupplierProfile() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [supplier, setSupplier] = useState<SupplierOverview | null>(null)
  const [activity, setActivity] = useState<ActivityLogEntry[]>([])
  const [tab, setTab] = useState<Tab>('overview')
  const [loading, setLoading] = useState(true)
  const [suspendModal, setSuspendModal] = useState(false)
  const [suspendReason, setSuspendReason] = useState('')
  const [passwordModal, setPasswordModal] = useState(false)
  const [newPassword, setNewPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [feedback, setFeedback] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  function describeError(err: unknown) {
    return err instanceof Error ? err.message : 'Something went wrong. Please try again.'
  }

  async function refresh() {
    if (!id) return
    const [all, activityRows] = await Promise.all([listSuppliersOverview(), listActivity(id)])
    setSupplier(all.find((s) => s.id === id) ?? null)
    setActivity(activityRows)
  }

  useEffect(() => {
    refresh().finally(() => setLoading(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  async function handleActivate() {
    if (!id) return
    setBusy(true)
    setActionError(null)
    try {
      await setSupplierStatus(id, 'active')
      setFeedback('Supplier activated.')
      await refresh()
    } catch (err) {
      setActionError(describeError(err))
    } finally {
      setBusy(false)
    }
  }

  async function handleSuspend() {
    if (!id) return
    setBusy(true)
    setActionError(null)
    try {
      await setSupplierStatus(id, 'suspended', { suspensionReason: suspendReason || undefined })
      setFeedback('Supplier suspended.')
      setSuspendModal(false)
      setSuspendReason('')
      await refresh()
    } catch (err) {
      setActionError(describeError(err))
    } finally {
      setBusy(false)
    }
  }

  async function handleDeactivate() {
    if (!id) return
    setBusy(true)
    setActionError(null)
    try {
      await setSupplierStatus(id, 'inactive')
      setFeedback('Supplier deactivated. Their business data is preserved.')
      await refresh()
    } catch (err) {
      setActionError(describeError(err))
    } finally {
      setBusy(false)
    }
  }

  async function handleResetPassword() {
    if (!id || newPassword.length < 6) return
    setBusy(true)
    setActionError(null)
    try {
      await resetSupplierPassword(id, newPassword)
      setFeedback('Password reset successfully.')
      setPasswordModal(false)
      setNewPassword('')
    } catch (err) {
      setActionError(describeError(err))
    } finally {
      setBusy(false)
    }
  }

  async function handleSubscriptionChange(
    field: 'subscription_start' | 'subscription_expiry' | 'plan' | 'subscription_status',
    value: string,
  ) {
    if (!id) return
    setActionError(null)
    try {
      await updateSupplierSubscription(id, { [field]: value } as never)
      await refresh()
    } catch (err) {
      setActionError(describeError(err))
    }
  }

  if (loading) return <p className="text-sm text-muted">Loading…</p>
  if (!supplier) return <p className="text-sm text-muted">Supplier not found.</p>

  return (
    <div>
      <PageHeader
        title={supplier.business_name}
        subtitle={supplier.email ?? ''}
        action={
          <Button variant="outline" onClick={() => navigate('/admin/suppliers')}>
            Back to suppliers
          </Button>
        }
      />

      {feedback && <Card className="mb-4 bg-accent-bg text-sm text-accent-text">{feedback}</Card>}
      {actionError && <Card className="mb-4 bg-red-50 text-sm text-red-700">{actionError}</Card>}

      <div className="mb-4 flex gap-2">
        <button
          onClick={() => setTab('overview')}
          className={`rounded-full border px-3 py-1 text-xs font-medium ${tab === 'overview' ? 'border-accent bg-accent-bg text-accent-text' : 'border-border text-muted'}`}
        >
          Overview
        </button>
        <button
          onClick={() => setTab('activity')}
          className={`rounded-full border px-3 py-1 text-xs font-medium ${tab === 'activity' ? 'border-accent bg-accent-bg text-accent-text' : 'border-border text-muted'}`}
        >
          Activity Log
        </button>
      </div>

      {tab === 'overview' ? (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Business Info</CardTitle>
              <Badge tone={supplier.status === 'active' ? 'success' : supplier.status === 'suspended' ? 'warning' : 'neutral'}>
                {supplier.status}
              </Badge>
            </CardHeader>
            <dl className="flex flex-col gap-2 text-sm">
              <Row label="Owner" value={supplier.owner_name ?? '—'} />
              <Row label="Phone" value={supplier.phone ?? '—'} />
              <Row label="Address" value={supplier.address ?? '—'} />
              <Row label="Registered" value={new Date(supplier.created_at).toLocaleString('en-IN')} />
              <Row label="Last login" value={supplier.last_sign_in_at ? new Date(supplier.last_sign_in_at).toLocaleString('en-IN') : 'Never logged in'} />
              {supplier.suspension_reason && <Row label="Suspension reason" value={supplier.suspension_reason} />}
            </dl>

            <div className="mt-5 flex flex-wrap gap-2 border-t border-border pt-4">
              {supplier.status !== 'active' && (
                <Button size="sm" onClick={handleActivate} disabled={busy}>
                  {supplier.status === 'suspended' ? 'Reactivate' : 'Activate'}
                </Button>
              )}
              {supplier.status === 'active' && (
                <Button size="sm" variant="outline" onClick={() => setSuspendModal(true)} disabled={busy}>
                  Suspend
                </Button>
              )}
              {supplier.status !== 'inactive' && (
                <Button size="sm" variant="danger" onClick={handleDeactivate} disabled={busy}>
                  Deactivate
                </Button>
              )}
              <Button size="sm" variant="outline" onClick={() => setPasswordModal(true)} disabled={busy}>
                Reset password
              </Button>
            </div>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Subscription</CardTitle>
            </CardHeader>
            <div className="flex flex-col gap-3 text-sm">
              <div>
                <Label>Plan</Label>
                <select
                  value={supplier.plan}
                  onChange={(e) => handleSubscriptionChange('plan', e.target.value)}
                  className="h-10 w-full rounded-lg border border-border bg-white px-3 text-sm outline-none focus:border-accent"
                >
                  <option value="starter">Starter</option>
                  <option value="pro">Pro</option>
                </select>
              </div>
              <div>
                <Label>Start date</Label>
                <Input
                  type="date"
                  value={supplier.subscription_start ?? ''}
                  onChange={(e) => handleSubscriptionChange('subscription_start', e.target.value)}
                />
              </div>
              <div>
                <Label>Expiry date</Label>
                <Input
                  type="date"
                  value={supplier.subscription_expiry ?? ''}
                  onChange={(e) => handleSubscriptionChange('subscription_expiry', e.target.value)}
                />
              </div>
              <div>
                <Label>Subscription status</Label>
                <select
                  value={supplier.subscription_status}
                  onChange={(e) => handleSubscriptionChange('subscription_status', e.target.value)}
                  className="h-10 w-full rounded-lg border border-border bg-white px-3 text-sm outline-none focus:border-accent"
                >
                  <option value="active">Active</option>
                  <option value="expired">Expired</option>
                  <option value="cancelled">Cancelled</option>
                </select>
              </div>
            </div>
          </Card>
        </div>
      ) : (
        <Card>
          <div className="flex flex-col divide-y divide-border">
            {activity.length === 0 && <p className="py-3 text-sm text-muted">No activity recorded yet.</p>}
            {activity.map((a) => (
              <div key={a.id} className="py-2.5 text-sm">
                <div className="flex items-center justify-between">
                  <span className="font-medium text-ink">{a.action.replace(/_/g, ' ')}</span>
                  <span className="text-xs text-muted">{new Date(a.created_at).toLocaleString('en-IN')}</span>
                </div>
                <div className="text-xs text-muted">by {a.actor_role}</div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {suspendModal && (
        <Modal title="Suspend supplier" onClose={() => setSuspendModal(false)}>
          <div className="flex flex-col gap-4">
            <p className="text-sm text-muted">
              This immediately blocks {supplier.business_name} from signing in. Their business data is kept.
            </p>
            <div>
              <Label htmlFor="reason">Reason (optional)</Label>
              <Input id="reason" value={suspendReason} onChange={(e) => setSuspendReason(e.target.value)} />
            </div>
            {actionError && <p className="text-xs text-red-600">{actionError}</p>}
            <Button variant="danger" onClick={handleSuspend} disabled={busy}>
              {busy ? 'Suspending…' : 'Confirm suspend'}
            </Button>
          </div>
        </Modal>
      )}

      {passwordModal && (
        <Modal title="Reset supplier password" onClose={() => setPasswordModal(false)}>
          <div className="flex flex-col gap-4">
            <div>
              <Label htmlFor="new_password">New password</Label>
              <Input id="new_password" minLength={6} value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
            </div>
            {actionError && <p className="text-xs text-red-600">{actionError}</p>}
            <Button onClick={handleResetPassword} disabled={busy || newPassword.length < 6}>
              {busy ? 'Resetting…' : 'Reset password'}
            </Button>
          </div>
        </Modal>
      )}
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <dt className="text-muted">{label}</dt>
      <dd className="font-medium text-ink">{value}</dd>
    </div>
  )
}
