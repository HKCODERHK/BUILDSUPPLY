import { Modal } from '@/components/ui/modal'
import { Button } from '@/components/ui/button'
import { SuccessHeader } from '@/components/SuccessTick'
import { useLanguage } from '@/context/LanguageContext'
import { isFirstInvoice } from '@/services/invoices'

export interface SavedBill {
  id: string
  invoice_no: string
  total: number
  customerName: string
}

function formatINR(n: number) {
  return `₹${n.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`
}

/**
 * Shown the moment a bill is saved, from New Invoice or from an estimate
 * turned into a bill. The tick confirms the save — a supplier's very first
 * bill says so — and then it asks the one thing saving could not know: whether
 * the material has left the godown. Stock moves on delivery, not on billing.
 */
export function DeliveryPrompt({
  bill,
  busy,
  onAnswer,
}: {
  bill: SavedBill
  busy: boolean
  onAnswer: (delivered: boolean) => void
}) {
  const { t } = useLanguage()
  const first = isFirstInvoice(bill)
  const detail = [first ? bill.invoice_no : '', bill.customerName, formatINR(bill.total)].filter(Boolean).join(' · ')

  return (
    <Modal title={t('inv.delivery')} onClose={() => onAnswer(false)}>
      <SuccessHeader title={first ? t('inv.firstBillTitle') : t('inv.savedTitle', { no: bill.invoice_no })} detail={detail} />
      <p className="mt-4 border-t border-border pt-4 text-sm font-medium text-ink">{t('inv.deliveryQuestion')}</p>
      <p className="mt-1 mb-4 text-xs text-muted">{t('inv.deliveryHint')}</p>
      <div className="flex gap-2">
        <Button className="flex-1" disabled={busy} onClick={() => onAnswer(true)}>
          {t('inv.deliveredYes')}
        </Button>
        <Button variant="outline" className="flex-1" disabled={busy} onClick={() => onAnswer(false)}>
          {t('inv.deliveredNot')}
        </Button>
      </div>
    </Modal>
  )
}
