import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { LoaderCircle } from 'lucide-react'
import { Modal } from '@/components/ui/modal'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { WhatsAppIcon } from '@/components/icons/WhatsAppIcon'
import { QrCode } from '@/components/QrCode'
import { useAuth } from '@/context/AuthContext'
import { useLanguage } from '@/context/LanguageContext'
import { sanitizeDecimal } from '@/lib/numberInput'
import { qrPngFile } from '@/lib/qr'
import { shareDocumentOnWhatsApp } from '@/lib/shareDocument'
import { UPI_TYPICAL_LIMIT, upiPayUrl } from '@/lib/upi'
import type { Customer } from '@/lib/database.types'

function formatINR(n: number) {
  return `₹${n.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`
}

/**
 * Customer page → ⋯ → Show UPI QR (migration 029). For the day a customer
 * genuinely has no cash: the supplier types the amount, and a QR for exactly
 * that fills the screen for the customer to scan — or goes to them as an image
 * through the share sheet. The money lands in the supplier's own account;
 * nothing is recorded until the supplier uses Receive payment.
 */
export function UpiQrModal({
  customer,
  defaultAmount,
  onClose,
  onRecord,
}: {
  customer: Customer
  defaultAmount: number
  onClose: () => void
  /** "Money received? Record it": hands the amount to the page's own Receive payment, set to UPI. */
  onRecord?: (amount: number) => void
}) {
  const { supplier } = useAuth()
  const { t } = useLanguage()
  const navigate = useNavigate()
  const [amount, setAmount] = useState(defaultAmount > 0 ? String(defaultAmount) : '')
  const [shown, setShown] = useState<number | null>(null)
  const [sending, setSending] = useState(false)

  const upiId = supplier?.upi_id ?? null
  const value = Number(amount)
  const qrText = shown && upiId && supplier ? upiPayUrl({ upiId, payee: supplier.business_name, amount: shown, note: customer.name }) : null

  function show(e: FormEvent) {
    e.preventDefault()
    if (value > 0) setShown(Math.round(value * 100) / 100)
  }

  async function send() {
    if (!qrText || !shown || !supplier || sending) return
    setSending(true)
    try {
      const file = await qrPngFile({
        text: qrText,
        lines: [supplier.business_name, formatINR(shown)],
        caption: `${t('upi.imageCaption')} · ${upiId}`,
        filename: `upi-qr-${Math.round(shown)}.png`,
      })
      await shareDocumentOnWhatsApp({
        file,
        message: t('upi.qrMessage', { name: customer.name, amount: formatINR(shown), business: supplier.business_name }),
        title: 'UPI QR',
      })
    } finally {
      setSending(false)
    }
  }

  return (
    <Modal title={t('upi.qrTitle', { name: customer.name })} onClose={onClose}>
      {!upiId ? (
        <div className="flex flex-col items-start gap-3">
          <p className="text-sm text-ink">{t('upi.noId')}</p>
          <Button onClick={() => navigate('/settings', { replace: true })}>{t('upi.goSettings')}</Button>
        </div>
      ) : shown === null || !qrText ? (
        <form onSubmit={show} className="flex flex-col gap-3">
          <div>
            <Label htmlFor="upi-amount">{t('upi.amount')}</Label>
            <Input
              id="upi-amount"
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(sanitizeDecimal(e.target.value))}
              onFocus={(e) => e.target.select()}
            />
          </div>
          {value > UPI_TYPICAL_LIMIT && <p className="text-xs text-amber-700 dark:text-amber-400">{t('upi.limitNote')}</p>}
          <Button type="submit" disabled={!(value > 0)}>
            {t('upi.generate')}
          </Button>
        </form>
      ) : (
        <div className="flex flex-col items-center gap-3 text-center">
          <div className="rounded-xl bg-white p-2">
            <QrCode text={qrText} size={240} label={t('upi.showQr')} />
          </div>
          <div>
            <div className="text-sm font-medium text-ink">{supplier?.business_name}</div>
            <div className="text-2xl font-bold text-ink">{formatINR(shown)}</div>
            <div className="text-xs text-muted">{upiId}</div>
          </div>
          <p className="text-xs text-muted">{t('upi.scanHint')}</p>
          <div className="flex flex-wrap justify-center gap-2">
            <Button size="sm" onClick={send} disabled={sending}>
              {sending ? <LoaderCircle size={14} className="animate-spin" /> : <WhatsAppIcon size={14} />} {t('upi.sendQr')}
            </Button>
            <Button size="sm" variant="outline" onClick={() => setShown(null)}>
              {t('upi.change')}
            </Button>
          </div>
          {onRecord ? (
            <div className="flex w-full flex-col gap-2 border-t border-border pt-3">
              <Button onClick={() => onRecord(shown)}>{t('upi.recordNow')}</Button>
              <p className="text-xs text-muted">{t('upi.recordHint')}</p>
            </div>
          ) : (
            <p className="border-t border-border pt-3 text-xs text-muted">{t('upi.recordHint')}</p>
          )}
        </div>
      )}
    </Modal>
  )
}
