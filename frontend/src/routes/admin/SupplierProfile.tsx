import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Phone } from 'lucide-react'
import { PageHeader } from '@/components/layout/PageHeader'
import { Card, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Modal } from '@/components/ui/modal'
import {
  listSuppliersOverview,
  setSupplierStatus,
  resetSupplierPassword,
  updateSupplierSubscription,
  markSupplierContacted,
  deleteSupplierAccount,
} from '@/services/adminSuppliers'
import { listSupplierActivityForAdmin } from '@/services/activityLog'
import { usePin } from '@/context/PinContext'
import { useLanguage } from '@/context/LanguageContext'
import { WhatsAppIcon } from '@/components/icons/WhatsAppIcon'
import { openWhatsAppShare } from '@/lib/whatsapp'
import { generatePassword } from '@/lib/generatePassword'
import {
  describeExpiry,
  renewedExpiry,
  subscriptionState,
  SUBSCRIPTION_LABEL,
  SUBSCRIPTION_TONE,
} from '@/lib/subscription'
import type { AdminActivityEntry, SupplierOverview } from '@/lib/database.types'
import { TruckLoader } from '@/components/TruckLoader'

type Tab = 'overview' | 'activity'

export default function SupplierProfile() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { confirmWithPin } = usePin()
  const { t } = useLanguage()
  const [supplier, setSupplier] = useState<SupplierOverview | null>(null)
  const [activity, setActivity] = useState<AdminActivityEntry[]>([])
  const [tab, setTab] = useState<Tab>('overview')
  const [loading, setLoading] = useState(true)
  const [suspendModal, setSuspendModal] = useState(false)
  const [suspendReason, setSuspendReason] = useState('')
  const [passwordModal, setPasswordModal] = useState(false)
  const [newPassword, setNewPassword] = useState('')
  // The password that was successfully applied — kept so it can be handed
  // over on WhatsApp. Cleared when the modal closes.
  const [passwordSent, setPasswordSent] = useState('')
  const [deleteModal, setDeleteModal] = useState(false)
  const [deleteConfirmName, setDeleteConfirmName] = useState('')
  const [busy, setBusy] = useState(false)
  const [feedback, setFeedback] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  function describeError(err: unknown) {
    return err instanceof Error ? err.message : 'Something went wrong. Please try again.'
  }

  async function refresh() {
    if (!id) return
    const [all, activityRows] = await Promise.all([listSuppliersOverview(), listSupplierActivityForAdmin(id)])
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
    if (!id || !supplier) return
    // Suspending signs the supplier out of their own business, so it gets
    // the same confirmation as anything else that cannot be shrugged off.
    if (!(await confirmWithPin(t('pin.reasonSuspend', { name: supplier.business_name })))) return
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
    if (!id || !supplier) return
    if (!(await confirmWithPin(t('pin.reasonDeactivate', { name: supplier.business_name })))) return
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
    if (!id || !supplier || newPassword.length < 6) return
    if (!(await confirmWithPin(t('pin.reasonResetPassword', { name: supplier.business_name })))) return
    setBusy(true)
    setActionError(null)
    try {
      await resetSupplierPassword(id, newPassword)
      setFeedback('Password reset successfully.')
      setPasswordSent(newPassword)
      setNewPassword('')
    } catch (err) {
      setActionError(describeError(err))
    } finally {
      setBusy(false)
    }
  }

  // One tap instead of working out a date and typing it. Extends from the
  // current expiry so renewing early doesn't waste days already paid for,
  // and from today if the subscription already lapsed.
  async function handleRenew(months: number) {
    if (!id || !supplier) return
    if (!(await confirmWithPin(t('pin.reasonSubscription', { name: supplier.business_name })))) return
    setBusy(true)
    setActionError(null)
    try {
      const nextExpiry = renewedExpiry(supplier.subscription_expiry, months)
      await updateSupplierSubscription(id, {
        subscription_expiry: nextExpiry,
        subscription_status: 'active',
      })
      setFeedback(`Renewed for ${months} month${months === 1 ? '' : 's'} — now expires ${nextExpiry}.`)
      await refresh()
    } catch (err) {
      setActionError(describeError(err))
    } finally {
      setBusy(false)
    }
  }

  async function noteContact() {
    if (!id) return
    try {
      await markSupplierContacted(id)
      await refresh()
    } catch {
      // Reaching out matters more than recording that we did.
    }
  }

  function messageSupplier() {
    if (!supplier) return
    void noteContact()
    const owner = supplier.owner_name?.trim() || supplier.business_name
    const state = subscriptionState(supplier.subscription_expiry)
    const line =
      state === 'expired'
        ? 'Your BuildSupply subscription has expired. Reply here and I will renew it for you.'
        : state === 'expiring'
          ? `Your BuildSupply subscription ${describeExpiry(supplier.subscription_expiry).toLowerCase()}. Shall I renew it?`
          : 'Checking in about your BuildSupply account.'
    openWhatsAppShare(supplier.phone, `Hi ${owner}, ${line}`)
  }

  // The only action in the app that destroys a whole business. Three things
  // stand in front of it: the typed business name, the confirmation PIN, and
  // a plain list of what is about to go.
  async function handleDelete() {
    if (!id || !supplier) return
    if (deleteConfirmName.trim() !== supplier.business_name.trim()) {
      setActionError('The typed business name does not match.')
      return
    }
    if (!(await confirmWithPin(`permanently delete ${supplier.business_name}`))) return
    setBusy(true)
    setActionError(null)
    try {
      const result = await deleteSupplierAccount(id, deleteConfirmName.trim())
      const rows = Object.values(result.deleted).reduce((sum, n) => sum + n, 0)
      navigate('/admin/suppliers', {
        replace: true,
        state: {
          deleted: `${result.business_name} was deleted, along with ${rows} record${rows === 1 ? '' : 's'}.` +
            (result.warning ? ` ${result.warning}` : ''),
        },
      })
    } catch (err) {
      setActionError(describeError(err))
      setBusy(false)
    }
  }

  async function handleSubscriptionChange(
    field: 'subscription_start' | 'subscription_expiry' | 'plan' | 'subscription_status',
    value: string,
  ) {
    if (!id || !supplier) return
    if (!(await confirmWithPin(t('pin.reasonSubscription', { name: supplier.business_name })))) return
    setActionError(null)
    try {
      await updateSupplierSubscription(id, { [field]: value } as never)
      await refresh()
    } catch (err) {
      setActionError(describeError(err))
    }
  }

  if (loading) return <TruckLoader label="Loading…" />
  if (!supplier) return <p className="text-sm text-muted">Supplier not found.</p>

  return (
    <div>
      <PageHeader
        title={supplier.business_name}
        subtitle={supplier.email ?? ''}
        action={
          <div className="flex flex-wrap gap-2">
            {supplier.phone && (
              <>
                <a href={`tel:${supplier.phone}`} onClick={() => void noteContact()}>
                  <Button variant="outline" size="sm">
                    <Phone size={14} /> Call
                  </Button>
                </a>
                <Button variant="outline" size="sm" onClick={messageSupplier}>
                  <WhatsAppIcon size={14} /> WhatsApp
                </Button>
              </>
            )}
            <Button variant="outline" size="sm" onClick={() => navigate('/admin/suppliers')}>
              Back to suppliers
            </Button>
          </div>
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
              <Row
                label="Last contacted"
                value={supplier.last_contacted_at ? new Date(supplier.last_contacted_at).toLocaleString('en-IN') : 'Not yet'}
              />
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

            <div className="mt-4 rounded-xl border border-red-200 p-3 dark:border-red-900">
              <div className="text-sm font-semibold text-red-700 dark:text-red-300">Delete permanently</div>
              <p className="mt-1 text-xs text-muted">
                Erases this account and everything in it. Deactivate instead if you only want to switch off access —
                that keeps their data.
              </p>
              <Button
                size="sm"
                variant="danger"
                className="mt-3"
                disabled={busy}
                onClick={() => {
                  setDeleteConfirmName('')
                  setActionError(null)
                  setDeleteModal(true)
                }}
              >
                Delete supplier
              </Button>
            </div>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Subscription</CardTitle>
              <Badge tone={SUBSCRIPTION_TONE[subscriptionState(supplier.subscription_expiry)]}>
                {SUBSCRIPTION_LABEL[subscriptionState(supplier.subscription_expiry)]}
              </Badge>
            </CardHeader>

            {subscriptionState(supplier.subscription_expiry) === 'none' && (
              <p className="mb-4 rounded-lg bg-amber-50 p-3 text-xs text-amber-700 dark:bg-amber-950 dark:text-amber-300">
                No expiry date is set, so this account never appears as expiring or expired. Renew below to put it on
                the calendar.
              </p>
            )}

            <div className="mb-4 rounded-xl border border-border p-3">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-sm font-medium text-ink">Renew</span>
                <span className="text-xs text-muted">{describeExpiry(supplier.subscription_expiry)}</span>
              </div>
              <div className="flex flex-wrap gap-2">
                {[1, 3, 6, 12].map((months) => (
                  <Button key={months} size="sm" variant="outline" disabled={busy} onClick={() => handleRenew(months)}>
                    +{months} {months === 1 ? 'month' : 'months'}
                  </Button>
                ))}
              </div>
            </div>

            <div className="flex flex-col gap-3 text-sm">
              <div>
                <Label>Plan</Label>
                <select
                  value={supplier.plan}
                  onChange={(e) => handleSubscriptionChange('plan', e.target.value)}
                  className="h-10 w-full rounded-lg border border-border bg-card px-3 text-sm outline-none focus:border-accent"
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
                  className="h-10 w-full rounded-lg border border-border bg-card px-3 text-sm outline-none focus:border-accent"
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
                {/* Only ever populated for the admin's own actions — see
                    migration 020. This is what makes the renewal history
                    readable: plan changes and new expiry dates. */}
                {a.details && Object.keys(a.details).length > 0 && (
                  <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted">
                    {Object.entries(a.details).map(([key, value]) => (
                      <span key={key}>
                        {key.replace(/_/g, ' ')}: <span className="text-ink">{String(value)}</span>
                      </span>
                    ))}
                  </div>
                )}
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

      {deleteModal && (
        <Modal
          title={`Delete ${supplier.business_name}?`}
          onClose={() => {
            setDeleteModal(false)
            setActionError(null)
          }}
        >
          <div className="flex flex-col gap-4">
            <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
              This cannot be undone. Their login stops working immediately and every record below is erased.
            </p>
            <ul className="list-disc space-y-1 pl-5 text-xs text-muted">
              <li>Their customers and the whole khata</li>
              <li>Every bill, line item and payment</li>
              <li>Their materials, stock and estimates</li>
              <li>Their logo and activity history</li>
            </ul>
            <div>
              <Label htmlFor="delete-confirm">Type {supplier.business_name} to confirm</Label>
              <Input
                id="delete-confirm"
                autoComplete="off"
                value={deleteConfirmName}
                onChange={(e) => setDeleteConfirmName(e.target.value)}
              />
            </div>
            {actionError && <p className="text-xs text-red-600">{actionError}</p>}
            <div className="flex gap-2">
              <Button
                variant="outline"
                className="flex-1"
                disabled={busy}
                onClick={() => {
                  setDeleteModal(false)
                  setActionError(null)
                }}
              >
                Keep supplier
              </Button>
              <Button
                variant="danger"
                className="flex-1"
                disabled={busy || deleteConfirmName.trim() !== supplier.business_name.trim()}
                onClick={handleDelete}
              >
                {busy ? 'Deleting…' : 'Delete permanently'}
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {passwordModal && (
        <Modal
          title="Reset supplier password"
          onClose={() => {
            setPasswordModal(false)
            setPasswordSent('')
            setNewPassword('')
          }}
        >
          <div className="flex flex-col gap-4">
            <div>
              <div className="flex items-center justify-between">
                <Label htmlFor="new_password" className="mb-1.5">
                  New password
                </Label>
                <button
                  type="button"
                  onClick={() => setNewPassword(generatePassword())}
                  className="mb-1.5 text-xs font-semibold text-accent hover:text-accent-soft"
                >
                  Generate
                </button>
              </div>
              <Input
                id="new_password"
                minLength={6}
                className="font-mono"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
              />
            </div>
            {actionError && <p className="text-xs text-red-600">{actionError}</p>}
            <div className="flex flex-wrap gap-2">
              <Button onClick={handleResetPassword} disabled={busy || newPassword.length < 6}>
                {busy ? 'Resetting…' : 'Reset password'}
              </Button>
              {/* Sent only after the reset actually succeeds, so the supplier
                  never gets a password that was not applied. */}
              {supplier.phone && passwordSent && (
                <Button
                  variant="outline"
                  onClick={() =>
                    openWhatsAppShare(
                      supplier.phone,
                      `Hi ${supplier.owner_name?.trim() || supplier.business_name}, your BuildSupply password has been reset.

Login: ${supplier.email}
Password: ${passwordSent}

Please change it from Settings after you sign in.`,
                    )
                  }
                >
                  <WhatsAppIcon size={16} /> Send on WhatsApp
                </Button>
              )}
            </div>
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
