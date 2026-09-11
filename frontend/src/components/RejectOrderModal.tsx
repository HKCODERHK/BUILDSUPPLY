import { useState } from 'react'
import { Modal } from '@/components/ui/modal'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { useLanguage } from '@/context/LanguageContext'
import { rejectOrder } from '@/services/orders'

/** Reject an online order, with an optional short reason. Nothing else changes. */
export function RejectOrderModal({ orderId, onClose, onRejected }: { orderId: string; onClose: () => void; onRejected: () => void }) {
  const { t } = useLanguage()
  const [reason, setReason] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function confirm() {
    if (saving) return
    setSaving(true)
    setError(null)
    try {
      await rejectOrder(orderId, reason)
      onRejected()
    } catch (err) {
      setError(err instanceof Error ? err.message : t('error.generic'))
      setSaving(false)
    }
  }

  return (
    <Modal title={t('ord.rejectTitle')} onClose={onClose}>
      <div className="flex flex-col gap-4">
        <div>
          <Label htmlFor="reject-reason">{t('ord.rejectReason')}</Label>
          <textarea
            id="reject-reason"
            rows={2}
            maxLength={200}
            placeholder={t('ord.rejectReasonPlaceholder')}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-ink placeholder:text-muted-2 outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
          />
        </div>
        <p className="text-xs text-muted">{t('ord.rejectNote')}</p>
        {error && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>
            {t('ord.cancel')}
          </Button>
          <Button variant="danger" onClick={confirm} disabled={saving}>
            {saving ? t('common.saving') : t('ord.reject')}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
