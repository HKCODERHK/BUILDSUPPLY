import { useRef, useState, type FormEvent } from 'react'
import { Modal } from '@/components/ui/modal'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { SuccessHeader } from '@/components/SuccessTick'
import { correctPayment, correctionState, type CorrectionResult } from '@/services/payments'
import { newRequestId } from '@/services/db'
import type { Payment, PaymentMode } from '@/lib/database.types'
import { sanitizeDecimal } from '@/lib/numberInput'
import { useLanguage } from '@/context/LanguageContext'
import { usePin } from '@/context/PinContext'

const MODES: PaymentMode[] = ['Cash', 'UPI', 'Bank/Cheque']

function formatINR(n: number) {
  return `₹${Math.abs(n).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}

/**
 * Correcting a payment entered by mistake (migration 052): the wrong amount
 * typed, the wrong mode picked, or money that never came. Nothing is edited
 * or deleted — the database adds a reversal entry and, when there is a right
 * amount, a receipt for it — so the dialog says so before anything is saved.
 *
 * `all` is the list the payment came from, so the dialog can tell a
 * reversal, or an entry already corrected, from one that can still be.
 */
export function PaymentCorrectionModal({
  payment,
  all,
  customerName,
  onClose,
  onCorrected,
}: {
  payment: Payment
  all: Payment[]
  customerName: string
  onClose: () => void
  onCorrected: (result: CorrectionResult) => void
}) {
  const { t } = useLanguage()
  const { confirmWithPin } = usePin()
  const state = correctionState(payment, all)
  const amount = Number(payment.amount)
  const [kind, setKind] = useState<'mistake' | 'change'>('change')
  const [newAmount, setNewAmount] = useState(String(amount))
  const [newMode, setNewMode] = useState<PaymentMode>(MODES.includes(payment.mode) ? payment.mode : 'Cash')
  const [reason, setReason] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<CorrectionResult | null>(null)
  // One id for this correction, kept through a failed attempt: pressing Save
  // again after a lost answer records it once.
  const requestId = useRef(newRequestId())
  const busy = useRef(false)

  const right = kind === 'mistake' ? 0 : Number(newAmount) || 0
  const unchanged = kind === 'change' && right === amount && newMode === payment.mode
  const canSave = reason.trim().length >= 3 && !unchanged && (kind === 'mistake' || right > 0)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!canSave || busy.current) return
    busy.current = true
    try {
      if (!(await confirmWithPin(t('pin.reasonCorrectPayment', { amount: formatINR(amount) })))) return
      setSaving(true)
      setError(null)
      const result = await correctPayment(
        requestId.current,
        payment.id,
        reason.trim(),
        kind === 'mistake' ? null : right,
        kind === 'mistake' ? null : newMode,
      )
      setDone(result)
      onCorrected(result)
    } catch (err) {
      const message = err instanceof Error ? err.message : ''
      // A database without 052 has no such function.
      setError(/correct_payment|PGRST202|schema cache/i.test(message) ? t('corr.unavailable') : message || t('error.generic'))
    } finally {
      busy.current = false
      setSaving(false)
    }
  }

  return (
    <Modal title={t('corr.title')} onClose={onClose}>
      <div className="flex flex-col gap-4">
        {/* What the entry is, whatever happens next. */}
        <div className="rounded-lg bg-surface p-3 text-sm">
          <div className="flex items-baseline justify-between gap-3">
            <span className="font-semibold text-ink">{customerName}</span>
            <span className={`shrink-0 font-bold ${amount < 0 ? 'text-red-600' : 'text-ink'}`}>
              {amount < 0 ? '−' : ''}
              {formatINR(amount)}
            </span>
          </div>
          <div className="mt-0.5 text-xs text-muted">
            {t(`mode.${payment.mode}`)} · {formatDate(payment.created_at)}
          </div>
          {payment.correction_reason && (
            <div className="mt-1 text-xs text-muted">{t('corr.reasonLine', { reason: payment.correction_reason })}</div>
          )}
        </div>

        {done ? (
          <div className="flex flex-col gap-3">
            <SuccessHeader
              title={t('corr.done')}
              detail={
                done.correctedTo == null
                  ? t('corr.doneCancelled', { amount: formatINR(done.reversed) })
                  : t('corr.doneChanged', { old: formatINR(done.reversed), new: formatINR(done.correctedTo) })
              }
            />
            <div className="flex justify-between border-t border-border pt-3 text-sm">
              <span className="text-muted">{t('common.pending')}</span>
              <span className={`font-semibold ${done.pending > 0.005 ? 'text-red-600' : 'text-accent'}`}>
                {done.pending > 0.005 ? formatINR(done.pending) : t('cust.settled')}
              </span>
            </div>
            {done.advanceBalance > 0.005 && (
              <p className="rounded-lg bg-accent-bg p-3 text-xs font-medium text-accent-text">
                {t('pay.keptAsAdvance', { amount: formatINR(done.advanceBalance) })}
              </p>
            )}
            <Button onClick={onClose}>{t('common.done')}</Button>
          </div>
        ) : state === 'reversal' ? (
          <p className="text-sm text-muted">{t('corr.isReversal', { amount: formatINR(amount) })}</p>
        ) : state === 'reversed' ? (
          <p className="text-sm text-muted">{t('corr.alreadyCorrected')}</p>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <p className="text-xs text-muted">{t('corr.intro')}</p>
            {error && (
              <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
                {error}
              </p>
            )}
            <fieldset className="flex flex-col gap-2">
              <legend className="sr-only">{t('corr.title')}</legend>
              {(['change', 'mistake'] as const).map((k) => (
                <label
                  key={k}
                  className={`flex cursor-pointer items-center gap-3 rounded-lg border p-3 text-sm ${
                    kind === k ? 'border-accent bg-accent-bg text-accent-text' : 'border-border text-ink'
                  }`}
                >
                  <input
                    type="radio"
                    name="correction-kind"
                    value={k}
                    checked={kind === k}
                    onChange={() => setKind(k)}
                    className="accent-[var(--color-accent)]"
                  />
                  <span className="font-medium">{k === 'change' ? t('corr.wrongAmount') : t('corr.mistake')}</span>
                </label>
              ))}
            </fieldset>

            {kind === 'change' && (
              <div>
                <Label htmlFor="correct-amount" className="mb-1.5">
                  {t('corr.rightAmount')}
                </Label>
                <div className="flex items-center gap-2">
                  <Input
                    id="correct-amount"
                    type="text"
                    inputMode="decimal"
                    value={newAmount}
                    onChange={(e) => setNewAmount(sanitizeDecimal(e.target.value))}
                  />
                  <select
                    aria-label={t('common.mode')}
                    value={newMode}
                    onChange={(e) => setNewMode(e.target.value as PaymentMode)}
                    className="h-10 shrink-0 rounded-lg border border-border bg-card px-2 text-sm outline-none focus:border-accent"
                  >
                    {MODES.map((m) => (
                      <option key={m} value={m}>
                        {t(`mode.${m}`)}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            )}

            <div>
              <Label htmlFor="correct-reason" className="mb-1.5">
                {t('corr.reason')}
              </Label>
              <Input
                id="correct-reason"
                type="text"
                maxLength={200}
                placeholder={t('corr.reasonHint')}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
            </div>

            <Button type="submit" disabled={saving || !canSave}>
              {saving ? t('corr.saving') : t('corr.save')}
            </Button>
          </form>
        )}
      </div>
    </Modal>
  )
}
